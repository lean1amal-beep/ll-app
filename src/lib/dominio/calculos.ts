// Regras do painel. Tudo é calculado a partir dos lançamentos (nada de saldo guardado solto).
import { pct } from "./dinheiro";
import { mesBR } from "./datas";
import { calcularEstoque, valorEstoque } from "./estoque";
import { CATEGORIA_ESTOQUE, type CategoriaGasto, type Config, type Lancamento } from "./tipos";

export interface Efeito {
  /** Quanto muda o caixa da LL (conta Mercado Pago). */
  caixa: number;
  /** Quanto muda o resultado (lucro/prejuízo acumulado). */
  resultado: number;
}

/** Compra que virou estoque (não entra no resultado na hora; vira custo quando a peça sai). */
export function ehCompraDeEstoque(l: Lancamento): boolean {
  return (
    l.tipo === "gasto" &&
    !!CATEGORIA_ESTOQUE[l.categoria as CategoriaGasto] &&
    (l.movimentos?.length ?? 0) > 0
  );
}

function saiDaMarca(l: Lancamento): boolean {
  return l.pago_por === "marca" && !l.historico;
}

export function efeito(l: Lancamento): Efeito {
  if (l.deleted_at) return { caixa: 0, resultado: 0 };
  const v = l.valor_centavos;
  switch (l.tipo) {
    case "venda":
      return {
        caixa: l.historico ? 0 : v - l.taxa_centavos,
        resultado: v - l.taxa_centavos - l.cpv_centavos,
      };
    case "gasto":
      return { caixa: saiDaMarca(l) ? -v : 0, resultado: ehCompraDeEstoque(l) ? 0 : -v };
    case "investimento":
      return { caixa: saiDaMarca(l) ? -v : 0, resultado: -v };
    case "aporte":
      return { caixa: l.historico ? 0 : v, resultado: 0 };
    case "retirada_dinheiro":
      return { caixa: l.historico ? 0 : -v, resultado: 0 };
    case "pagamento_pai":
      return { caixa: saiDaMarca(l) ? -v : 0, resultado: 0 };
    case "perda":
      return { caixa: 0, resultado: -l.cpv_centavos };
    case "ajuste_saldo":
      return { caixa: v, resultado: 0 };
    case "ajuste_estoque":
      // Sobra na contagem = ganho; falta = perda (pelo custo).
      return { caixa: 0, resultado: v };
    case "retirada_produto":
    case "prensagem":
    default:
      return { caixa: 0, resultado: 0 };
  }
}

export function lucroVenda(l: Lancamento): number {
  return l.valor_centavos - l.taxa_centavos - l.cpv_centavos;
}

export function ativos(lancs: Lancamento[]): Lancamento[] {
  return lancs.filter((l) => !l.deleted_at);
}

export function calcularCaixa(lancs: Lancamento[]): number {
  return ativos(lancs).reduce((s, l) => s + efeito(l).caixa, 0);
}

export interface Divida {
  total: number;
  pago: number;
  falta: number;
  /** 10% das vendas acumulado (só vendas lançadas no app). */
  reserva_acumulada: number;
  /** Reserva ainda não paga, limitada ao que falta da dívida. */
  reserva_pendente: number;
}

export function calcularDivida(lancs: Lancamento[], config: Config): Divida {
  let total = 0;
  let pago = 0;
  let reserva = 0;
  for (const l of ativos(lancs)) {
    if ((l.tipo === "gasto" || l.tipo === "investimento") && l.pago_por === "pai" && !l.eh_presente)
      total += l.valor_centavos;
    if (l.tipo === "pagamento_pai") pago += l.valor_centavos;
    if (l.tipo === "venda" && !l.historico) reserva += pct(l.valor_centavos, config.pct_pai);
  }
  const falta = Math.max(0, total - pago);
  const reserva_pendente = Math.min(Math.max(0, reserva - pago), falta);
  return { total, pago, falta, reserva_acumulada: reserva, reserva_pendente };
}

/** Contas fixas do mês ainda não lançadas (gasto com conta_fixa = nome no mês corrente). */
export function fixasPendentes(lancs: Lancamento[], config: Config, agora = new Date()) {
  const mes = mesBR(agora);
  return config.contas_fixas.filter(
    (c) =>
      !ativos(lancs).some(
        (l) => (l.tipo === "gasto" || l.tipo === "investimento") && l.conta_fixa === c.nome && mesBR(l.data) === mes,
      ),
  );
}

export interface ResumoMes {
  mes: string;
  vendas_qtd: number;
  vendas_valor: number;
  gastos: number;
  lucro: number;
  retiradas: number;
}

export function resumoMes(lancs: Lancamento[], mes: string): ResumoMes {
  const r: ResumoMes = { mes, vendas_qtd: 0, vendas_valor: 0, gastos: 0, lucro: 0, retiradas: 0 };
  for (const l of ativos(lancs)) {
    if (mesBR(l.data) !== mes) continue;
    r.lucro += efeito(l).resultado;
    if (l.tipo === "venda") {
      r.vendas_qtd += l.quantidade;
      r.vendas_valor += l.valor_centavos;
    }
    if (l.tipo === "gasto" || l.tipo === "investimento") r.gastos += l.valor_centavos;
    if (l.tipo === "retirada_dinheiro") r.retiradas += l.valor_centavos;
    if (l.tipo === "retirada_produto") r.retiradas += l.cpv_centavos;
  }
  return r;
}

