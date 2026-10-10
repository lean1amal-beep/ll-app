"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { useDados, type Dados } from "@/lib/dados";
import { db } from "@/lib/db";
import { fechar, ir, substituir, useRota } from "@/lib/rota";
import { SUPABASE_ATIVO, supabase } from "@/lib/supabase";
import { contarPendentes, iniciarSyncAutomatico, limparLocal, sincronizar } from "@/lib/sync";
import FormContagem from "./forms/FormContagem";
import { FormAjusteSaldo, FormAporte, FormPagamentoPai } from "./forms/FormDinheiro";
import FormGasto from "./forms/FormGasto";
import FormListaProntas from "./forms/FormListaProntas";
import FormPrensar from "./forms/FormPrensar";
import FormSaida from "./forms/FormSaida";
import FormVenda from "./forms/FormVenda";
import Acerto from "./telas/Acerto";
import Ajustes, { Calculadora, FormProduto } from "./telas/Ajustes";
import Campanhas, { TelaCampanha } from "./telas/Campanhas";
import Estoque from "./telas/Estoque";
import Historico, { DetalheLancamento } from "./telas/Historico";
import Importar from "./telas/Importar";
import Inicio from "./telas/Inicio";
import Login, { NovaSenha } from "./telas/Login";
import { Folha, Icone, ProvedorAvisos, cx } from "./ui";

const ABAS = [
  { rota: "", nome: "Início", icone: "inicio" },
  { rota: "estoque", nome: "Estoque", icone: "estoque" },
  { rota: "historico", nome: "Histórico", icone: "lista" },
  { rota: "campanhas", nome: "Campanhas", icone: "bandeira" },
  { rota: "ajustes", nome: "Ajustes", icone: "ajustes" },
];

const CHAVE_LOGADO = "ll-caixa-logado";

export default function App() {
  const [pronto, setPronto] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  // Veio do link "Esqueci minha senha" do e-mail: pede a senha nova.
  const [recuperando, setRecuperando] = useState(false);

  useEffect(() => {
    // Service worker: deixa o app abrir sem internet.
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    // Pede ao navegador para não apagar os dados locais.
    void navigator.storage?.persist?.();
    if (SUPABASE_ATIVO) {
      if (/type=recovery/.test(window.location.hash)) setRecuperando(true);
      // Usa a marca local (não depende de internet para abrir o app).
      setEmail(localStorage.getItem(CHAVE_LOGADO));
      const sb = supabase();
      sb?.auth.onAuthStateChange((evento, sessao) => {
        if (evento === "PASSWORD_RECOVERY") setRecuperando(true);
        if (sessao?.user.email && (evento === "PASSWORD_RECOVERY" || evento === "SIGNED_IN")) {
          localStorage.setItem(CHAVE_LOGADO, sessao.user.email);
          setEmail(sessao.user.email);
        }
      });
      sb
        ?.auth.getSession()
        .then(({ data }) => {
          if (data.session?.user.email) {
            localStorage.setItem(CHAVE_LOGADO, data.session.user.email);
            setEmail(data.session.user.email);
          }
        })
        .catch(() => {});
    }
    setPronto(true);
  }, []);

  useEffect(() => {
    if (!SUPABASE_ATIVO || email) return iniciarSyncAutomatico();
  }, [email]);

  if (!pronto) return <Carregando />;
  if (recuperando) return <NovaSenha aoTerminar={() => setRecuperando(false)} />;
  if (SUPABASE_ATIVO && !email)
    return (
      <Login
        aoEntrar={(e) => {
          localStorage.setItem(CHAVE_LOGADO, e);
          setEmail(e);
        }}
      />
    );

  return (
    <ProvedorAvisos>
      <Casca
        email={email}
        aoSair={async () => {
          const n = await contarPendentes();
          if (n > 0 && !confirm(`Há ${n} itens ainda não sincronizados. Se sair agora, eles se perdem. Sair mesmo?`)) return;
          await supabase()?.auth.signOut();
          await limparLocal();
          localStorage.removeItem(CHAVE_LOGADO);
          setEmail(null);
        }}
      />
    </ProvedorAvisos>
  );
}

function Carregando() {
  return <div className="min-h-dvh bg-tinta" />;
}

function Casca({ email, aoSair }: { email: string | null; aoSair: () => void }) {
  const dados = useDados();
  const rota = useRota();
  const [aba, setAba] = useState("");

  // A rota decide a aba (ex.: #/estoque) ou uma tela por cima (ex.: #/novo/venda).
  const partes = rota.split("/");
  const ehAba = ABAS.some((a) => a.rota === rota);
  useEffect(() => {
    if (ehAba) setAba(rota);
  }, [rota, ehAba]);

  if (!dados) return <Carregando />;

  const abaAtual = ABAS.find((a) => a.rota === aba) ?? ABAS[0];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 bg-papel/95 backdrop-blur border-b border-linha pt-[env(safe-area-inset-top)]">
        <div className="max-w-lg mx-auto px-4 min-h-14 flex items-center justify-between">
          <h1 className="text-xl font-bold">{abaAtual.rota === "" ? "LL Caixa" : abaAtual.nome}</h1>
          <IndicadorSync />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-4 pb-seguro">
        {aba === "" && <Inicio dados={dados} />}
        {aba === "estoque" && <Estoque dados={dados} />}
        {aba === "historico" && <Historico dados={dados} />}
        {aba === "campanhas" && <Campanhas dados={dados} />}
        {aba === "ajustes" && <Ajustes dados={dados} email={email} aoSair={aoSair} />}
      </main>

      {/* Botão + */}
      <button
        type="button"
        onClick={() => ir("novo")}
        aria-label="Lançar"
        className="fixed z-30 right-4 bottom-[calc(env(safe-area-inset-bottom)+5rem)] w-16 h-16 rounded-full bg-tinta text-papel shadow-xl flex items-center justify-center active:scale-95 transition"
      >
        <Icone nome="mais" className="w-8 h-8" />
      </button>

      {/* Abas */}
      <nav className="fixed z-30 bottom-0 inset-x-0 bg-papel border-t border-linha pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-lg mx-auto grid grid-cols-5">
          {ABAS.map((a) => (
            <button key={a.rota} type="button" onClick={() => substituir(a.rota)} className={cx("flex flex-col items-center justify-center min-h-16 gap-0.5 text-[11px]", a.rota === aba ? "text-tinta font-bold" : "text-cinza")}>
              <Icone nome={a.icone} className="w-6 h-6" />
              {a.nome}
            </button>
          ))}
        </div>
      </nav>

      {!ehAba && <Sobreposta dados={dados} partes={partes} />}
    </div>
  );
}

