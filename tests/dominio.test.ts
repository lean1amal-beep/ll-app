import { describe, expect, it } from "vitest";
import { formatarReais, lerReais, ratear } from "@/lib/dominio/dinheiro";
import { dataParaISO, diaBR, mesBR } from "@/lib/dominio/datas";
import { calcularEstoque, custoAtual, quantidade, valorEstoque, alertasEstoque } from "@/lib/dominio/estoque";
import {
  montarAjusteSaldo,
  montarContagem,
  montarGasto,
  montarPrensagem,
  montarSaida,
  montarSimples,
  montarVenda,
  type Contexto,
} from "@/lib/dominio/lancar";
import {
  calcularCaixa,
  calcularDivida,
  calcularResumo,
  efeito,
  fixasPendentes,
  relatorioCampanha,
} from "@/lib/dominio/calculos";
import { adivinharColunas, lerCSV, lerData, lerExtrato } from "@/lib/dominio/csv";
import { CONFIG_PADRAO, type Config, type Lancamento, type Produto } from "@/lib/dominio/tipos";

const config: Config = structuredClone(CONFIG_PADRAO);
const T0 = new Date("2026-10-09T15:00:00Z");
let relogio = 0;
/** Cada lançamento 1 minuto depois do anterior, para ordem estável. */
const t = () => new Date(T0.getTime() + ++relogio * 60_000);

const produto = (p: Partial<Produto> = {}): Produto => ({
  id: "devil",
  nome: "The Devil In I",
  tipo: "camiseta",
  cor_padrao: "Preta",
  preco_padrao_centavos: 9990,
  custo_padrao_centavos: null,
  imagem_url: null,
  ativo: true,
  ordem: 0,
  created_at: T0.toISOString(),
  updated_at: T0.toISOString(),
  deleted_at: null,
  ...p,
});

const bone = produto({ id: "bone", nome: "Boné LL", tipo: "bone", cor_padrao: null, preco_padrao_centavos: 4000, custo_padrao_centavos: 3000 });

function ctx(lancs: Lancamento[], produtos: Produto[] = [produto(), bone]): Contexto {
  return { estoque: calcularEstoque(lancs), config, produtos };
}