/** Lucro médio por peça nas últimas vendas; se não houver, preço de referência − custo de referência. */
export function lucroMedioPorPeca(lancs: Lancamento[], config: Config, ultimas = 20): number {
  const vendas = ativos(lancs)
    .filter((l) => l.tipo === "venda" && !l.historico && l.quantidade > 0)
    .sort((a, b) => b.data.localeCompare(a.data))
    .slice(0, ultimas);
  const q = vendas.reduce((s, l) => s + l.quantidade, 0);
  const lucro = vendas.reduce((s, l) => s + lucroVenda(l), 0);
  if (q > 0 && lucro > 0) return Math.round(lucro / q);
  const r = config.custos_referencia;
  return Math.max(1, r.preco_referencia_centavos - (r.lisa_centavos + r.dtf_centavos + r.embalagem_centavos));
}

export interface Resumo {
  caixa: number;
  divida: Divida;
  colchao: number;
  fixas_pendentes: { nome: string; valor_centavos: number }[];
  fixas_pendentes_total: number;
  livre: number;
  resultado: number;
  lucro_bruto_vendas: number;
  custos: number;
  /** 0..1+ — quanto do custo as vendas já cobriram */
  progresso: number;
  ja_me_paguei: boolean;
  lucro_medio_peca: number;
  faltam_camisas: number;
  mes: ResumoMes;
  valor_estoque: number;
  /** 0..1 — fração do valor movimentado que é estimada */
  estimado: number;
}

export function calcularResumo(lancs: Lancamento[], config: Config, agora = new Date()): Resumo {
  const lista = ativos(lancs);
  const caixa = calcularCaixa(lista);
  const divida = calcularDivida(lista, config);
  const fixas = fixasPendentes(lista, config, agora);
  const fixasTotal = fixas.reduce((s, c) => s + c.valor_centavos, 0);
  const colchao = config.colchao_centavos;
  const livre = caixa - divida.reserva_pendente - colchao - fixasTotal;

  let resultado = 0;
  let lucroBruto = 0;
  let estimado = 0;
  let movimentado = 0;
  for (const l of lista) {
    const e = efeito(l);
    resultado += e.resultado;
    if (l.tipo === "venda") lucroBruto += lucroVenda(l);
    const peso = Math.max(Math.abs(l.valor_centavos), Math.abs(l.cpv_centavos));
    movimentado += peso;
    if (l.confianca === "estimado") estimado += peso;
  }
  const custos = lucroBruto - resultado;
  const progresso = custos > 0 ? Math.max(0, lucroBruto) / custos : 1;
  const lucroMedio = lucroMedioPorPeca(lista, config);
  return {
    caixa,
    divida,
    colchao,
    fixas_pendentes: fixas,
    fixas_pendentes_total: fixasTotal,
    livre,
    resultado,
    lucro_bruto_vendas: lucroBruto,
    custos,
    progresso,
    ja_me_paguei: resultado >= 0,
    lucro_medio_peca: lucroMedio,
    faltam_camisas: resultado < 0 ? Math.ceil(-resultado / lucroMedio) : 0,
    mes: resumoMes(lista, mesBR(agora)),
    valor_estoque: valorEstoque(calcularEstoque(lista)),
    estimado: movimentado > 0 ? estimado / movimentado : 0,
  };
}

// ─── Campanhas ───────────────────────────────────────────────────────────────

export interface LinhaCampanha {
  produto_id: string | null;
  levado: number;
  vendido: number;
  sobra: number;
  receita: number;
}

export interface RelatorioCampanha {
  levado: number;
  vendido: number;
  sobra: number;
  receita: number;
  taxas: number;
  cpv: number;
  gastos: number;
  lucro: number;
  por_produto: LinhaCampanha[];
}

/**
 * Levado = peças prensadas com a campanha. Vendido = peças vendidas na campanha.
 * Sobra = levado − vendido de peças prontas.
 */
export function relatorioCampanha(lancs: Lancamento[], campanha_id: string): RelatorioCampanha {
  const r: RelatorioCampanha = { levado: 0, vendido: 0, sobra: 0, receita: 0, taxas: 0, cpv: 0, gastos: 0, lucro: 0, por_produto: [] };
  const linhas = new Map<string, LinhaCampanha & { vendido_pronta: number }>();
  const linha = (pid: string | null) => {
    const k = pid ?? "";
    let x = linhas.get(k);
    if (!x) {
      x = { produto_id: pid, levado: 0, vendido: 0, sobra: 0, receita: 0, vendido_pronta: 0 };
      linhas.set(k, x);
    }
    return x;
  };
  for (const l of ativos(lancs)) {
    if (l.campanha_id !== campanha_id) continue;
    if (l.tipo === "prensagem") {
      const q = l.movimentos.filter((m) => m.item === "pronta" && m.quantidade > 0).reduce((s, m) => s + m.quantidade, 0);
      r.levado += q;
      linha(l.produto_id).levado += q;
    } else if (l.tipo === "venda") {
      r.vendido += l.quantidade;
      r.receita += l.valor_centavos;
      r.taxas += l.taxa_centavos;
      r.cpv += l.cpv_centavos;
      const x = linha(l.produto_id);
      x.vendido += l.quantidade;
      x.receita += l.valor_centavos;
      if (l.modo_venda === "pronta") x.vendido_pronta += l.quantidade;
    } else if ((l.tipo === "gasto" && !ehCompraDeEstoque(l)) || l.tipo === "investimento") {
      r.gastos += l.valor_centavos;
    } else if (l.tipo === "perda") {
      r.cpv += l.cpv_centavos;
    }
  }
  for (const x of linhas.values()) {
    x.sobra = Math.max(0, x.levado - x.vendido_pronta);
    r.sobra += x.sobra;
    const { vendido_pronta: _, ...resto } = x;
    r.por_produto.push(resto);
  }
  r.lucro = r.receita - r.taxas - r.cpv - r.gastos;
  return r;
}
