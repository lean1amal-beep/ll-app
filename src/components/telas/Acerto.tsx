"use client";
import { useState } from "react";
import { salvarConfig, salvarLancamento, type Dados } from "@/lib/dados";
import { calcularCaixa } from "@/lib/dominio/calculos";
import { dataParaISO } from "@/lib/dominio/datas";
import { formatarReais } from "@/lib/dominio/dinheiro";
import { montarAjusteSaldo, montarContagem, montarGasto, montarSaida, montarSimples, montarVenda } from "@/lib/dominio/lancar";
import { NOMES_CATEGORIA, type CategoriaGasto, type Lancamento } from "@/lib/dominio/tipos";
import { fechar, ir } from "@/lib/rota";
import { GradeContagem, paraContagens } from "../forms/FormContagem";
import { Alternar, Botao, CampoDinheiro, Campo, Contador, Folha, Linha, Texto, estiloInput, useAviso } from "../ui";

const PASSOS = ["Saldo do Mercado Pago", "Prensa", "Kittl", "Vendas antigas", "Uso próprio", "Gastos antigos", "Estoque de hoje"];

interface LinhaVenda {
  incluir: boolean;
  descricao: string;
  qtd: number;
  preco: number | null;
  dia: string;
  custo: number | null;
  estimado: boolean;
}

interface LinhaGasto {
  incluir: boolean;
  descricao: string;
  categoria: CategoriaGasto;
  valor: number | null;
  dia: string;
  estimado: boolean;
}

const VENDAS_INICIAIS: LinhaVenda[] = [
  { incluir: true, descricao: "Camisas show abril (R$ 50)", qtd: 3, preco: 5000, dia: "2026-04-15", custo: null, estimado: false },
  { incluir: true, descricao: "Camisa show abril (R$ 60)", qtd: 1, preco: 6000, dia: "2026-04-15", custo: null, estimado: false },
  { incluir: true, descricao: "Camisas show abril (R$ 70)", qtd: 4, preco: 7000, dia: "2026-04-15", custo: null, estimado: false },
  { incluir: true, descricao: "Camisas show abril (R$ 80)", qtd: 3, preco: 8000, dia: "2026-04-15", custo: null, estimado: false },
  { incluir: true, descricao: "Boné (venda-teste)", qtd: 1, preco: 4000, dia: "2026-10-05", custo: 3000, estimado: false },
  { incluir: false, descricao: "Pedido de 10 personalizadas", qtd: 10, preco: 4500, dia: "2026-07-15", custo: null, estimado: true },
  { incluir: false, descricao: "Merch Setfire", qtd: 1, preco: null, dia: "2026-06-15", custo: null, estimado: true },
  { incluir: false, descricao: "Merch Bignew", qtd: 1, preco: null, dia: "2026-06-15", custo: null, estimado: true },
  { incluir: false, descricao: "Baby looks", qtd: 3, preco: null, dia: "2026-09-15", custo: null, estimado: true },
];

const GASTOS_INICIAIS: LinhaGasto[] = [
  // Pedidos reais de camisas lisas (valores com frete/passagem, enviados pelo Leandro em 09/10)
  { incluir: true, descricao: "20 camisas Sol do Saara (R$ 20 + R$ 15 metrô)", categoria: "camisa_lisa", valor: 41500, dia: "2026-04-13", estimado: false },
  { incluir: true, descricao: "11 camisas Zimm #12223", categoria: "camisa_lisa", valor: 21834, dia: "2026-07-13", estimado: false },
  { incluir: true, descricao: "12 camisas Zimm #12905", categoria: "camisa_lisa", valor: 25304, dia: "2026-08-05", estimado: false },
  { incluir: true, descricao: "4 camisas Zimm #14459", categoria: "camisa_lisa", valor: 10259, dia: "2026-09-13", estimado: false },
  { incluir: true, descricao: "3 camisas Zimm (plus size, feminina, 2ª linha)", categoria: "camisa_lisa", valor: 7090, dia: "2026-06-15", estimado: true },
  // Agostinho: pedido de 40 (20 G + 20 GG) a R$ 20 em 13/03 — quantidade comprada de fato a confirmar
  { incluir: false, descricao: "Camisas Agostinho (R$ 20 cada)", categoria: "camisa_lisa", valor: null, dia: "2026-03-13", estimado: true },
  { incluir: true, descricao: "2 packs de imagens", categoria: "marketing", valor: 5000, dia: "2026-04-10", estimado: false },
  { incluir: true, descricao: "DTF pedido de 10 camisas", categoria: "dtf", valor: 6000, dia: "2026-07-10", estimado: false },
  { incluir: false, descricao: "Outros DTF (mar a out)", categoria: "dtf", valor: null, dia: "2026-06-15", estimado: true },
  { incluir: false, descricao: "Filme DTF Mercado Livre", categoria: "dtf", valor: null, dia: "2026-10-01", estimado: true },
];

