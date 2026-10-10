// Compras antigas conhecidas (pedidos reais enviados pelo Leandro em 09/10) e o plano para aplicá-las.
import { montarCorrecaoCusto, montarGasto, montarSaida, montarVenda, type Contexto } from "./lancar";
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

/** DTF comprado no Mercado Livre (prints enviados em 09/10). */
export const DTF_MERCADO_LIVRE: LinhaGasto[] = [
  { incluir: true, descricao: "DTF Mercado Livre Mimaki 100×60 cm", categoria: "dtf", valor: 3790, dia: "2026-04-14", estimado: false },
  { incluir: true, descricao: "DTF Mercado Livre 1 m (57×100) jun", categoria: "dtf", valor: 3990, dia: "2026-06-23", estimado: false },
  { incluir: true, descricao: "DTF Mercado Livre Mimaki 100×60 cm jul", categoria: "dtf", valor: 3790, dia: "2026-07-20", estimado: false },
  { incluir: true, descricao: "DTF Mercado Livre 1 m (57×100) ago", categoria: "dtf", valor: 4990, dia: "2026-08-27", estimado: false },
  { incluir: true, descricao: "DTF Mercado Livre 1 m (57×100) set", categoria: "dtf", valor: 5318, dia: "2026-09-14", estimado: false },
];

/** Custo médio real da lisa: 90 camisas, R$ 1.874,87 com frete/passagem. */
export const CUSTO_REAL_LISA = 2083;

/** Pacote de dados para aplicar com um toque (fica marcado em config.migracoes). */
/** Venda antiga (antes do app): entra no resultado, sem mexer no caixa nem no estoque. */
export interface LinhaVenda {
  descricao: string;
  dia: string;
  qtd: number;
  /** Preço por peça */
  preco: number;
  /** Custo total (0 para camisas: o custo já está nas compras antigas) */
  custo?: number;
  canal?: string | null;
  estimado?: boolean;
}

export interface Migracao {
  id: string;
  titulo: string;
  resumo: string;
  linhas: LinhaGasto[];
  vendas?: LinhaVenda[];
  /** Retirada em produto (uso próprio + presentes), estimada */
  retirada?: { qtd: number; dia: string; descricao: string };
  /** Apaga lançamentos antigos ("antes do app") cuja descrição bate com este padrão (chutes substituídos). */
  substitui?: RegExp;
  /** Corrige o custo das lisas no estoque e o custo de referência. */
  custoLisa?: number;
  /** Passos do acerto inicial que este pacote resolve (padrão: 6, gastos antigos). */
  passos?: number[];
}

/** Vendas reconstruídas pelo extrato do Nubank + memória do Leandro (10/10). 47 camisas. */
export const VENDAS_ANTIGAS: LinhaVenda[] = [
  { descricao: "3 camisas para duas amigas (começo)", dia: "2026-03-30", qtd: 3, preco: 5000, estimado: true },
  { descricao: "Minas 05/04 (4 camisas)", dia: "2026-04-05", qtd: 4, preco: 7000, canal: "Show" },
  { descricao: "Ruan (2 camisas)", dia: "2026-04-09", qtd: 2, preco: 7000 },
  { descricao: "Minas 19-20/04 a R$ 50", dia: "2026-04-19", qtd: 3, preco: 5000, canal: "Show" },
  { descricao: "Minas 19-20/04 a R$ 60", dia: "2026-04-20", qtd: 1, preco: 6000, canal: "Show" },
  { descricao: "Minas 19-20/04 a R$ 70", dia: "2026-04-20", qtd: 4, preco: 7000, canal: "Show" },
  { descricao: "Minas 19-20/04 a R$ 80", dia: "2026-04-20", qtd: 2, preco: 8000, canal: "Show" },
  { descricao: "Tallison (2 camisas)", dia: "2026-05-01", qtd: 2, preco: 5500 },
  { descricao: "Pablo (1 camisa)", dia: "2026-05-02", qtd: 1, preco: 8000 },
  { descricao: "Livia (1 camisa)", dia: "2026-05-12", qtd: 1, preco: 5000 },
  { descricao: "Lívia (2 camisas)", dia: "2026-05-16", qtd: 2, preco: 5000 },
  { descricao: "Leandro Lima (1 camisa)", dia: "2026-06-03", qtd: 1, preco: 5000 },
  { descricao: "Igor (1 camisa)", dia: "2026-07-02", qtd: 1, preco: 6000 },
  { descricao: "Dárison (5 camisas)", dia: "2026-07-25", qtd: 5, preco: 4000 },
  { descricao: "Rock in Rio: Paula (2 camisas)", dia: "2026-08-31", qtd: 2, preco: 6000, canal: "Show" },
  { descricao: "Rock in Rio: Mariana (1 camisa)", dia: "2026-09-02", qtd: 1, preco: 6000, canal: "Show" },
  { descricao: "Igor: boné", dia: "2026-09-09", qtd: 1, preco: 4000, custo: 3000 },
  { descricao: "Igor: 3 personalizadas femininas", dia: "2026-09-14", qtd: 3, preco: 6000 },
  { descricao: "Rock in Rio: Maria Luisa (2 camisas, 1 com defeito)", dia: "2026-09-16", qtd: 2, preco: 3750, canal: "Show" },
  { descricao: "Natanael (2 camisas)", dia: "2026-09-22", qtd: 2, preco: 6000, estimado: true },
  { descricao: "5 camisas a preço de custo (faltam R$ 60 a receber)", dia: "2026-10-06", qtd: 5, preco: 4000 },
];

