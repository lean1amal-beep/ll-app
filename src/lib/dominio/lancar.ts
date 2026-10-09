// Monta lançamentos completos (taxa, custo, movimentos de estoque) a partir do que foi digitado.
import { formatarReais, pct, ratear } from "./dinheiro";
import {
  controla,
  custoAtual,
  custoPecaMontada,
  quantidade as qtdEstoque,
  type Estoque,
} from "./estoque";
import {
  CATEGORIA_ESTOQUE,
  type CategoriaGasto,
  type Config,
  type FormaPagamento,
  type ItemEstoque,
  type Lancamento,
  type ModoVenda,
  type Movimento,
  type PagoPor,
  type Produto,
} from "./tipos";

export function novoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Fallback (navegadores antigos)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function novoLancamento(
  parcial: Partial<Lancamento> & Pick<Lancamento, "tipo">,
  agora: Date = new Date(),
): Lancamento {
  const iso = agora.toISOString();
  return {
    id: novoId(),
    data: iso,
    valor_centavos: 0,
    taxa_centavos: 0,
    cpv_centavos: 0,
    forma_pagamento: null,
    categoria: null,
    produto_id: null,
    descricao: null,
    cor: null,
    tamanho: null,
    quantidade: 1,
    canal: null,
    modo_venda: null,
    campanha_id: null,
    pago_por: "marca",
    eh_presente: false,
    historico: false,
    confianca: "confirmado",
    conta_fixa: null,
    observacao: null,
    comprovante_url: null,
    movimentos: [],
    created_at: iso,
    updated_at: iso,
    deleted_at: null,
    ...parcial,
  };
}

export interface Contexto {
  estoque: Estoque;
  config: Config;
  produtos: Produto[];
}

/** Campos comuns que o formulário pode passar direto. */
type Extras = Partial<
  Pick<
    Lancamento,
    "id" | "data" | "campanha_id" | "observacao" | "confianca" | "historico" | "created_at" | "comprovante_url"
  >
>;

export function taxaDe(config: Config, forma: FormaPagamento | null, valor: number): number {
  if (!forma) return 0;
  return pct(valor, config.taxas[forma] ?? 0);
}

// ─── Venda ───────────────────────────────────────────────────────────────────

export interface EntradaVenda extends Extras {
  produto_id: string | null;
  descricao?: string | null;
  /** Preço por peça */
  preco_unitario_centavos: number;
  quantidade: number;
  forma_pagamento: FormaPagamento;
  cor?: string | null;
  tamanho?: string | null;
  canal?: string | null;
  /** Se vazio, decide sozinho: pronta se houver peça pronta, senão sob demanda. */
  modo_venda?: ModoVenda | null;
  /** Custo total informado à mão (sobrepõe o cálculo). */
  cpv_manual_centavos?: number | null;
}

export function modoSugerido(ctx: Contexto, produto_id: string | null, cor?: string | null, tamanho?: string | null): ModoVenda {
  if (!produto_id) return "sob_demanda";
  const q = qtdEstoque(ctx.estoque, { item: "pronta", produto_id, cor, tamanho });
  return q > 0 ? "pronta" : "sob_demanda";
}

