// Tipos centrais do LL Caixa. Dinheiro SEMPRE em centavos (inteiro).

export type TipoLancamento =
  | "venda"
  | "gasto"
  | "investimento"
  | "aporte"
  | "retirada_dinheiro"
  | "retirada_produto"
  | "pagamento_pai"
  | "perda"
  | "prensagem"
  | "ajuste_saldo"
  | "ajuste_estoque";

export type FormaPagamento = "pix" | "credito" | "debito" | "link" | "dinheiro";
export type ItemEstoque = "lisa" | "pronta" | "dtf" | "embalagem";
/** Quem pagou: a conta da marca (Mercado Pago), o Leandro do bolso, ou o pai. */
export type PagoPor = "marca" | "leandro" | "pai";
export type Confianca = "confirmado" | "estimado";
export type ModoVenda = "pronta" | "sob_demanda";
export type TipoProduto = "camiseta" | "bone" | "caneca" | "outro";

export type CategoriaGasto =
  | "camisa_lisa"
  | "dtf"
  | "embalagem"
  | "equipamento"
  | "assinatura"
  | "transporte"
  | "marketing"
  | "outro";

/** Categorias de gasto que viram estoque (não entram no resultado na hora). */
export const CATEGORIA_ESTOQUE: Partial<Record<CategoriaGasto, ItemEstoque>> = {
  camisa_lisa: "lisa",
  dtf: "dtf",
  embalagem: "embalagem",
};

export interface Movimento {
  item: ItemEstoque;
  produto_id?: string | null;
  /** Modelo da camisa (ex.: "Baby look"). Vazio = Tradicional. */
  modelo?: string | null;
  cor?: string | null;
  tamanho?: string | null;
  /** + entra no estoque, − sai */
  quantidade: number;
  custo_unitario_centavos: number;
}

