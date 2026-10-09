// Sincronização: envia o que está pendente no aparelho e baixa o que mudou no Supabase.
// Cada lançamento tem UUID gerado no aparelho, então reenviar é seguro (upsert).
import { db, gravarMeta, lerMeta } from "./db";
import { supabase, SUPABASE_ATIVO } from "./supabase";

export interface EstadoSync {
  sincronizando: boolean;
  pendentes: number;
  erro: string | null;
  ultima: string | null;
  online: boolean;
}

let estado: EstadoSync = {
  sincronizando: false,
  pendentes: 0,
  erro: null,
  ultima: null,
  online: typeof navigator === "undefined" ? true : navigator.onLine,
};
const ouvintes = new Set<() => void>();

export function estadoSync() {
  return estado;
}
export function ouvirSync(f: () => void) {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}
function mudar(p: Partial<EstadoSync>) {
  estado = { ...estado, ...p };
  ouvintes.forEach((f) => f());
}

export async function contarPendentes(): Promise<number> {
  const [l, p, c, cf, a] = await Promise.all([
    db.lancamentos.where("_pendente").equals(1).count(),
    db.produtos.where("_pendente").equals(1).count(),
    db.campanhas.where("_pendente").equals(1).count(),
    db.config.where("_pendente").equals(1).count(),
    db.arquivos.count(),
  ]);
  const n = l + p + c + cf + a;
  mudar({ pendentes: n });
  return n;
}

const TABELAS = ["lancamentos", "produtos", "campanhas"] as const;
type NomeTabela = (typeof TABELAS)[number];

function semLocal<T extends object>(r: T) {
  const { _pendente, ...resto } = r as T & { _pendente?: number };
  return resto;
}

function semRemoto(r: Record<string, unknown>) {
  const { user_id, sincronizado_em, ...resto } = r;
  return resto;
}

let emAndamento: Promise<void> | null = null;
let deNovo = false;

/** Dispara a sincronização (se já estiver rodando, roda de novo no final). */
export function sincronizar(): Promise<void> {
  if (emAndamento) {
    deNovo = true;
    return emAndamento;
  }
  emAndamento = (async () => {
    do {
      deNovo = false;
      await rodada();
    } while (deNovo);
  })().finally(() => {
    emAndamento = null;
  });
  return emAndamento;
}

async function rodada() {
  await contarPendentes();
  const sb = supabase();
  if (!SUPABASE_ATIVO || !sb) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    mudar({ online: false });
    return;
  }
  const { data } = await sb.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return;
  mudar({ sincronizando: true, erro: null, online: true });
  try {
    await enviarArquivos(uid);
    for (const t of TABELAS) await enviar(t, uid);
    await enviarConfig(uid);
    for (const t of TABELAS) await baixar(t);
    await baixarConfig();
    mudar({ ultima: new Date().toISOString() });
  } catch (e) {
    mudar({ erro: e instanceof Error ? e.message : String(e) });
  } finally {
    mudar({ sincronizando: false });
    await contarPendentes();
  }
}

async function enviar(t: NomeTabela, uid: string) {
  const sb = supabase()!;
  const tabela = db[t];
  const pendentes = await tabela.where("_pendente").equals(1).toArray();
  for (let i = 0; i < pendentes.length; i += 200) {
    const lote = pendentes.slice(i, i + 200);
    const { error } = await sb.from(t).upsert(
      lote.map((r) => ({ ...semLocal(r), user_id: uid })),
      { onConflict: "id" },
    );
    if (error) throw new Error(`${t}: ${error.message}`);
    await db.transaction("rw", tabela, async () => {
      for (const r of lote) {
        const atual = await tabela.get(r.id);
        // Só marca como enviado se não mudou enquanto enviava.
        if (atual && atual.updated_at === r.updated_at) await tabela.update(r.id, { _pendente: 0 });
      }
    });
  }
}