describe("dinheiro", () => {
  it("formata em reais", () => {
    expect(formatarReais(123456)).toBe("R$ 1.234,56");
    expect(formatarReais(9990)).toBe("R$ 99,90");
    expect(formatarReais(-5000)).toBe("-R$ 50,00");
  });
  it("lê valores digitados", () => {
    expect(lerReais("99,90")).toBe(9990);
    expect(lerReais("R$ 1.234,56")).toBe(123456);
    expect(lerReais("1.300")).toBe(130000);
    expect(lerReais("12.5")).toBe(1250);
    expect(lerReais("-50,00")).toBe(-5000);
    expect(lerReais("50")).toBe(5000);
    expect(lerReais("abc")).toBeNull();
    expect(lerReais("")).toBeNull();
  });
  it("rateia sem perder centavos", () => {
    expect(ratear(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(ratear(17500, [3, 4, 3])).toEqual([5250, 7000, 5250]);
    expect(ratear(100, [0, 0])).toEqual([0, 0]);
  });
});

describe("datas (Brasília)", () => {
  it("usa o dia de Brasília, não o UTC", () => {
    // 01:30 UTC de 1/11 = 22:30 de 31/10 em Brasília
    expect(diaBR("2026-11-01T01:30:00Z")).toBe("2026-10-31");
    expect(mesBR("2026-11-01T01:30:00Z")).toBe("2026-10");
  });
  it("data escolhida vira meio-dia de Brasília", () => {
    expect(dataParaISO("2026-04-15", T0)).toBe("2026-04-15T15:00:00.000Z");
    expect(dataParaISO("2026-10-09", T0)).toBe(T0.toISOString());
  });
});

describe("estoque e custo médio", () => {
  it("compra de lisas entra no estoque com custo rateado e não no resultado", () => {
    const g = montarGasto(
      {
        categoria: "camisa_lisa",
        valor_centavos: 17500,
        pago_por: "marca",
        grade: [
          { cor: "Preta", tamanho: "M", quantidade: 6 },
          { cor: "Preta", tamanho: "G", quantidade: 4 },
        ],
      },
      t(),
    );
    expect(g.tipo).toBe("gasto");
    expect(g.quantidade).toBe(10);
    const est = calcularEstoque([g]);
    expect(quantidade(est, { item: "lisa", cor: "Preta", tamanho: "M" })).toBe(6);
    expect(custoAtual(est, config, { item: "lisa", cor: "Preta", tamanho: "M" })).toBe(1750);
    expect(valorEstoque(est)).toBe(17500);
    expect(efeito(g)).toEqual({ caixa: -17500, resultado: 0 });
  });

  it("custo médio ponderado a cada compra", () => {
    const a = montarGasto({ categoria: "camisa_lisa", valor_centavos: 2000 * 10, pago_por: "marca", grade: [{ cor: "Preta", tamanho: "M", quantidade: 10 }] }, t());
    const b = montarGasto({ categoria: "camisa_lisa", valor_centavos: 1500 * 10, pago_por: "marca", grade: [{ cor: "Preta", tamanho: "M", quantidade: 10 }] }, t());
    const est = calcularEstoque([a, b]);
    expect(custoAtual(est, config, { item: "lisa", cor: "Preta", tamanho: "M" })).toBe(1750);
  });

  it("sem estoque, usa custo de referência; tamanho novo usa média do item", () => {
    const vazio = calcularEstoque([]);
    expect(custoAtual(vazio, config, { item: "lisa", cor: "Preta", tamanho: "P" })).toBe(1750);
    expect(custoAtual(vazio, config, { item: "dtf" })).toBe(948);
    const g = montarGasto({ categoria: "camisa_lisa", valor_centavos: 4000, pago_por: "marca", grade: [{ cor: "Preta", tamanho: "M", quantidade: 2 }] }, t());
    expect(custoAtual(calcularEstoque([g]), config, { item: "lisa", cor: "Branca", tamanho: "XGG" })).toBe(2000);
  });

  it("alerta de estoque mínimo", () => {
    const g = montarGasto({ categoria: "dtf", valor_centavos: 3790, pago_por: "marca", grade: [{ quantidade: 4 }] }, t());
    const est = calcularEstoque([g]);
    expect(alertasEstoque(est, config).map((a) => a.item)).toEqual(["dtf"]);
  });
});

describe("prensagem e venda", () => {
  const compras = () => [
    montarGasto({ categoria: "camisa_lisa", valor_centavos: 17500, pago_por: "marca", grade: [{ cor: "Preta", tamanho: "M", quantidade: 5 }, { cor: "Preta", tamanho: "G", quantidade: 5 }] }, t()),
    montarGasto({ categoria: "dtf", valor_centavos: 3792, pago_por: "marca", grade: [{ quantidade: 4 }] }, t()),
  ];

  it("prensar baixa lisa + DTF e cria peça pronta com custo somado", () => {
    const base = compras();
    const p = montarPrensagem({ produto_id: "devil", cor: "Preta", tamanhos: [{ tamanho: "M", quantidade: 2 }, { tamanho: "G", quantidade: 1 }], com_embalagem: false }, ctx(base), t());
    const est = calcularEstoque([...base, p]);
    expect(quantidade(est, { item: "lisa", cor: "Preta", tamanho: "M" })).toBe(3);
    expect(quantidade(est, { item: "dtf" })).toBe(1);
    expect(quantidade(est, { item: "pronta", produto_id: "devil", cor: "Preta", tamanho: "M" })).toBe(2);
    expect(custoAtual(est, config, { item: "pronta", produto_id: "devil", cor: "Preta", tamanho: "M" })).toBe(1750 + 948);
    expect(p.cpv_centavos).toBe(3 * (1750 + 948));
    expect(efeito(p)).toEqual({ caixa: 0, resultado: 0 });
    // Valor do estoque não muda ao prensar (só troca de forma)
    expect(valorEstoque(est)).toBe(valorEstoque(calcularEstoque(base)));
  });

  it("venda de peça pronta baixa a pronta; lucro = receita − taxa − custo", () => {
    const base = compras();
    const p = montarPrensagem({ produto_id: "devil", cor: "Preta", tamanhos: [{ tamanho: "M", quantidade: 2 }], com_embalagem: false }, ctx(base), t());
    const lancs = [...base, p];
    const v = montarVenda({ produto_id: "devil", preco_unitario_centavos: 9990, quantidade: 1, forma_pagamento: "credito", tamanho: "M" }, ctx(lancs), t());
    expect(v.modo_venda).toBe("pronta");
    expect(v.cor).toBe("Preta");
    expect(v.taxa_centavos).toBe(498); // 4,98% de 99,90 = 4,975
    expect(v.cpv_centavos).toBe(2698);
    expect(efeito(v)).toEqual({ caixa: 9990 - 498, resultado: 9990 - 498 - 2698 });
    const est = calcularEstoque([...lancs, v]);
    expect(quantidade(est, { item: "pronta", produto_id: "devil", cor: "Preta", tamanho: "M" })).toBe(1);
  });

  it("venda sob demanda baixa lisa + DTF direto; Pix sem taxa", () => {
    const base = compras();
    const v = montarVenda({ produto_id: "devil", preco_unitario_centavos: 8000, quantidade: 2, forma_pagamento: "pix", tamanho: "G" }, ctx(base), t());
    expect(v.modo_venda).toBe("sob_demanda");
    expect(v.valor_centavos).toBe(16000);
    expect(v.taxa_centavos).toBe(0);
    expect(v.cpv_centavos).toBe(2 * (1750 + 948 + 100)); // embalagem pela referência
    const est = calcularEstoque([...base, v]);
    expect(quantidade(est, { item: "lisa", cor: "Preta", tamanho: "G" })).toBe(3);
    expect(quantidade(est, { item: "dtf" })).toBe(2);
    expect(quantidade(est, { item: "embalagem" })).toBe(0); // não controla embalagem: não baixa
  });

  it("boné usa custo fixo do produto, sem mexer em lisa", () => {
    const v = montarVenda({ produto_id: "bone", preco_unitario_centavos: 4000, quantidade: 1, forma_pagamento: "pix" }, ctx([]), t());
    expect(v.cpv_centavos).toBe(3000);
    expect(v.movimentos).toEqual([]);
    expect(efeito(v).resultado).toBe(1000);
  });

  it("venda histórica não mexe no caixa nem no estoque", () => {
    const v = montarVenda({ produto_id: null, descricao: "Show abril", preco_unitario_centavos: 5000, quantidade: 3, forma_pagamento: "pix", historico: true }, ctx([]), t());
    expect(v.movimentos).toEqual([]);
    expect(efeito(v)).toEqual({ caixa: 0, resultado: 15000 });
  });
});

describe("perdas, retiradas e contagem", () => {
  it("perda entra no resultado pelo custo; retirada de produto não", () => {
    const g = montarGasto({ categoria: "camisa_lisa", valor_centavos: 3500, pago_por: "marca", grade: [{ cor: "Branca", tamanho: "M", quantidade: 2 }] }, t());
    const perda = montarSaida({ tipo: "perda", alvo: { item: "lisa", cor: "Branca", tamanho: "M" }, quantidade: 1 }, ctx([g]), t());
    expect(perda.cpv_centavos).toBe(1750);
    expect(efeito(perda)).toEqual({ caixa: 0, resultado: -1750 });
    const ret = montarSaida({ tipo: "retirada_produto", alvo: { item: "peca", cor: "Branca", tamanho: "M" }, quantidade: 1 }, ctx([g, perda]), t());
    expect(ret.cpv_centavos).toBe(1750 + 948);
    expect(efeito(ret)).toEqual({ caixa: 0, resultado: 0 });
    expect(quantidade(calcularEstoque([g, perda, ret]), { item: "lisa", cor: "Branca", tamanho: "M" })).toBe(0);
  });

  it("contagem gera só a diferença; falta vira perda no resultado", () => {
    const g = montarGasto({ categoria: "camisa_lisa", valor_centavos: 17500, pago_por: "marca", grade: [{ cor: "Preta", tamanho: "M", quantidade: 10 }] }, t());
    const c = montarContagem(
      [
        { item: "lisa", cor: "Preta", tamanho: "M", real: 8 },
        { item: "dtf", real: 3, custo_unitario_centavos: 948 },
      ],
      ctx([g]),
      {},
      t(),
    )!;
    expect(c.movimentos.map((m) => m.quantidade)).toEqual([-2, 3]);
    expect(c.valor_centavos).toBe(-3500 + 2844);
    expect(efeito(c).resultado).toBe(-656);
    expect(montarContagem([{ item: "lisa", cor: "Preta", tamanho: "M", real: 10 }], ctx([g]))).toBeNull();
  });
});

describe("caixa, dívida com o pai e painel", () => {
  function cenario() {
    const prensa = montarGasto({ categoria: "equipamento", valor_centavos: 130000, pago_por: "pai", historico: true, confianca: "estimado" }, t());
    const kittl = montarGasto({ categoria: "equipamento", valor_centavos: 30000, pago_por: "pai", eh_presente: true, historico: true }, t());
    const saldo = montarAjusteSaldo(50000, 0, {}, t());
    const venda = montarVenda({ produto_id: "devil", preco_unitario_centavos: 10000, quantidade: 1, forma_pagamento: "pix" }, ctx([]), t());
    return { prensa, kittl, saldo, venda };
  }

  it("equipamento vira investimento; pago pelo pai não sai do caixa", () => {
    const { prensa, kittl } = cenario();
    expect(prensa.tipo).toBe("investimento");
    expect(efeito(prensa)).toEqual({ caixa: 0, resultado: -130000 });
    expect(kittl.eh_presente).toBe(true);
  });

  it("dívida só da prensa (presente não conta) e reserva de 10% das vendas", () => {
    const { prensa, kittl, saldo, venda } = cenario();
    const d = calcularDivida([prensa, kittl, saldo, venda], config);
    expect(d.total).toBe(130000);
    expect(d.falta).toBe(130000);
    expect(d.reserva_acumulada).toBe(1000);
    expect(d.reserva_pendente).toBe(1000);
    const pag = montarSimples("pagamento_pai", 800, {}, t());
    const d2 = calcularDivida([prensa, kittl, saldo, venda, pag], config);
    expect(d2.pago).toBe(800);
    expect(d2.falta).toBe(129200);
    expect(d2.reserva_pendente).toBe(200);
    expect(efeito(pag).caixa).toBe(-800);
  });

  it("reserva nunca passa do que falta da dívida", () => {
    const prensa = montarGasto({ categoria: "equipamento", valor_centavos: 1000, pago_por: "pai" }, t());
    const venda = montarVenda({ produto_id: "devil", preco_unitario_centavos: 50000, quantidade: 1, forma_pagamento: "pix" }, ctx([]), t());
    expect(calcularDivida([prensa, venda], config).reserva_pendente).toBe(1000);
  });

  it("livre pra gastar = caixa − reserva − colchão − fixas pendentes", () => {
    const { prensa, kittl, saldo, venda } = cenario();
    const nuvem = montarGasto({ categoria: "assinatura", valor_centavos: 6500, pago_por: "marca", conta_fixa: "Nuvemshop" }, t());
    const lancs = [prensa, kittl, saldo, venda, nuvem];
    expect(fixasPendentes(lancs, config, T0).map((f) => f.nome)).toEqual(["Claude"]);
    const r = calcularResumo(lancs, config, T0);
    expect(r.caixa).toBe(50000 + 10000 - 6500);
    expect(r.livre).toBe(53500 - 1000 - 20000 - 5000);
    expect(r.ja_me_paguei).toBe(false);
  });

  it("resultado: retiradas e aportes não entram; já me paguei e faltam camisas", () => {
    const { prensa, kittl, venda } = cenario();
    const aporte = montarSimples("aporte", 10000, {}, t());
    const ret = montarSimples("retirada_dinheiro", 3000, {}, t());
    const lancs = [prensa, kittl, venda, aporte, ret];
    const r = calcularResumo(lancs, config, T0);
    const lucroVenda = 10000 - venda.cpv_centavos;
    expect(r.resultado).toBe(-130000 - 30000 + lucroVenda);
    expect(r.caixa).toBe(10000 + 10000 - 3000);
    expect(r.lucro_medio_peca).toBe(lucroVenda);
    expect(r.faltam_camisas).toBe(Math.ceil((160000 - lucroVenda) / lucroVenda));
    expect(r.progresso).toBeCloseTo(lucroVenda / 160000);
    expect(r.mes.retiradas).toBe(3000);
    expect(r.mes.vendas_qtd).toBe(1);
  });

  it("sem vendas, lucro médio usa R$ 99,90 − custo de referência", () => {
    const r = calcularResumo([], config, T0);
    expect(r.lucro_medio_peca).toBe(9990 - 2798);
    expect(r.ja_me_paguei).toBe(true);
    expect(r.livre).toBe(-20000 - 11500);
  });

  it("apagado (soft delete) não conta", () => {
    const { saldo } = cenario();
    expect(calcularCaixa([{ ...saldo, deleted_at: T0.toISOString() }])).toBe(0);
  });

  it("% estimado", () => {
    const { prensa, saldo } = cenario();
    const r = calcularResumo([prensa, saldo], config, T0);
    expect(r.estimado).toBeCloseTo(130000 / 180000);
  });
});

describe("campanhas", () => {
  it("levado × vendido × sobra, receita e lucro", () => {
    const base = [montarGasto({ categoria: "camisa_lisa", valor_centavos: 17500, pago_por: "marca", grade: [{ cor: "Preta", tamanho: "M", quantidade: 10 }] }, t())];
    const p = montarPrensagem({ produto_id: "devil", cor: "Preta", tamanhos: [{ tamanho: "M", quantidade: 5 }], com_embalagem: false, campanha_id: "campos" }, ctx(base), t());
    const lancs = [...base, p];
    const v = montarVenda({ produto_id: "devil", preco_unitario_centavos: 9990, quantidade: 2, forma_pagamento: "pix", tamanho: "M", campanha_id: "campos" }, ctx(lancs), t());
    const passagem = montarGasto({ categoria: "transporte", valor_centavos: 5000, pago_por: "marca", campanha_id: "campos" }, t());
    const r = relatorioCampanha([...lancs, v, passagem], "campos");
    expect(r.levado).toBe(5);
    expect(r.vendido).toBe(2);
    expect(r.sobra).toBe(3);
    expect(r.receita).toBe(19980);
    expect(r.gastos).toBe(5000);
    expect(r.lucro).toBe(19980 - v.cpv_centavos - 5000);
  });
});

describe("CSV", () => {
  it("lê extrato com ; e números brasileiros", () => {
    const texto = '﻿Data;Descrição;Valor\n01/03/2026;"Pix recebido; Fulano";50,00\n02/03/2026;DTF;-69,90\n\n';
    const linhas = lerCSV(texto);
    expect(linhas).toHaveLength(3);
    const col = adivinharColunas(linhas[0]);
    expect(col).toEqual({ data: 0, descricao: 1, valor: 2 });
    const ex = lerExtrato(linhas, col);
    expect(ex).toEqual([
      { indice: 0, data: "2026-03-01", descricao: "Pix recebido; Fulano", valor_centavos: 5000 },
      { indice: 1, data: "2026-03-02", descricao: "DTF", valor_centavos: -6990 },
    ]);
  });
  it("lê datas em vários formatos", () => {
    expect(lerData("2026-03-01T10:00:00")).toBe("2026-03-01");
    expect(lerData("1/3/26")).toBe("2026-03-01");
    expect(lerData("xx")).toBeNull();
  });
});

describe("modelos de camisa (baby look)", () => {
  it("baby look tem estoque e custo separados da tradicional", () => {
    const g = montarGasto(
      {
        categoria: "camisa_lisa",
        valor_centavos: 1750 * 2 + 2200 * 3,
        pago_por: "marca",
        grade: [
          { cor: "Preta", tamanho: "M", quantidade: 2 },
          { modelo: "Baby look", cor: "Preta", tamanho: "M", quantidade: 3 },
        ],
      },
      t(),
    );
    // rateio é por quantidade (custo médio da compra), então informe compras separadas para custos diferentes
    const est = calcularEstoque([g]);
    expect(quantidade(est, { item: "lisa", cor: "Preta", tamanho: "M" })).toBe(2);
    expect(quantidade(est, { item: "lisa", modelo: "Baby look", cor: "Preta", tamanho: "M" })).toBe(3);
    // "Tradicional" e vazio são o mesmo modelo (dados antigos continuam valendo)
    expect(quantidade(est, { item: "lisa", modelo: "Tradicional", cor: "Preta", tamanho: "M" })).toBe(2);
  });

  it("prensar e vender baby look baixa só o baby look", () => {
    const tradicional = montarGasto({ categoria: "camisa_lisa", valor_centavos: 1750 * 5, pago_por: "marca", grade: [{ cor: "Branca", tamanho: "P", quantidade: 5 }] }, t());
    const baby = montarGasto({ categoria: "camisa_lisa", valor_centavos: 2200 * 4, pago_por: "marca", grade: [{ modelo: "Baby look", cor: "Branca", tamanho: "P", quantidade: 4 }] }, t());
    const base = [tradicional, baby];
    const p = montarPrensagem({ produto_id: "devil", modelo: "Baby look", cor: "Branca", tamanhos: [{ tamanho: "P", quantidade: 2 }], com_embalagem: false }, ctx(base), t());
    expect(p.modelo).toBe("Baby look");
    expect(p.cpv_centavos).toBe(2 * (2200 + 948));
    const lancs = [...base, p];
    const v = montarVenda({ produto_id: "devil", modelo: "Baby look", preco_unitario_centavos: 9990, quantidade: 1, forma_pagamento: "pix", cor: "Branca", tamanho: "P" }, ctx(lancs), t());
    expect(v.modo_venda).toBe("pronta");
    expect(v.cpv_centavos).toBe(2200 + 948);
    const est = calcularEstoque([...lancs, v]);
    expect(quantidade(est, { item: "lisa", cor: "Branca", tamanho: "P" })).toBe(5);
    expect(quantidade(est, { item: "lisa", modelo: "Baby look", cor: "Branca", tamanho: "P" })).toBe(2);
    expect(quantidade(est, { item: "pronta", produto_id: "devil", modelo: "Baby look", cor: "Branca", tamanho: "P" })).toBe(1);
    // A tradicional da mesma estampa não tem pronta → sob demanda
    const v2 = montarVenda({ produto_id: "devil", preco_unitario_centavos: 9990, quantidade: 1, forma_pagamento: "pix", cor: "Branca", tamanho: "P" }, ctx([...lancs, v]), t());
    expect(v2.modo_venda).toBe("sob_demanda");
    expect(v2.cpv_centavos).toBe(1750 + 948 + 100);
  });
});

describe("lista de peças prontas", () => {
  it("lê a lista do jeito que o Leandro escreve", async () => {
    const { lerListaProntas } = await import("@/lib/dominio/lista");
    const texto = `M/P - Slipknot ALL HOPE IS GONE

G/GG- LP Hybrid Theory

GG - System of a down (logo peito)
2 GG - Linkin Park
P e M: Teste
XX - Errado
sem tamanho`;
    const r = lerListaProntas(texto, ["P", "M", "G", "GG", "G2", "XGG"]);
    expect(r.linhas).toEqual([
      { nome: "Slipknot ALL HOPE IS GONE", tamanhos: ["M", "P"] },
      { nome: "LP Hybrid Theory", tamanhos: ["G", "GG"] },
      { nome: "System of a down (logo peito)", tamanhos: ["GG"] },
      { nome: "Linkin Park", tamanhos: ["GG", "GG"] },
      { nome: "Teste", tamanhos: ["P", "M"] },
    ]);
    expect(r.erros).toEqual(["XX - Errado", "sem tamanho"]);
  });
});

describe("correção de custo", () => {
  it("troca o custo das lisas sem mudar a quantidade", async () => {
    const { montarCorrecaoCusto } = await import("@/lib/dominio/lancar");
    const c = montarContagem(
      [
        { item: "lisa", cor: "Preta", tamanho: "M", real: 2 },
        { item: "lisa", cor: "Preta", tamanho: "G", real: 5 },
      ],
      ctx([]),
      {},
      t(),
    )!;
    expect(c.valor_centavos).toBe(7 * 1750);
    const corr = montarCorrecaoCusto("lisa", 2120, ctx([c]), {}, t())!;
    const est = calcularEstoque([c, corr]);
    expect(quantidade(est, { item: "lisa", cor: "Preta", tamanho: "G" })).toBe(5);
    expect(custoAtual(est, config, { item: "lisa", cor: "Preta", tamanho: "G" })).toBe(2120);
    expect(valorEstoque(est)).toBe(7 * 2120);
    expect(efeito(corr).resultado).toBe(7 * (2120 - 1750));
    expect(montarCorrecaoCusto("lisa", 2120, ctx([c, corr]))).toBeNull();
  });
});

describe("compras reais de camisas", () => {
  it("lança os pedidos que faltam, apaga o chute de ~35 camisas e corrige o custo", async () => {
    const { planoComprasReais } = await import("@/lib/dominio/compras");
    const chute = montarGasto({ categoria: "camisa_lisa", valor_centavos: 61250, pago_por: "leandro", descricao: "~35 camisas lisas", historico: true }, t());
    const packs = montarGasto({ categoria: "marketing", valor_centavos: 5000, pago_por: "leandro", descricao: "2 packs de imagens", historico: true }, t());
    const estoque = montarContagem([{ item: "lisa", cor: "Preta", tamanho: "G", real: 5 }], ctx([]), {}, t())!;
    const lancs = [chute, packs, estoque];
    const p = planoComprasReais(lancs, ctx(lancs));
    expect(p.apagar).toEqual([chute.id]);
    expect(p.criar.some((l) => l.descricao === "2 packs de imagens")).toBe(false); // já existia
    const camisas = p.criar.filter((l) => l.categoria === "camisa_lisa");
    expect(camisas.reduce((s, l) => s + l.valor_centavos, 0)).toBe(187487);
    expect(camisas.every((l) => l.historico && l.pago_por === "leandro" && l.movimentos.length === 0)).toBe(true);
    expect(efeito(camisas[0])).toEqual({ caixa: 0, resultado: -camisas[0].valor_centavos });
    expect(p.correcao!.movimentos.at(-1)!.custo_unitario_centavos).toBe(2083);
  });
});

describe("lucro do mês", () => {
  it("não conta contagem de estoque como lucro do mês (mas conta no resultado)", () => {
    const c = montarContagem([{ item: "lisa", cor: "Preta", tamanho: "G", real: 5 }], ctx([]), {}, t())!;
    const r = calcularResumo([c], config, T0);
    expect(r.mes.lucro).toBe(0);
    expect(r.resultado).toBe(5 * 1750);
  });
});
