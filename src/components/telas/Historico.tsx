"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { apagarLancamento, restaurarLancamento, type Dados } from "@/lib/dados";
import { db } from "@/lib/db";
import { efeito, lucroVenda } from "@/lib/dominio/calculos";
import { dataCurta, diaBR, horaBR, mesBR, nomeMes } from "@/lib/dominio/datas";
import { formatarReais } from "@/lib/dominio/dinheiro";
import { NOMES_CATEGORIA, NOMES_PAGAMENTO, NOMES_TIPO, type CategoriaGasto, type Lancamento } from "@/lib/dominio/tipos";
import { fechar, ir, substituir } from "@/lib/rota";
import { supabase } from "@/lib/supabase";
import { Botao, Chips, Folha, Linha, Reais, Vazio, cx, estiloInput, useAviso } from "../ui";

type Filtro = "todos" | "vendas" | "gastos" | "estoque" | "dinheiro";

const GRUPOS: Record<Filtro, string[]> = {
  todos: [],
  vendas: ["venda"],
  gastos: ["gasto", "investimento"],
  estoque: ["prensagem", "perda", "retirada_produto", "ajuste_estoque"],
  dinheiro: ["aporte", "retirada_dinheiro", "pagamento_pai", "ajuste_saldo"],
};

export function descrever(l: Lancamento, dados: Dados): string {
  const prod = dados.produtos.find((p) => p.id === l.produto_id)?.nome;
  switch (l.tipo) {
    case "venda":
      return `${l.quantidade > 1 ? `${l.quantidade}× ` : ""}${prod ?? l.descricao ?? "Venda"}${l.tamanho ? ` ${l.tamanho}` : ""}`;
    case "gasto":
    case "investimento":
      return l.descricao || NOMES_CATEGORIA[l.categoria as CategoriaGasto] || NOMES_TIPO[l.tipo];
    case "prensagem":
      return `Prensou ${l.quantidade}× ${prod ?? ""}`;
    case "perda":
      return `Perda: ${l.quantidade}× ${prod ?? nomeAlvo(l.categoria)}${l.descricao ? ` (${l.descricao})` : ""}`;
    case "retirada_produto":
      return `Peguei ${l.quantidade}× ${prod ?? nomeAlvo(l.categoria)}`;
    case "ajuste_estoque":
      return `Contagem de estoque (${l.movimentos.length} ${l.movimentos.length === 1 ? "item" : "itens"})`;
    default:
      return l.descricao ? `${NOMES_TIPO[l.tipo]}: ${l.descricao}` : NOMES_TIPO[l.tipo];
  }
}

function nomeAlvo(c: string | null) {
  return c === "peca" ? "camisa" : c === "lisa" ? "lisa" : c === "dtf" ? "estampa DTF" : c === "embalagem" ? "embalagem" : "peça";
}

/** Valor que aparece na lista: o efeito no caixa (ou no resultado, quando não mexe no caixa). */
function valorExibido(l: Lancamento): number | null {
  const e = efeito(l);
  if (l.tipo === "venda") return l.valor_centavos;
  if (e.caixa !== 0) return e.caixa;
  if (l.tipo === "prensagem" || l.tipo === "retirada_produto") return null;
  if (e.resultado !== 0) return e.resultado;
  if (l.tipo === "gasto" || l.tipo === "investimento" || l.tipo === "pagamento_pai") return -l.valor_centavos;
  return l.valor_centavos || null;
}