export function montarVenda(e: EntradaVenda, ctx: Contexto, agora = new Date()): Lancamento {
  const q = Math.max(1, Math.round(e.quantidade));
  const valor = e.preco_unitario_centavos * q;
  const produto = ctx.produtos.find((p) => p.id === e.produto_id) ?? null;
  const cor = e.cor || produto?.cor_padrao || null;
  const tamanho = e.tamanho || null;
  const modo = e.modo_venda ?? modoSugerido(ctx, e.produto_id, cor, tamanho);
  const movimentos: Movimento[] = [];
  let cpv = 0;

  if (e.historico) {
    // Antes do app: não mexe no estoque; custo só se informado.
    cpv = e.cpv_manual_centavos ?? 0;
  } else if (produto && produto.custo_padrao_centavos != null && produto.tipo !== "camiseta") {
    // Boné, caneca: custo fixo. Se tiver pronta no estoque, baixa a pronta.
    if (modo === "pronta") {
      const c = custoAtual(ctx.estoque, ctx.config, { item: "pronta", produto_id: produto.id, cor, tamanho });
      movimentos.push({ item: "pronta", produto_id: produto.id, cor, tamanho, quantidade: -q, custo_unitario_centavos: c });
      cpv = c * q;
    } else {
      cpv = produto.custo_padrao_centavos * q;
    }
  } else if (modo === "pronta" && produto) {
    const c = custoAtual(ctx.estoque, ctx.config, { item: "pronta", produto_id: produto.id, cor, tamanho });
    movimentos.push({ item: "pronta", produto_id: produto.id, cor, tamanho, quantidade: -q, custo_unitario_centavos: c });
    cpv = c * q;
  } else if (produto || !e.descricao) {
    // Sob demanda: lisa + estampa + embalagem saem direto.
    movimentos.push(...baixaPecaMontada(ctx, cor, tamanho, q));
    cpv = custoPecaMontada(ctx.estoque, ctx.config, cor, tamanho) * q;
  }
  if (e.cpv_manual_centavos != null) cpv = e.cpv_manual_centavos;

  return novoLancamento(
    {
      ...limparExtras(e),
      tipo: "venda",
      valor_centavos: valor,
      taxa_centavos: taxaDe(ctx.config, e.forma_pagamento, valor),
      cpv_centavos: cpv,
      forma_pagamento: e.forma_pagamento,
      produto_id: e.produto_id,
      descricao: e.descricao ?? null,
      cor,
      tamanho,
      quantidade: q,
      canal: e.canal ?? null,
      modo_venda: e.historico ? null : modo,
      movimentos,
    },
    agora,
  );
}

/** Saídas de uma camiseta montada na hora (lisa + DTF + embalagem se ele controla embalagem). */
export function baixaPecaMontada(ctx: Contexto, cor: string | null, tamanho: string | null, q: number): Movimento[] {
  const est = ctx.estoque;
  const out: Movimento[] = [
    { item: "lisa", cor, tamanho, quantidade: -q, custo_unitario_centavos: custoAtual(est, ctx.config, { item: "lisa", cor, tamanho }) },
    { item: "dtf", quantidade: -q, custo_unitario_centavos: custoAtual(est, ctx.config, { item: "dtf" }) },
  ];
  if (controla(est, "embalagem"))
    out.push({ item: "embalagem", quantidade: -q, custo_unitario_centavos: custoAtual(est, ctx.config, { item: "embalagem" }) });
  return out;
}

// ─── Gasto / investimento ────────────────────────────────────────────────────

export interface LinhaGrade {
  cor?: string | null;
  tamanho?: string | null;
  quantidade: number;
}

export interface EntradaGasto extends Extras {
  categoria: CategoriaGasto;
  valor_centavos: number;
  pago_por: PagoPor;
  eh_presente?: boolean;
  /** Para compras de estoque: quantidades (lisa por cor × tamanho; DTF = nº de estampas). */
  grade?: LinhaGrade[];
  descricao?: string | null;
  conta_fixa?: string | null;
}