export default function Acerto({ dados }: { dados: Dados }) {
  const avisar = useAviso();
  const acerto = dados.config.acerto;
  const [passo, setPasso] = useState(Math.min(acerto.passo, PASSOS.length + 1));
  const feito = acerto.feitos.includes(passo);

  // Estado dos passos
  const [saldo, setSaldo] = useState<number | null>(null);
  const [prensa, setPrensa] = useState<number | null>(130000);
  const [prensaDia, setPrensaDia] = useState("2026-02-15");
  const [prensaEstimado, setPrensaEstimado] = useState(true);
  const [jaPagouPai, setJaPagouPai] = useState<number | null>(null);
  const [kittl, setKittl] = useState<number | null>(30000);
  const [vendas, setVendas] = useState(VENDAS_INICIAIS);
  const [usoProprio, setUsoProprio] = useState(6);
  const [gastos, setGastos] = useState(GASTOS_INICIAIS);
  const [estoque, setEstoque] = useState<Record<string, number>>({});

  const ir_para = async (n: number, novosFeitos?: number[]) => {
    const concluido = n > PASSOS.length;
    await salvarConfig((c) => ({ ...c, acerto: { passo: n, concluido: c.acerto.concluido || concluido, feitos: novosFeitos ?? c.acerto.feitos } }));
    setPasso(n);
    if (concluido) avisar("Acerto inicial concluído ✓");
  };

  const lancar = async (lancs: Lancamento[]) => {
    for (const l of lancs) await salvarLancamento(l);
    await ir_para(passo + 1, [...new Set([...acerto.feitos, passo])]);
    if (lancs.length) avisar(`${lancs.length} ${lancs.length === 1 ? "lançamento" : "lançamentos"} ✓`);
  };

  const ctx = dados.ctx;
  let conteudo: React.ReactNode = null;
  let montar: (() => Lancamento[]) | null = null;

  switch (passo) {
    case 0:
      conteudo = (
        <>
          <p>Vamos colocar no app o que já aconteceu desde fevereiro. Tudo pode ser editado depois no Histórico.</p>
          <p className="text-cinza">Coisas de antes do app entram no <b>resultado</b> (já me paguei?), mas não mexem no caixa de hoje. O caixa começa pelo saldo atual do Mercado Pago.</p>
          <p className="text-cinza">Se não souber um valor exato, chute e deixe marcado como “estimado”.</p>
        </>
      );
      montar = () => [];
      break;
    case 1:
      conteudo = (
        <>
          <p>A partir de agora, a conta do <b>Mercado Pago é a conta da marca</b>. Abra o app do Mercado Pago e digite o saldo de agora.</p>
          <Campo rotulo="Saldo atual no Mercado Pago">
            <CampoDinheiro valor={saldo} aoMudar={setSaldo} grande autoFocus />
          </Campo>
        </>
      );
      montar = () => (saldo == null ? [] : [montarAjusteSaldo(saldo, calcularCaixa(dados.lancamentos), { observacao: "Acerto inicial" })]);
      break;
    case 2:
      conteudo = (
        <>
          <p>A prensa foi paga pelo seu pai em 12x. Isso é <b>investimento</b> da marca e vira <b>dívida com o pai</b>.</p>
          <Campo rotulo="Valor total da prensa" dica={prensa ? `12x de ${formatarReais(Math.round(prensa / 12))}. Você lembrava de “80 e poucos” por mês: confira com ele.` : undefined}>
            <CampoDinheiro valor={prensa} aoMudar={setPrensa} grande />
          </Campo>
          <Campo rotulo="Quando comprou">
            <input type="date" value={prensaDia} onChange={(e) => setPrensaDia(e.target.value)} className={estiloInput} />
          </Campo>
          <Alternar ligado={prensaEstimado} aoMudar={setPrensaEstimado}>
            Valor estimado
          </Alternar>
          <Campo rotulo="Já devolveu algum dinheiro ao pai? (opcional)">
            <CampoDinheiro valor={jaPagouPai} aoMudar={setJaPagouPai} placeholder="0,00" />
          </Campo>
        </>
      );
      montar = () => {
        if (!prensa) return [];
        const data = dataParaISO(prensaDia);
        const out = [
          montarGasto({ categoria: "equipamento", valor_centavos: prensa, pago_por: "pai", descricao: "Prensa térmica (12x)", historico: true, data, confianca: prensaEstimado ? "estimado" : "confirmado" }),
        ];
        if (jaPagouPai) out.push(montarSimples("pagamento_pai", jaPagouPai, { historico: true, pago_por: "leandro", descricao: "Pagamentos antes do app", confianca: "estimado" }));
        return out;
      };
      break;
    case 3:
      conteudo = (
        <>
          <p>O Kittl Pro (1 ano) foi <b>presente</b> do seu pai: conta como investimento, sem dívida.</p>
          <Campo rotulo="Valor do Kittl">
            <CampoDinheiro valor={kittl} aoMudar={setKittl} grande />
          </Campo>
        </>
      );
      montar = () => (kittl ? [montarGasto({ categoria: "equipamento", valor_centavos: kittl, pago_por: "pai", eh_presente: true, descricao: "Kittl Pro (1 ano)", historico: true, confianca: "estimado", data: dataParaISO("2026-03-01") })] : []);
      break;
    case 4:
      conteudo = (
        <>
          <p>Vendas que você já fez. Marque as que quer lançar e corrija os valores. As sem valor ficam de fora.</p>
          <p className="text-sm text-cinza">O custo das camisas antigas entra no próximo passo (compras antigas), por isso aqui fica zero. O boné tem custo próprio.</p>
          <div className="space-y-4">
            {vendas.map((v, i) => (
              <div key={i} className="rounded-xl border-2 border-linha p-3 space-y-3">
                <div className="flex items-center gap-3">
                  <input type="checkbox" aria-label="incluir" className="w-6 h-6 accent-black shrink-0" checked={v.incluir} onChange={(e) => setVendas(vendas.map((y, j) => (j === i ? { ...y, incluir: e.target.checked } : y)))} />
                  <Texto value={v.descricao} onChange={(e) => setVendas(vendas.map((y, j) => (j === i ? { ...y, descricao: e.target.value } : y)))} />
                </div>
                {v.incluir && (
                  <>
                    <div className="flex gap-3 items-end">
                      <Campo rotulo="Preço cada" className="flex-1">
                        <CampoDinheiro valor={v.preco} aoMudar={(p) => setVendas(vendas.map((y, j) => (j === i ? { ...y, preco: p } : y)))} />
                      </Campo>
                      <Campo rotulo="Qtd">
                        <Contador pequeno valor={v.qtd} min={1} aoMudar={(q) => setVendas(vendas.map((y, j) => (j === i ? { ...y, qtd: q } : y)))} />
                      </Campo>
                    </div>
                    <div className="flex gap-3">
                      <input type="date" value={v.dia} onChange={(e) => setVendas(vendas.map((y, j) => (j === i ? { ...y, dia: e.target.value } : y)))} className={estiloInput} />
                      <label className="flex items-center gap-2 text-sm shrink-0">
                        <input type="checkbox" className="w-5 h-5 accent-black" checked={v.estimado} onChange={(e) => setVendas(vendas.map((y, j) => (j === i ? { ...y, estimado: e.target.checked } : y)))} /> estimado
                      </label>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          <button type="button" className="underline" onClick={() => setVendas([...vendas, { incluir: true, descricao: "", qtd: 1, preco: null, dia: "2026-06-15", custo: null, estimado: true }])}>
            + outra venda
          </button>
          <Linha rotulo="Total marcado" forte valor={formatarReais(vendas.filter((v) => v.incluir && v.preco).reduce((s, v) => s + v.qtd * (v.preco ?? 0), 0))} />
        </>
      );
      montar = () =>
        vendas
          .filter((v) => v.incluir && v.preco)
          .map((v) =>
            montarVenda(
              {
                produto_id: null,
                descricao: v.descricao || "Venda antiga",
                preco_unitario_centavos: v.preco!,
                quantidade: v.qtd,
                forma_pagamento: "pix",
                historico: true,
                cpv_manual_centavos: v.custo != null ? v.custo * v.qtd : 0,
                confianca: v.estimado ? "estimado" : "confirmado",
                data: dataParaISO(v.dia),
                canal: v.descricao.toLowerCase().includes("show") ? "Show" : null,
              },
              ctx,
            ),
          );
      break;
    case 5:
      conteudo = (
        <>
          <p>Camisas da marca que você pegou para usar (inclusive estampas de pedidos). Entra como <b>retirada em produto</b>: não é custo nem venda.</p>
          <Campo rotulo="Quantas, mais ou menos">
            <Contador valor={usoProprio} aoMudar={setUsoProprio} />
          </Campo>
        </>
      );
      montar = () =>
        usoProprio > 0
          ? [montarSaida({ tipo: "retirada_produto", alvo: { item: "peca", cor: dados.config.cores[0] ?? null }, quantidade: usoProprio, historico: true, confianca: "estimado", descricao: "Uso próprio antes do app", data: dataParaISO("2026-08-15") }, ctx)]
          : [];
      break;
    case 6:
      conteudo = (
        <>
          <p>Compras e gastos antigos que <b>você pagou</b>. Entram no resultado. Os sem valor ficam de fora.</p>
          <p className="text-sm text-cinza">Se o Mercado Pago ou o Nubank exportarem extrato em CSV, dá para importar e classificar linha por linha.</p>
          <Botao variante="secundario" className="w-full" onClick={() => ir("importar")}>
            Importar extrato (CSV)
          </Botao>
          <div className="space-y-4">
            {gastos.map((g, i) => (
              <div key={i} className="rounded-xl border-2 border-linha p-3 space-y-3">
                <div className="flex items-center gap-3">
                  <input type="checkbox" aria-label="incluir" className="w-6 h-6 accent-black shrink-0" checked={g.incluir} onChange={(e) => setGastos(gastos.map((y, j) => (j === i ? { ...y, incluir: e.target.checked } : y)))} />
                  <Texto value={g.descricao} onChange={(e) => setGastos(gastos.map((y, j) => (j === i ? { ...y, descricao: e.target.value } : y)))} />
                </div>
                {g.incluir && (
                  <>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <CampoDinheiro valor={g.valor} aoMudar={(v) => setGastos(gastos.map((y, j) => (j === i ? { ...y, valor: v } : y)))} />
                      </div>
                      <select value={g.categoria} onChange={(e) => setGastos(gastos.map((y, j) => (j === i ? { ...y, categoria: e.target.value as CategoriaGasto } : y)))} className={`${estiloInput} w-36`}>
                        {Object.entries(NOMES_CATEGORIA).map(([k, n]) => (
                          <option key={k} value={k}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-3">
                      <input type="date" value={g.dia} onChange={(e) => setGastos(gastos.map((y, j) => (j === i ? { ...y, dia: e.target.value } : y)))} className={estiloInput} />
                      <label className="flex items-center gap-2 text-sm shrink-0">
                        <input type="checkbox" className="w-5 h-5 accent-black" checked={g.estimado} onChange={(e) => setGastos(gastos.map((y, j) => (j === i ? { ...y, estimado: e.target.checked } : y)))} /> estimado
                      </label>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          <button type="button" className="underline" onClick={() => setGastos([...gastos, { incluir: true, descricao: "", categoria: "outro", valor: null, dia: "2026-06-15", estimado: true }])}>
            + outro gasto
          </button>
          <Linha rotulo="Total marcado" forte valor={formatarReais(gastos.filter((g) => g.incluir && g.valor).reduce((s, g) => s + (g.valor ?? 0), 0))} />
        </>
      );
      montar = () =>
        gastos
          .filter((g) => g.incluir && g.valor)
          .map((g) =>
            montarGasto({
              categoria: g.categoria,
              valor_centavos: g.valor!,
              pago_por: "leandro",
              descricao: g.descricao || NOMES_CATEGORIA[g.categoria],
              historico: true,
              confianca: g.estimado ? "estimado" : "confirmado",
              data: dataParaISO(g.dia),
            }),
          );
      break;
    case 7:
      conteudo = (
        <>
          <p>Conte o que você tem <b>hoje</b>: camisas lisas, peças já prensadas, estampas DTF e embalagens.</p>
          <p className="text-sm text-cinza">Essas peças já foram pagas nas compras antigas. Elas entram no estoque pelo custo de referência e voltam a ser custo quando forem vendidas.</p>
          <GradeContagem dados={dados} valores={estoque} setValores={setEstoque} />
        </>
      );
      montar = () => {
        const l = montarContagem(paraContagens(estoque), ctx, { observacao: "Estoque inicial (acerto)", confianca: "estimado" });
        return l ? [l] : [];
      };
      break;
    default:
      conteudo = (
        <>
          <p className="text-2xl font-bold">Pronto ✓</p>
          <p>O painel já mostra seu caixa, a dívida com o pai e quanto falta para a marca se pagar.</p>
          <p className="text-cinza">Próximos passos: cadastrar o catálogo (Ajustes), criar a campanha “Campos 31/10” e ativar o lembrete de domingo.</p>
        </>
      );
  }

  const ultimo = passo > PASSOS.length;
  return (
    <Folha
      titulo={ultimo ? "Acerto inicial" : passo === 0 ? "Acerto inicial" : `${passo}/${PASSOS.length} · ${PASSOS[passo - 1]}`}
      aoFechar={fechar}
      rodape={
        ultimo ? (
          <Botao className="w-full text-lg" onClick={fechar}>
            Ir para o painel
          </Botao>
        ) : passo === 0 ? (
          <div className="grid grid-cols-2 gap-2">
            <Botao variante="secundario" onClick={fechar}>
              Depois
            </Botao>
            <Botao onClick={() => void ir_para(1)}>Começar</Botao>
          </div>
        ) : (
          <div className="space-y-2">
            {feito && <div className="text-sm text-cinza">✓ Este passo já foi lançado. Lançar de novo duplica.</div>}
            <div className="grid grid-cols-3 gap-2">
              <Botao variante="secundario" onClick={() => void ir_para(passo - 1)}>
                Voltar
              </Botao>
              {feito ? (
                <>
                  <Botao variante="secundario" onClick={() => montar && void lancar(montar())}>
                    De novo
                  </Botao>
                  <Botao onClick={() => void ir_para(passo + 1)}>Seguir</Botao>
                </>
              ) : (
                <>
                  <Botao variante="secundario" onClick={() => void ir_para(passo + 1)}>
                    Pular
                  </Botao>
                  <Botao onClick={() => montar && void lancar(montar())}>Salvar</Botao>
                </>
              )}
            </div>
          </div>
        )
      }
    >
      {!ultimo && passo > 0 && (
        <div className="flex gap-1">
          {PASSOS.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i < passo ? "bg-tinta" : "bg-linha"}`} />
          ))}
        </div>
      )}
      {conteudo}
    </Folha>
  );
}