/** As 3 femininas compradas na loja para o pedido do Igor (R$ 40 cada). */
export const FEMININAS_IGOR: LinhaGasto[] = [
  { incluir: true, descricao: "3 femininas compradas na loja (pedido do Igor)", categoria: "camisa_lisa", valor: 12000, dia: "2026-09-12", estimado: false },
];

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
  {
    id: "vendas_antigas_2026_10",
    titulo: "Lançar as vendas antigas (fev a out)",
    resumo: "47 camisas e 1 boné, R$ 2.665 (conferido com o extrato do Nubank), as 3 femininas do Igor (R$ 120) e 12 camisas retiradas (uso próprio e presentes). Substitui o que o acerto inicial tinha de abril, boné e uso próprio.",
    linhas: FEMININAS_IGOR,
    vendas: VENDAS_ANTIGAS,
    retirada: { qtd: 12, dia: "2026-08-15", descricao: "Uso próprio e presentes (antes do app)" },
    substitui: /show abril|venda-teste|uso próprio antes do app|^Camisas? show abril/i,
    passos: [4, 5],
  },
  {
    id: "dtf_mercadolivre_2026_10",
    titulo: "Lançar o DTF do Mercado Livre",
    resumo: "5 compras de abr a set, R$ 218,78 do seu bolso.",
    linhas: DTF_MERCADO_LIVRE,
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
  const existeVenda = new Set(ativos.filter((l) => l.tipo === "venda").map((l) => normal(l.descricao)));
  for (const v of m.vendas ?? []) {
    if (existeVenda.has(normal(v.descricao))) continue;
    criar.push(
      montarVenda(
        {
          produto_id: null,
          descricao: v.descricao,
          preco_unitario_centavos: v.preco,
          quantidade: v.qtd,
          forma_pagamento: "pix",
          historico: true,
          cpv_manual_centavos: v.custo ?? 0,
          canal: v.canal ?? null,
          confianca: v.estimado ? "estimado" : "confirmado",
          data: dataParaISO(v.dia),
        },
        ctx,
      ),
    );
  }
  if (m.retirada && !ativos.some((l) => l.tipo === "retirada_produto" && normal(l.descricao) === normal(m.retirada!.descricao))) {
    const r = m.retirada;
    criar.push(montarSaida({ tipo: "retirada_produto", alvo: { item: "peca" }, quantidade: r.qtd, historico: true, confianca: "estimado", descricao: r.descricao, data: dataParaISO(r.dia) }, ctx));
  }
  // Chutes antigos substituídos (só lançamentos "antes do app" que não são deste pacote)
  const deste = new Set([...m.linhas.map((g) => normal(g.descricao)), ...(m.vendas ?? []).map((v) => normal(v.descricao)), normal(m.retirada?.descricao ?? null)]);
  const apagar = m.substitui
    ? ativos.filter((l) => l.historico && m.substitui!.test(l.descricao ?? "") && !deste.has(normal(l.descricao))).map((l) => l.id)
    : [];
  const correcao = m.custoLisa ? montarCorrecaoCusto("lisa", m.custoLisa, ctx, { confianca: "estimado" }) : null;
  return { criar, apagar, correcao };
}

/** Atalho usado nos testes: o pacote dos pedidos de camisas. */
export function planoComprasReais(lancamentos: Lancamento[], ctx: Contexto): PlanoCompras {
  return planoMigracao(MIGRACOES[0], lancamentos, ctx);
}
