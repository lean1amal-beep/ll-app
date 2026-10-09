// Leitura reativa e gravação dos dados locais. Toda gravação marca como pendente e dispara o sync.
"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { db } from "./db";
import { calcularEstoque } from "./dominio/estoque";
import type { Contexto } from "./dominio/lancar";
import { CONFIG_PADRAO, type Campanha, type Config, type Lancamento, type Produto } from "./dominio/tipos";
import { sincronizar } from "./sync";

const agoraISO = () => new Date().toISOString();

export function useLancamentos(): Lancamento[] | undefined {
  return useLiveQuery(() => db.lancamentos.toArray());
}

export function useProdutos(): Produto[] | undefined {
  return useLiveQuery(async () => {
    const lista = await db.produtos.toArray();
    return lista.filter((p) => !p.deleted_at).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
  });
}

export function useCampanhas(): Campanha[] | undefined {
  return useLiveQuery(async () => {
    const lista = await db.campanhas.toArray();
    return lista.filter((c) => !c.deleted_at).sort((a, b) => b.inicio.localeCompare(a.inicio));
  });
}

/** Mescla com o padrão: campos novos de versões futuras ganham valor padrão. */
export function mesclarConfig(dados?: Partial<Config> | null): Config {
  const d = dados ?? {};
  return {
    ...CONFIG_PADRAO,
    ...d,
    taxas: { ...CONFIG_PADRAO.taxas, ...d.taxas },
    custos_referencia: { ...CONFIG_PADRAO.custos_referencia, ...d.custos_referencia },
    estoque_minimo: { ...CONFIG_PADRAO.estoque_minimo, ...d.estoque_minimo },
    acerto: { ...CONFIG_PADRAO.acerto, ...d.acerto },
  };
}

export function useConfig(): Config | undefined {
  const c = useLiveQuery(async () => (await db.config.get("config")) ?? null);
  return useMemo(() => (c === undefined ? undefined : mesclarConfig(c?.dados)), [c]);
}

export interface Dados {
  lancamentos: Lancamento[];
  produtos: Produto[];
  campanhas: Campanha[];
  config: Config;
  ctx: Contexto;
  campanhaAtiva: Campanha | null;
}

/** Tudo de uma vez (undefined enquanto carrega). */
export function useDados(): Dados | undefined {
  const lancamentos = useLancamentos();
  const produtos = useProdutos();
  const campanhas = useCampanhas();
  const config = useConfig();
  return useMemo(() => {
    if (!lancamentos || !produtos || !campanhas || !config) return undefined;
    const ativos = lancamentos.filter((l) => !l.deleted_at);
    return {
      lancamentos: ativos,
      produtos,
      campanhas,
      config,
      ctx: { estoque: calcularEstoque(ativos), config, produtos },
      campanhaAtiva: campanhas.find((c) => c.ativa) ?? null,
    };
  }, [lancamentos, produtos, campanhas, config]);
}

// ─── Gravação ────────────────────────────────────────────────────────────────

export async function salvarLancamento(l: Lancamento) {
  await db.lancamentos.put({ ...l, updated_at: agoraISO(), _pendente: 1 });
  void sincronizar();
}

export async function apagarLancamento(id: string) {
  const agora = agoraISO();
  await db.lancamentos.update(id, { deleted_at: agora, updated_at: agora, _pendente: 1 });
  void sincronizar();
}

export async function restaurarLancamento(id: string) {
  await db.lancamentos.update(id, { deleted_at: null, updated_at: agoraISO(), _pendente: 1 });
  void sincronizar();
}

export async function salvarProduto(p: Produto) {
  await db.produtos.put({ ...p, updated_at: agoraISO(), _pendente: 1 });
  void sincronizar();
}

export async function salvarCampanha(c: Campanha) {
  const agora = agoraISO();
  await db.transaction("rw", db.campanhas, async () => {
    // Só uma campanha ativa por vez.
    if (c.ativa) {
      const outras = await db.campanhas.filter((x) => x.ativa && x.id !== c.id).toArray();
      for (const o of outras) await db.campanhas.update(o.id, { ativa: false, updated_at: agora, _pendente: 1 });
    }
    await db.campanhas.put({ ...c, updated_at: agora, _pendente: 1 });
  });
  void sincronizar();
}

export async function salvarConfig(mudar: (c: Config) => Config) {
  const atual = await db.config.get("config");
  const dados = mudar(mesclarConfig(atual?.dados));
  await db.config.put({ id: "config", dados, updated_at: agoraISO(), _pendente: 1 });
  void sincronizar();
}

export async function anexarComprovante(lancamentoId: string, blob: Blob) {
  await db.arquivos.put({ id: lancamentoId, blob, tipo: blob.type || "image/jpeg" });
  void sincronizar();
}
