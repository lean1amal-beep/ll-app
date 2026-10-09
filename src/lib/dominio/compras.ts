// Compras antigas conhecidas (pedidos reais enviados pelo Leandro em 09/10) e o plano para aplicá-las.
import { montarCorrecaoCusto, montarGasto, type Contexto } from "./lancar";
import type { CategoriaGasto, Lancamento } from "./tipos";
import { dataParaISO } from "./datas";

export interface LinhaGasto {
  incluir: boolean;
  descricao: string;
  categoria: CategoriaGasto;
  valor: number | null;
  dia: string;
  estimado: boolean;
}

export const GASTOS_INICIAIS: LinhaGasto[] = [
  // Pedidos reais de camisas lisas (valores com frete/passagem, enviados pelo Leandro em 09/10)
  { incluir: true, descricao: "20 camisas Sol do Saara (R$ 20 + R$ 15 metrô)", categoria: "camisa_lisa", valor: 41500, dia: "2026-04-13", estimado: false },
  { incluir: true, descricao: "11 camisas Zimm #12223", categoria: "camisa_lisa", valor: 21834, dia: "2026-07-13", estimado: false },
  { incluir: true, descricao: "12 camisas Zimm #12905", categoria: "camisa_lisa", valor: 25304, dia: "2026-08-05", estimado: false },
  { incluir: true, descricao: "4 camisas Zimm #14459", categoria: "camisa_lisa", valor: 10259, dia: "2026-09-13", estimado: false },
  { incluir: true, descricao: "3 camisas Zimm (plus size, feminina, 2ª linha)", categoria: "camisa_lisa", valor: 7090, dia: "2026-06-15", estimado: true },
  { incluir: true, descricao: "40 camisas Agostinho (R$ 20 + R$ 15 metrô)", categoria: "camisa_lisa", valor: 81500, dia: "2026-03-13", estimado: false },
  { incluir: true, descricao: "2 packs de imagens", categoria: "marketing", valor: 5000, dia: "2026-04-10", estimado: false },
  { incluir: true, descricao: "DTF pedido de 10 camisas", categoria: "dtf", valor: 6000, dia: "2026-07-10", estimado: false },
  { incluir: false, descricao: "Outros DTF (mar a out)", categoria: "dtf", valor: null, dia: "2026-06-15", estimado: true },
  { incluir: false, descricao: "Filme DTF Mercado Livre", categoria: "dtf", valor: null, dia: "2026-10-01", estimado: true },
];

/** Custo médio real da lisa: 90 camisas, R$ 1.874,87 com frete/passagem. */
export const CUSTO_REAL_LISA = 2083;

/** Marca na config para não aplicar duas vezes. */
export const MIGRACAO_COMPRAS = "compras_reais_2026_10";

export interface PlanoCompras {
  criar: Lancamento[];
  /** Lançamentos estimados antigos que os pedidos reais substituem */
  apagar: string[];
  correcao: Lancamento | null;
}

const normal = (s: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Lança os gastos antigos que ainda não existem (compara pela descrição),
 * apaga o chute "~35 camisas" e corrige o custo das lisas no estoque.
 */
export function planoComprasReais(lancamentos: Lancamento[], ctx: Contexto, custo = CUSTO_REAL_LISA): PlanoCompras {
  const ativos = lancamentos.filter((l) => !l.deleted_at);
  const existe = new Set(ativos.filter((l) => l.tipo === "gasto" || l.tipo === "investimento").map((l) => normal(l.descricao)));
  const criar = GASTOS_INICIAIS.filter((g) => g.incluir && g.valor && !existe.has(normal(g.descricao))).map((g) =>
    montarGasto({
      categoria: g.categoria,
      valor_centavos: g.valor!,
      pago_por: "leandro",
      descricao: g.descricao,
      historico: true,
      confianca: g.estimado ? "estimado" : "confirmado",
      data: dataParaISO(g.dia),
    }),
  );
  const apagar = ativos.filter((l) => l.tipo === "gasto" && l.historico && /~\s*35 camisas/i.test(l.descricao ?? "")).map((l) => l.id);
  return { criar, apagar, correcao: montarCorrecaoCusto("lisa", custo, ctx, { confianca: "estimado" }) };
}