export interface Lancamento {
  id: string;
  /** ISO 8601 (UTC). */
  data: string;
  tipo: TipoLancamento;
  /** Valor principal. Positivo, exceto ajuste_saldo e ajuste_estoque (podem ser negativos). */
  valor_centavos: number;
  taxa_centavos: number;
  /** Custo das peças (venda, perda, retirada de produto, prensagem). */
  cpv_centavos: number;
  forma_pagamento: FormaPagamento | null;
  categoria: string | null;
  produto_id: string | null;
  /** Nome livre (venda avulsa, origem do aporte, etc.) */
  descricao: string | null;
  /** Modelo da camisa (ex.: "Baby look"). Vazio = Tradicional. */
  modelo: string | null;
  cor: string | null;
  tamanho: string | null;
  quantidade: number;
  canal: string | null;
  modo_venda: ModoVenda | null;
  campanha_id: string | null;
  pago_por: PagoPor;
  eh_presente: boolean;
  /** Lançamento de antes do app: entra no resultado, mas não no caixa nem na reserva do pai. */
  historico: boolean;
  confianca: Confianca;
  /** Nome da conta fixa paga (ex.: "Nuvemshop"). */
  conta_fixa: string | null;
  observacao: string | null;
  comprovante_url: string | null;
  movimentos: Movimento[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Produto {
  id: string;
  nome: string;
  tipo: TipoProduto;
  /** Cor da camisa em que a estampa costuma sair. */
  cor_padrao: string | null;
  preco_padrao_centavos: number;
  /** Custo fixo da peça (boné, caneca). Se vazio, camiseta usa lisa + DTF + embalagem. */
  custo_padrao_centavos: number | null;
  /** Miniatura em data URL (pequena, funciona offline). */
  imagem_url: string | null;
  ativo: boolean;
  ordem: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Campanha {
  id: string;
  nome: string;
  tipo: "drop" | "evento";
  inicio: string; // YYYY-MM-DD
  fim: string | null;
  ativa: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Taxas {
  pix: number;
  dinheiro: number;
  debito: number;
  credito: number;
  link: number;
}

export interface Config {
  colchao_centavos: number;
  pct_pai: number;
  /** Percentuais (ex.: 4.98 = 4,98%) */
  taxas: Taxas;
  contas_fixas: { nome: string; valor_centavos: number }[];
  custos_referencia: {
    lisa_centavos: number;
    dtf_centavos: number;
    embalagem_centavos: number;
    /** Fixos fictícios: só para precificar, nunca entram no resultado. */
    aluguel_centavos: number;
    luz_centavos: number;
    internet_centavos: number;
    pecas_mes: number;
    preco_referencia_centavos: number;
  };
  tabela_personalizada: { ate: number | null; preco_centavos: number }[];
  estoque_minimo: Record<ItemEstoque, number>;
  cores: string[];
  /** Tamanhos do modelo Tradicional (masculino). */
  tamanhos: string[];
  /** Modelos de camisa. O primeiro é sempre o Tradicional (usa `tamanhos`). */
  modelos: { nome: string; tamanhos: string[] }[];
  lembrete_ativo: boolean;
  /** Assistente de acerto inicial: passo atual e passos já lançados. */
  acerto: { passo: number; concluido: boolean; feitos: number[] };
}

export const CONFIG_PADRAO: Config = {
  colchao_centavos: 20000,
  pct_pai: 10,
  // Padrões do Mercado Pago (confirmar com as taxas reais do Leandro).
  taxas: { pix: 0, dinheiro: 0, debito: 1.99, credito: 4.98, link: 4.99 },
  contas_fixas: [
    { nome: "Nuvemshop", valor_centavos: 6500 },
    { nome: "Claude", valor_centavos: 5000 },
  ],
  custos_referencia: {
    lisa_centavos: 1750,
    dtf_centavos: 948,
    embalagem_centavos: 100,
    aluguel_centavos: 25000,
    luz_centavos: 0,
    internet_centavos: 0,
    pecas_mes: 30,
    preco_referencia_centavos: 9990,
  },
  tabela_personalizada: [
    { ate: 9, preco_centavos: 6500 },
    { ate: 49, preco_centavos: 4500 },
    { ate: 99, preco_centavos: 4000 },
    { ate: 499, preco_centavos: 3500 },
  ],
  estoque_minimo: { lisa: 2, pronta: 0, dtf: 5, embalagem: 5 },
  cores: ["Preta", "Branca"],
  tamanhos: ["P", "M", "G", "GG", "G2", "XGG"],
  modelos: [
    { nome: "Tradicional", tamanhos: ["P", "M", "G", "GG", "G2", "XGG"] },
    { nome: "Baby look", tamanhos: ["P", "M", "G", "GG"] },
  ],
  lembrete_ativo: false,
  acerto: { passo: 0, concluido: false, feitos: [] },
};

export const MODELO_PADRAO = "Tradicional";

/** "Tradicional" e vazio são o mesmo modelo. */
export function modeloNormal(m: string | null | undefined): string | null {
  return m && m !== MODELO_PADRAO ? m : null;
}

/** Tamanhos de um modelo (Tradicional usa `config.tamanhos`). */
export function tamanhosDo(config: Config, modelo: string | null | undefined): string[] {
  const m = modeloNormal(modelo);
  if (!m) return config.tamanhos;
  return config.modelos.find((x) => x.nome === m)?.tamanhos ?? config.tamanhos;
}

/** Nomes dos modelos, Tradicional primeiro. */
export function nomesModelos(config: Config): string[] {
  return [MODELO_PADRAO, ...config.modelos.map((m) => m.nome).filter((n) => n !== MODELO_PADRAO)];
}

export const NOMES_TIPO: Record<TipoLancamento, string> = {
  venda: "Venda",
  gasto: "Gasto",
  investimento: "Investimento",
  aporte: "Aporte",
  retirada_dinheiro: "Retirada (dinheiro)",
  retirada_produto: "Retirada (peça)",
  pagamento_pai: "Pagamento ao pai",
  perda: "Perda/teste",
  prensagem: "Prensagem",
  ajuste_saldo: "Ajuste de saldo",
  ajuste_estoque: "Contagem de estoque",
};

export const NOMES_CATEGORIA: Record<CategoriaGasto, string> = {
  camisa_lisa: "Camisa lisa",
  dtf: "DTF",
  embalagem: "Embalagem",
  equipamento: "Equipamento",
  assinatura: "Assinatura",
  transporte: "Transporte",
  marketing: "Marketing",
  outro: "Outro",
};

export const NOMES_PAGAMENTO: Record<FormaPagamento, string> = {
  pix: "Pix",
  credito: "Crédito",
  debito: "Débito",
  link: "Link MP",
  dinheiro: "Dinheiro",
};

export const CANAIS = ["Show", "Instagram", "WhatsApp", "Site", "B2B", "Outro"];