async function enviarConfig(uid: string) {
  const sb = supabase()!;
  const c = await db.config.get("config");
  if (!c || c._pendente !== 1) return;
  const { error } = await sb
    .from("configuracoes")
    .upsert({ user_id: uid, dados: c.dados, updated_at: c.updated_at }, { onConflict: "user_id" });
  if (error) throw new Error(`configuracoes: ${error.message}`);
  const atual = await db.config.get("config");
  if (atual && atual.updated_at === c.updated_at) await db.config.update("config", { _pendente: 0 });
}

async function enviarArquivos(uid: string) {
  const sb = supabase()!;
  const arquivos = await db.arquivos.toArray();
  for (const a of arquivos) {
    const caminho = `${uid}/${a.id}.${a.tipo.includes("png") ? "png" : "jpg"}`;
    const { error } = await sb.storage.from("comprovantes").upload(caminho, a.blob, { upsert: true, contentType: a.tipo });
    if (error) throw new Error(`comprovante: ${error.message}`);
    const l = await db.lancamentos.get(a.id);
    if (l) await db.lancamentos.update(a.id, { comprovante_url: caminho, updated_at: new Date().toISOString(), _pendente: 1 });
    await db.arquivos.delete(a.id);
  }
}

async function baixar(t: NomeTabela) {
  const sb = supabase()!;
  const tabela = db[t];
  const chave = `ultimo_${t}`;
  let desde = (await lerMeta(chave)) ?? "1970-01-01T00:00:00Z";
  for (;;) {
    const { data, error } = await sb
      .from(t)
      .select("*")
      .gt("sincronizado_em", desde)
      .order("sincronizado_em", { ascending: true })
      .limit(500);
    if (error) throw new Error(`${t}: ${error.message}`);
    if (!data?.length) break;
    await db.transaction("rw", tabela, async () => {
      for (const remoto of data as Record<string, unknown>[]) {
        const local = await tabela.get(remoto.id as string);
        if (local && local._pendente === 1 && local.updated_at > (remoto.updated_at as string)) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await tabela.put({ ...(semRemoto(remoto) as any), _pendente: 0 });
      }
    });
    desde = data[data.length - 1].sincronizado_em as string;
    await gravarMeta(chave, desde);
    if (data.length < 500) break;
  }
}

async function baixarConfig() {
  const sb = supabase()!;
  const { data, error } = await sb.from("configuracoes").select("dados, updated_at").maybeSingle();
  if (error) throw new Error(`configuracoes: ${error.message}`);
  if (!data) return;
  const local = await db.config.get("config");
  if (local && (local._pendente === 1 || local.updated_at >= data.updated_at)) return;
  await db.config.put({ id: "config", dados: data.dados, updated_at: data.updated_at, _pendente: 0 });
}

/** Liga a sincronização automática: ao abrir, ao voltar a internet e a cada 2 minutos. */
export function iniciarSyncAutomatico(): () => void {
  const online = () => {
    mudar({ online: true });
    void sincronizar();
  };
  const offline = () => mudar({ online: false });
  const visivel = () => {
    if (document.visibilityState === "visible") void sincronizar();
  };
  window.addEventListener("online", online);
  window.addEventListener("offline", offline);
  document.addEventListener("visibilitychange", visivel);
  const timer = window.setInterval(() => void sincronizar(), 120_000);
  void sincronizar();
  return () => {
    window.removeEventListener("online", online);
    window.removeEventListener("offline", offline);
    document.removeEventListener("visibilitychange", visivel);
    window.clearInterval(timer);
  };
}

/** Ao sair da conta: apaga os dados locais (só se não houver nada pendente). */
export async function limparLocal() {
  await Promise.all([
    db.lancamentos.clear(),
    db.produtos.clear(),
    db.campanhas.clear(),
    db.config.clear(),
    db.arquivos.clear(),
    db.meta.clear(),
  ]);
}
