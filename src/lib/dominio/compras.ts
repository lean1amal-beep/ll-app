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

/** Notas de DTF do Atacadão da Impressão (PDFs enviados em 09/10). A nota 589 (02/07, R$ 60) é o "DTF pedido de 10 camisas" já lançado. */
export const DTF_ATACADAO: LinhaGasto[] = [
  { incluir: true, descricao: "DTF Atacadão nº 619 (0,5 m)", categoria: "dtf", valor: 4000, dia: "2026-03-25", estimado: false },
  { incluir: true, descricao: "DTF Atacadão nº 68 (1,24 m)", categoria: "dtf", valor: 8060, dia: "2026-04-10", estimado: false },
  { incluir: true, descricao: "DTF Atacadão nº 328 (0,64 m)", categoria: "dtf", valor: 3840, dia: "2026-05-13", estimado: false },
  { incluir: true, descricao: "DTF Atacadão nº 696 (2 m)", categoria: "dtf", valor: 12000, dia: "2026-07-15", estimado: false },
  { incluir: true, descricao: "DTF Atacadão nº 122 (1 m, com desconto)", categoria: "dtf", valor: 5000, dia: "2026-09-03", estimado: false },
];

/** Custo médio real da lisa: 90 camisas, R$ 1.874,87 com frete/passagem. */
export const CUSTO_REAL_LISA = 2083;

/** Pacote de dados para aplicar com um toque (fica marcado em config.migracoes). */
export interface Migracao {
  id: string;
  titulo: string;
  resumo: string;
  linhas: LinhaGasto[];
  /** Apaga gastos antigos cuja descrição bate com este padrão (chutes substituídos). */
  substitui?: RegExp;
  /** Corrige o custo das lisas no estoque e o custo de referência. */
  custoLisa?: number;
}

export const MIGRACOES: Migracao[] = [
  {
    id: "compras_reais_2026_10",
    titulo: "Atualizar com os pedidos reais de camisas",
    resumo: "Pedidos do Agostinho, Sol do Saara e Zimm (do seu bolso), apaga o chute de “~35 camisas” e corrige o custo das lisas para R$ 20,83.",
    linhas: GASTOS_INICIAIS,
    substitui: /~\s*35 camisas/i,
    custoLisa: CUSTO_REAL_LISA,
  },
  {
    id: "dtf_atacadao_2026_10",
    titulo: "Lançar as notas de DTF (Atacadão da Impressão)",
    resumo: "5 notas de mar a set, R$ 329,00 do seu bolso. A de 02/07 (R$ 60) já estava lançada.",
    linhas: DTF_ATACADAO,
  },
];

/** Compatibilidade com o nome antigo */
export const MIGRACAO_COMPRAS = MIGRACOES[0].id;

export interface PlanoCompras {
  criar: Lancamento[];
  /** Lançamentos estimados antigos que os pedidos reais substituem */
  apagar: string[];
  correcao: Lancamento | null;
}

const normal = (s: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Lança os gastos antigos que ainda não existem (compara pela descrição),
 * apaga os chutes substituídos e (se pedido) corrige o custo das lisas no estoque.
 */
export function planoMigracao(m: Migracao, lancamentos: Lancamento[], ctx: Contexto): PlanoCompras {
  const ativos = lancamentos.filter((l) => !l.deleted_at);
  const existe = new Set(ativos.filter((l) => l.tipo === "gasto" || l.tipo === "investimento").map((l) => normal(l.descricao)));
  const criar = m.linhas
    .filter((g) => g.incluir && g.valor && !existe.has(normal(g.descricao)))
    .map((g) =>
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
  const apagar = m.substitui ? ativos.filter((l) => l.tipo === "gasto" && l.historico && m.substitui!.test(l.descricao ?? "")).map((l) => l.id) : [];
  const correcao = m.custoLisa ? montarCorrecaoCusto("lisa", m.custoLisa, ctx, { confianca: "estimado" }) : null;
  return { criar, apagar, correcao };
}

/** Atalho usado nos testes: o pacote dos pedidos de camisas. */
export function planoComprasReais(lancamentos: Lancamento[], ctx: Contexto): PlanoCompras {
  return planoMigracao(MIGRACOES[0], lancamentos, ctx);
}