/** Telas por cima das abas, conforme a rota. */
function Sobreposta({ dados, partes }: { dados: Dados; partes: string[] }) {
  const [p0, p1, p2] = partes;
  const original = useLiveQuery(async () => (p0 === "editar" && p2 ? (await db.lancamentos.get(p2)) ?? null : null), [p0, p2]);
  if (p0 === "novo" && !p1) return <MenuNovo />;
  if (p0 === "novo" || p0 === "editar") {
    if (p0 === "editar" && original === undefined) return null;
    const o = original ?? undefined;
    const props = { dados, original: o };
    switch (p1) {
      case "venda":
        return <FormVenda {...props} />;
      case "gasto":
        return <FormGasto {...props} />;
      case "prensar":
        return <FormPrensar {...props} />;
      case "perda":
        return <FormSaida {...props} tipo="perda" />;
      case "retirada":
        return <FormSaida {...props} tipo="retirada" />;
      case "aporte":
        return <FormAporte {...props} />;
      case "pai":
        return <FormPagamentoPai {...props} />;
      case "saldo":
        return <FormAjusteSaldo {...props} />;
      case "contagem":
        return <FormContagem {...props} />;
      case "prontas":
        return <FormListaProntas {...props} />;
    }
  }
  if (p0 === "lanc" && p1) return <DetalheLancamento dados={dados} id={p1} />;
  if (p0 === "campanha" && p1) return <TelaCampanha key={p1} dados={dados} id={p1} />;
  if (p0 === "produto" && p1) return <FormProduto key={p1} dados={dados} id={p1} />;
  if (p0 === "calculadora") return <Calculadora dados={dados} />;
  if (p0 === "acerto") return <Acerto dados={dados} />;
  if (p0 === "importar") return <Importar dados={dados} />;
  return null;
}

function MenuNovo() {
  const op = (rota: string, nome: string, dica: string) => (
    <button key={rota} type="button" onClick={() => substituir(`novo/${rota}`)} className="text-left rounded-2xl border-2 border-linha p-4 active:scale-[0.98] transition">
      <div className="font-bold">{nome}</div>
      <div className="text-sm text-cinza leading-tight">{dica}</div>
    </button>
  );
  return (
    <Folha titulo="Lançar" aoFechar={fechar}>
      <button type="button" onClick={() => substituir("novo/venda")} className="w-full rounded-2xl bg-tinta text-papel p-6 text-left active:scale-[0.98] transition">
        <div className="text-2xl font-bold">Venda</div>
        <div className="opacity-60">Produto, preço e pagamento</div>
      </button>
      <div className="grid grid-cols-2 gap-3">
        {op("gasto", "Gasto", "Lisas, DTF, assinatura…")}
        {op("prensar", "Prensar", "Lisa + DTF → peça pronta")}
        {op("perda", "Perda / teste", "Estragou ou testou")}
        {op("retirada", "Retirada", "Dinheiro ou peça pra mim")}
        {op("aporte", "Aporte", "Coloquei dinheiro meu")}
        {op("pai", "Paguei meu pai", "Parcela da prensa")}
        {op("saldo", "Ajuste de saldo", "Bater com o Mercado Pago")}
        {op("contagem", "Contar estoque", "Corrigir quantidades")}
      </div>
    </Folha>
  );
}

function IndicadorSync() {
  const pendentes = useLiveQuery(async () => (await db.lancamentos.where("_pendente").equals(1).count()) + (await db.arquivos.count()), [], 0);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const atualizar = () => setOnline(navigator.onLine);
    atualizar();
    window.addEventListener("online", atualizar);
    window.addEventListener("offline", atualizar);
    return () => {
      window.removeEventListener("online", atualizar);
      window.removeEventListener("offline", atualizar);
    };
  }, []);
  if (!SUPABASE_ATIVO) return <span className="text-xs text-cinza border border-linha rounded-full px-2 py-1">modo local</span>;
  return (
    <button type="button" onClick={() => void sincronizar()} className="flex items-center gap-1.5 text-xs text-cinza min-h-10 px-2">
      <Icone nome={online ? "nuvem" : "semNuvem"} className="w-5 h-5" />
      {!online ? "offline" : pendentes > 0 ? `${pendentes} pendente${pendentes > 1 ? "s" : ""}` : "ok"}
    </button>
  );
}