export function montarGasto(e: EntradaGasto, agora = new Date()): Lancamento {
  const item = CATEGORIA_ESTOQUE[e.categoria];
  const linhas = (e.grade ?? []).filter((g) => g.quantidade > 0);
  const movimentos: Movimento[] = [];
  let quantidade = 1;
  if (item && !e.historico && linhas.length) {
    quantidade = linhas.reduce((a, g) => a + g.quantidade, 0);
    const partes = ratear(e.valor_centavos, linhas.map((g) => g.quantidade));
    linhas.forEach((g, i) => {
      movimentos.push({
        item,
        cor: item === "lisa" ? g.cor ?? null : null,
        tamanho: item === "lisa" ? g.tamanho ?? null : null,
        quantidade: g.quantidade,
        custo_unitario_centavos: Math.round(partes[i] / g.quantidade),
      });
    });
  }
  return novoLancamento(
    {
      ...limparExtras(e),
      tipo: e.categoria === "equipamento" ? "investimento" : "gasto",
      categoria: e.categoria,
      valor_centavos: e.valor_centavos,
      pago_por: e.pago_por,
      eh_presente: e.pago_por === "pai" ? !!e.eh_presente : false,
      descricao: e.descricao ?? null,
      conta_fixa: e.conta_fixa ?? null,
      quantidade,
      movimentos,
    },
    agora,
  );
}

// ─── Prensagem ───────────────────────────────────────────────────────────────

export interface EntradaPrensagem extends Extras {
  produto_id: string;
  cor: string | null;
  /** Quantidade por tamanho */
  tamanhos: { tamanho: string | null; quantidade: number }[];
  com_embalagem: boolean;
}

export function montarPrensagem(e: EntradaPrensagem, ctx: Contexto, agora = new Date()): Lancamento {
  const est = ctx.estoque;
  const movimentos: Movimento[] = [];
  let total = 0;
  let custoTotal = 0;
  const dtf = custoAtual(est, ctx.config, { item: "dtf" });
  const emb = e.com_embalagem ? custoAtual(est, ctx.config, { item: "embalagem" }) : 0;
  for (const t of e.tamanhos) {
    if (t.quantidade <= 0) continue;
    const lisa = custoAtual(est, ctx.config, { item: "lisa", cor: e.cor, tamanho: t.tamanho });
    const custo = lisa + dtf + emb;
    movimentos.push({ item: "lisa", cor: e.cor, tamanho: t.tamanho, quantidade: -t.quantidade, custo_unitario_centavos: lisa });
    movimentos.push({ item: "pronta", produto_id: e.produto_id, cor: e.cor, tamanho: t.tamanho, quantidade: t.quantidade, custo_unitario_centavos: custo });
    total += t.quantidade;
    custoTotal += custo * t.quantidade;
  }
  if (total > 0) {
    movimentos.push({ item: "dtf", quantidade: -total, custo_unitario_centavos: dtf });
    if (e.com_embalagem) movimentos.push({ item: "embalagem", quantidade: -total, custo_unitario_centavos: emb });
  }
  const tamanhos = e.tamanhos.filter((t) => t.quantidade > 0);
  return novoLancamento(
    {
      ...limparExtras(e),
      tipo: "prensagem",
      produto_id: e.produto_id,
      cor: e.cor,
      tamanho: tamanhos.length === 1 ? tamanhos[0].tamanho : null,
      quantidade: total,
      cpv_centavos: custoTotal,
      movimentos,
    },
    agora,
  );
}

// ─── Perda / retirada de produto ─────────────────────────────────────────────

/** O que saiu: um item do estoque, ou "peca" = camiseta montada (lisa + DTF). */
export type AlvoSaida =
  | { item: ItemEstoque; produto_id?: string | null; cor?: string | null; tamanho?: string | null }
  | { item: "peca"; cor?: string | null; tamanho?: string | null };

export interface EntradaSaida extends Extras {
  tipo: "perda" | "retirada_produto";
  alvo: AlvoSaida;
  quantidade: number;
  descricao?: string | null;
}