export default function Historico({ dados }: { dados: Dados }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [mes, setMes] = useState<string>("");
  const [campanha, setCampanha] = useState<string>("");
  const [soEstimados, setSoEstimados] = useState(false);
  const pendentes = useLiveQuery(async () => new Set((await db.lancamentos.where("_pendente").equals(1).primaryKeys()) as string[]));

  const meses = useMemo(() => [...new Set(dados.lancamentos.map((l) => mesBR(l.data)))].sort().reverse(), [dados.lancamentos]);
  const lista = useMemo(
    () =>
      dados.lancamentos
        .filter((l) => filtro === "todos" || GRUPOS[filtro].includes(l.tipo))
        .filter((l) => !mes || mesBR(l.data) === mes)
        .filter((l) => !campanha || l.campanha_id === campanha)
        .filter((l) => !soEstimados || l.confianca === "estimado")
        .sort((a, b) => b.data.localeCompare(a.data) || b.created_at.localeCompare(a.created_at)),
    [dados.lancamentos, filtro, mes, campanha, soEstimados],
  );

  const porDia = useMemo(() => {
    const g: [string, Lancamento[]][] = [];
    for (const l of lista) {
      const d = diaBR(l.data);
      if (g.length && g[g.length - 1][0] === d) g[g.length - 1][1].push(l);
      else g.push([d, [l]]);
    }
    return g;
  }, [lista]);

  return (
    <div className="space-y-4">
      <Chips
        opcoes={[
          { valor: "todos", rotulo: "Tudo" },
          { valor: "vendas", rotulo: "Vendas" },
          { valor: "gastos", rotulo: "Gastos" },
          { valor: "estoque", rotulo: "Estoque" },
          { valor: "dinheiro", rotulo: "Dinheiro" },
        ]}
        valor={filtro}
        aoMudar={setFiltro}
      />
      <div className="flex gap-2">
        <select value={mes} onChange={(e) => setMes(e.target.value)} className={cx(estiloInput, "flex-1 min-w-0")}>
          <option value="">Todos os meses</option>
          {meses.map((m) => (
            <option key={m} value={m}>
              {nomeMes(m)}
            </option>
          ))}
        </select>
        <select value={campanha} onChange={(e) => setCampanha(e.target.value)} className={cx(estiloInput, "flex-1 min-w-0")}>
          <option value="">Toda campanha</option>
          {dados.campanhas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={soEstimados} onChange={(e) => setSoEstimados(e.target.checked)} className="w-5 h-5 accent-black" /> Só estimados
      </label>

      {lista.length === 0 && <Vazio>Nada lançado {filtro !== "todos" || mes || campanha ? "com esses filtros" : "ainda. Toque no + para lançar"}.</Vazio>}

      {porDia.map(([dia, ls]) => (
        <div key={dia}>
          <div className="text-xs uppercase tracking-wider text-cinza font-medium py-2 sticky top-0 bg-papel">{dataCurta(`${dia}T15:00:00Z`)}</div>
          <div className="divide-y divide-linha">
            {ls.map((l) => {
              const v = valorExibido(l);
              return (
                <button key={l.id} type="button" onClick={() => ir(`lanc/${l.id}`)} className="w-full flex items-center gap-3 py-3 text-left">
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{descrever(l, dados)}</div>
                    <div className="text-xs text-cinza truncate">
                      {[
                        NOMES_TIPO[l.tipo],
                        l.forma_pagamento && NOMES_PAGAMENTO[l.forma_pagamento],
                        l.confianca === "estimado" && "estimado",
                        l.historico && "antes do app",
                        dados.campanhas.find((c) => c.id === l.campanha_id)?.nome,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  {pendentes?.has(l.id) && <span className="w-2 h-2 rounded-full bg-cinza shrink-0" title="aguardando sincronizar" />}
                  {v != null && <Reais c={v} sinal={l.tipo === "venda" || v > 0} className="shrink-0 font-medium" />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const ROTA_EDITAR: Partial<Record<Lancamento["tipo"], string>> = {
  venda: "venda",
  gasto: "gasto",
  investimento: "gasto",
  prensagem: "prensar",
  perda: "perda",
  retirada_produto: "retirada",
  retirada_dinheiro: "retirada",
  aporte: "aporte",
  pagamento_pai: "pai",
  ajuste_saldo: "saldo",
};

export function rotaEditar(l: Lancamento) {
  const r = ROTA_EDITAR[l.tipo];
  return r ? `editar/${r}/${l.id}` : null;
}

/** Detalhe de um lançamento. */
export function DetalheLancamento({ dados, id }: { dados: Dados; id: string }) {
  const avisar = useAviso();
  const l = useLiveQuery(() => db.lancamentos.get(id), [id]);
  const [confirmar, setConfirmar] = useState(false);
  const [foto, setFoto] = useState<string | null>(null);
  const arquivoLocal = useLiveQuery(() => db.arquivos.get(id), [id]);

  useEffect(() => {
    let url: string | null = null;
    if (arquivoLocal) {
      url = URL.createObjectURL(arquivoLocal.blob);
      setFoto(url);
    } else if (l?.comprovante_url) {
      supabase()
        ?.storage.from("comprovantes")
        .createSignedUrl(l.comprovante_url, 3600)
        .then(({ data }) => setFoto(data?.signedUrl ?? null));
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [arquivoLocal, l?.comprovante_url]);

  if (l === undefined) return null;
  if (!l)
    return (
      <Folha titulo="Lançamento" aoFechar={fechar}>
        <Vazio>Não encontrado.</Vazio>
      </Folha>
    );

  const e = efeito(l);
  const prod = dados.produtos.find((p) => p.id === l.produto_id);
  const editar = rotaEditar(l);
  return (
    <Folha
      titulo={NOMES_TIPO[l.tipo]}
      aoFechar={fechar}
      rodape={
        l.deleted_at ? (
          <Botao
            className="w-full"
            onClick={async () => {
              await restaurarLancamento(l.id);
              avisar("Restaurado ✓");
            }}
          >
            Restaurar
          </Botao>
        ) : confirmar ? (
          <div className="grid grid-cols-2 gap-2">
            <Botao variante="secundario" onClick={() => setConfirmar(false)}>
              Cancelar
            </Botao>
            <Botao
              variante="perigo"
              onClick={async () => {
                await apagarLancamento(l.id);
                fechar();
                avisar("Apagado", () => void restaurarLancamento(l.id));
              }}
            >
              Apagar mesmo
            </Botao>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Botao variante="secundario" onClick={() => setConfirmar(true)}>
              Apagar
            </Botao>
            <Botao disabled={!editar} onClick={() => editar && substituir(editar)}>
              Editar
            </Botao>
          </div>
        )
      }
    >
      <div>
        <div className="text-xl font-bold">{descrever(l, dados)}</div>
        <div className="text-cinza">
          {dataCurta(l.data)} às {horaBR(l.data)}
        </div>
        {l.deleted_at && <div className="text-alerta font-medium mt-1">Apagado</div>}
      </div>
      <div>
        {l.tipo === "venda" && (
          <>
            <Linha rotulo="Valor" valor={formatarReais(l.valor_centavos)} />
            <Linha rotulo="Taxa" valor={formatarReais(l.taxa_centavos)} />
            <Linha rotulo="Custo das peças" valor={formatarReais(l.cpv_centavos)} />
            <Linha rotulo="Lucro" valor={<Reais c={lucroVenda(l)} />} forte />
            <Linha rotulo="Reserva do pai" valor={l.historico ? "—" : formatarReais(Math.round((l.valor_centavos * dados.config.pct_pai) / 100))} />
          </>
        )}
        {l.tipo !== "venda" && l.valor_centavos !== 0 && <Linha rotulo="Valor" valor={<Reais c={l.valor_centavos} />} forte />}
        {l.tipo !== "venda" && l.cpv_centavos !== 0 && <Linha rotulo="Custo" valor={formatarReais(l.cpv_centavos)} />}
        <Linha rotulo="Efeito no caixa" valor={<Reais c={e.caixa} sinal />} />
        <Linha rotulo="Efeito no resultado" valor={<Reais c={e.resultado} sinal />} />
      </div>
      <div className="text-sm space-y-1">
        {[
          ["Pagamento", l.forma_pagamento && NOMES_PAGAMENTO[l.forma_pagamento]],
          ["Produto", prod?.nome],
          ["Cor / tamanho", [l.cor, l.tamanho].filter(Boolean).join(" ")],
          ["Peça", l.modo_venda === "pronta" ? "Já estava pronta" : l.modo_venda === "sob_demanda" ? "Sob demanda" : null],
          ["Canal", l.canal],
          ["Categoria", l.categoria && (NOMES_CATEGORIA[l.categoria as CategoriaGasto] ?? null)],
          ["Pago por", l.tipo === "gasto" || l.tipo === "investimento" || l.tipo === "pagamento_pai" ? { marca: "Conta da marca", leandro: "Meu bolso", pai: l.eh_presente ? "Meu pai (presente)" : "Meu pai (dívida)" }[l.pago_por] : null],
          ["Campanha", dados.campanhas.find((c) => c.id === l.campanha_id)?.nome],
          ["Confiança", l.confianca === "estimado" ? "Estimado" : null],
          ["", l.historico ? "Antes do app (não mexe no caixa nem no estoque)" : null],
          ["Observação", l.observacao],
        ]
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <Linha key={`${k}${v}`} rotulo={k} valor={<span className="font-sans">{v}</span>} />
          ))}
      </div>
      {l.movimentos.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider text-cinza font-medium mb-1">Estoque</div>
          {l.movimentos.map((m, i) => (
            <Linha
              key={i}
              rotulo={`${m.item === "pronta" ? dados.produtos.find((p) => p.id === m.produto_id)?.nome ?? "Pronta" : m.item === "lisa" ? "Lisa" : m.item === "dtf" ? "DTF" : "Embalagem"} ${[m.cor, m.tamanho].filter(Boolean).join(" ")}`}
              valor={`${m.quantidade > 0 ? "+" : ""}${m.quantidade} × ${formatarReais(m.custo_unitario_centavos)}`}
            />
          ))}
        </div>
      )}
      {foto && (
        <a href={foto} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto} alt="comprovante" className="w-full rounded-xl border-2 border-linha" />
        </a>
      )}
    </Folha>
  );
}
