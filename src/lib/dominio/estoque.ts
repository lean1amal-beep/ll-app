import type { Config, ItemEstoque, Lancamento, Movimento } from "./tipos";

export interface PosicaoEstoque {
  chave: string;
  item: ItemEstoque;
  produto_id: string | null;
  cor: string | null;
  tamanho: string | null;
  quantidade: number;
  /** Custo médio ponderado (centavos por unidade). */
  custo_medio: number;
}

export type Estoque = Map<string, PosicaoEstoque>;

/** Normaliza o movimento: DTF e embalagem são genéricos; lisa não tem produto. */
export function normalizar(m: Pick<Movimento, "item" | "produto_id" | "cor" | "tamanho">) {
  const generico = m.item === "dtf" || m.item === "embalagem";
  return {
    item: m.item,
    produto_id: m.item === "pronta" ? m.produto_id ?? null : null,
    cor: generico ? null : m.cor || null,
    tamanho: generico ? null : m.tamanho || null,
  };
}

export function chaveEstoque(m: Pick<Movimento, "item" | "produto_id" | "cor" | "tamanho">): string {
  const n = normalizar(m);
  return [n.item, n.produto_id ?? "", n.cor ?? "", n.tamanho ?? ""].join("|");
}

/** Ordena lançamentos ativos por data (e criação) para reprocessar o estoque. */
export function ordenar(lancs: Lancamento[]): Lancamento[] {
  return lancs
    .filter((l) => !l.deleted_at)
    .slice()
    .sort((a, b) => a.data.localeCompare(b.data) || a.created_at.localeCompare(b.created_at));
}

/**
 * Reprocessa todos os movimentos e devolve a posição atual.
 * Custo médio ponderado: entradas recalculam a média; saídas não mudam a média.
 */
export function calcularEstoque(lancs: Lancamento[]): Estoque {
  const est: Estoque = new Map();
  for (const l of ordenar(lancs)) {
    for (const m of l.movimentos ?? []) {
      const chave = chaveEstoque(m);
      let p = est.get(chave);
      if (!p) {
        p = { chave, ...normalizar(m), quantidade: 0, custo_medio: 0 };
        est.set(chave, p);
      }
      if (m.quantidade > 0) {
        const base = Math.max(p.quantidade, 0);
        const total = base + m.quantidade;
        p.custo_medio = Math.round((base * p.custo_medio + m.quantidade * m.custo_unitario_centavos) / total);
      }
      p.quantidade += m.quantidade;
    }
  }
  return est;
}

export function valorPosicao(p: PosicaoEstoque): number {
  return Math.max(p.quantidade, 0) * p.custo_medio;
}

export function valorEstoque(est: Estoque): number {
  let v = 0;
  for (const p of est.values()) v += valorPosicao(p);
  return v;
}

export function quantidade(est: Estoque, m: Pick<Movimento, "item" | "produto_id" | "cor" | "tamanho">): number {
  return est.get(chaveEstoque(m))?.quantidade ?? 0;
}

/** Soma de um tipo de item (ex.: todas as lisas, todo o DTF). */
export function totalItem(est: Estoque, item: ItemEstoque, produto_id?: string): number {
  let q = 0;
  for (const p of est.values())
    if (p.item === item && (produto_id === undefined || p.produto_id === produto_id)) q += p.quantidade;
  return q;
}

/** O item já foi controlado alguma vez? (ex.: só baixa embalagem se ele controla embalagem) */
export function controla(est: Estoque, item: ItemEstoque): boolean {
  for (const p of est.values()) if (p.item === item) return true;
  return false;
}

export function custoReferencia(config: Config, item: ItemEstoque): number {
  const r = config.custos_referencia;
  if (item === "lisa") return r.lisa_centavos;
  if (item === "dtf") return r.dtf_centavos;
  if (item === "embalagem") return r.embalagem_centavos;
  return r.lisa_centavos + r.dtf_centavos + r.embalagem_centavos;
}

/**
 * Custo unitário atual de um item: média da posição exata; senão média do tipo de item
 * (ponderada pelas quantidades positivas); senão custo de referência.
 */
export function custoAtual(
  est: Estoque,
  config: Config,
  m: Pick<Movimento, "item" | "produto_id" | "cor" | "tamanho">,
): number {
  const exata = est.get(chaveEstoque(m));
  if (exata && exata.custo_medio > 0) return exata.custo_medio;
  let q = 0;
  let v = 0;
  let ultimo = 0;
  for (const p of est.values()) {
    if (p.item !== m.item) continue;
    if (m.item === "pronta" && m.produto_id && p.produto_id !== m.produto_id) continue;
    if (p.custo_medio > 0) ultimo = p.custo_medio;
    if (p.quantidade > 0) {
      q += p.quantidade;
      v += p.quantidade * p.custo_medio;
    }
  }
  if (q > 0 && v > 0) return Math.round(v / q);
  if (ultimo > 0) return ultimo;
  if (m.item === "pronta") return custoPecaMontada(est, config, m.cor ?? null, m.tamanho ?? null);
  return custoReferencia(config, m.item);
}

/** Custo de uma camiseta montada na hora: lisa + 1 estampa DTF + embalagem. */
export function custoPecaMontada(est: Estoque, config: Config, cor: string | null, tamanho: string | null): number {
  return (
    custoAtual(est, config, { item: "lisa", cor, tamanho }) +
    custoAtual(est, config, { item: "dtf" }) +
    custoAtual(est, config, { item: "embalagem" })
  );
}

export interface AlertaEstoque {
  chave: string;
  item: ItemEstoque;
  produto_id: string | null;
  cor: string | null;
  tamanho: string | null;
  quantidade: number;
  minimo: number;
}

/** Itens abaixo do mínimo. Lisas e prontas por posição; DTF e embalagem pelo total. */
export function alertasEstoque(est: Estoque, config: Config): AlertaEstoque[] {
  const out: AlertaEstoque[] = [];
  for (const p of est.values()) {
    const minimo = config.estoque_minimo[p.item] ?? 0;
    if (minimo > 0 && p.quantidade < minimo) out.push({ ...p, minimo });
  }
  return out;
}