export function montarSaida(e: EntradaSaida, ctx: Contexto, agora = new Date()): Lancamento {
  const q = Math.max(1, Math.round(e.quantidade));
  let movimentos: Movimento[] = [];
  const a = e.alvo;
  if (a.item === "peca") {
    movimentos = baixaPecaMontada(ctx, a.cor ?? null, a.tamanho ?? null, q);
  } else {
    const c = custoAtual(ctx.estoque, ctx.config, a);
    movimentos = [{ item: a.item, produto_id: a.produto_id ?? null, cor: a.cor ?? null, tamanho: a.tamanho ?? null, quantidade: -q, custo_unitario_centavos: c }];
  }
  let cpv = movimentos.reduce((s, m) => s + -m.quantidade * m.custo_unitario_centavos, 0);
  if (e.historico) {
    // Antes do app: só registra o custo estimado, sem mexer no estoque.
    movimentos = [];
    if (a.item === "peca" || a.item === "pronta") cpv = custoPecaMontada(ctx.estoque, ctx.config, a.cor ?? null, a.tamanho ?? null) * q;
  }
  return novoLancamento(
    {
      ...limparExtras(e),
      tipo: e.tipo,
      produto_id: "produto_id" in a ? a.produto_id ?? null : null,
      cor: a.cor ?? null,
      tamanho: a.tamanho ?? null,
      categoria: a.item,
      quantidade: q,
      descricao: e.descricao ?? null,
      cpv_centavos: cpv,
      movimentos,
    },
    agora,
  );
}

// ─── Contagem de estoque ─────────────────────────────────────────────────────

export interface Contagem {
  item: ItemEstoque;
  produto_id?: string | null;
  cor?: string | null;
  tamanho?: string | null;
  /** Quantidade real contada */
  real: number;
  /** Custo unitário para entradas (opcional; senão custo atual/referência) */
  custo_unitario_centavos?: number;
}

/**
 * Gera a diferença entre o contado e o que o app acha que tem.
 * O valor (± custo) entra no resultado: sobra é ganho, falta é perda.
 * Retorna null se nada mudou.
 */
export function montarContagem(contagens: Contagem[], ctx: Contexto, extras: Extras = {}, agora = new Date()): Lancamento | null {
  const movimentos: Movimento[] = [];
  for (const c of contagens) {
    const atual = qtdEstoque(ctx.estoque, c);
    const delta = c.real - atual;
    if (delta === 0) continue;
    const custo = c.custo_unitario_centavos ?? custoAtual(ctx.estoque, ctx.config, c);
    movimentos.push({
      item: c.item,
      produto_id: c.produto_id ?? null,
      cor: c.cor ?? null,
      tamanho: c.tamanho ?? null,
      quantidade: delta,
      custo_unitario_centavos: custo,
    });
  }
  if (!movimentos.length) return null;
  const valor = movimentos.reduce((s, m) => s + m.quantidade * m.custo_unitario_centavos, 0);
  return novoLancamento(
    {
      ...extras,
      tipo: "ajuste_estoque",
      valor_centavos: valor,
      quantidade: movimentos.reduce((s, m) => s + m.quantidade, 0),
      movimentos,
    },
    agora,
  );
}

// ─── Dinheiro simples ────────────────────────────────────────────────────────

export function montarSimples(
  tipo: "aporte" | "retirada_dinheiro" | "pagamento_pai",
  valor_centavos: number,
  extras: Extras & { descricao?: string | null; pago_por?: PagoPor } = {},
  agora = new Date(),
): Lancamento {
  return novoLancamento({ ...extras, tipo, valor_centavos }, agora);
}

export function montarAjusteSaldo(saldoReal: number, caixaAtual: number, extras: Extras = {}, agora = new Date()): Lancamento {
  return novoLancamento(
    { ...extras, tipo: "ajuste_saldo", valor_centavos: saldoReal - caixaAtual, descricao: `Saldo real informado: ${formatarReais(saldoReal)}` },
    agora,
  );
}

function limparExtras(e: Extras): Extras {
  const out: Extras = {};
  for (const k of ["id", "data", "campanha_id", "observacao", "confianca", "historico", "created_at", "comprovante_url"] as const) {
    if (e[k] !== undefined) (out as Record<string, unknown>)[k] = e[k];
  }
  return out;
}
