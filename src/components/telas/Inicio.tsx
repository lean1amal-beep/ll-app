"use client";
import { useMemo, useSyncExternalStore } from "react";
import type { Dados } from "@/lib/dados";
import { calcularResumo } from "@/lib/dominio/calculos";
import { nomeMes } from "@/lib/dominio/datas";
import { formatarReais } from "@/lib/dominio/dinheiro";
import { alertasEstoque } from "@/lib/dominio/estoque";
import { ir } from "@/lib/rota";
import { SUPABASE_ATIVO } from "@/lib/supabase";
import { estadoSync, ouvirSync } from "@/lib/sync";
import { Botao, Cartao, Icone, Linha, Reais, cx } from "../ui";

export default function Inicio({ dados }: { dados: Dados }) {
  const r = useMemo(() => calcularResumo(dados.lancamentos, dados.config), [dados]);
  const alertas = useMemo(() => alertasEstoque(dados.ctx.estoque, dados.config), [dados]);
  const estado = useSyncExternalStore(ouvirSync, estadoSync, estadoSync);
  // Em modo local não há para onde sincronizar.
  const sync = SUPABASE_ATIVO ? estado : { ...estado, pendentes: 0, erro: null };
  const camp = dados.campanhaAtiva;
  const pct = Math.min(1, r.progresso);

  return (
    <div className="space-y-4">
      {!dados.config.acerto.concluido && (
        <Cartao escuro onClick={() => ir("acerto")}>
          <div className="font-bold text-lg">Fazer o acerto inicial</div>
          <div className="opacity-70 text-sm">Saldo do Mercado Pago, prensa, vendas antigas e estoque. Leva uns 10 minutos.</div>
        </Cartao>
      )}

      {/* Livre pra gastar */}
      <Cartao className="border-tinta">
        <div className="text-xs uppercase tracking-wider text-cinza font-medium">Livre pra gastar</div>
        <div className={cx("num text-5xl font-medium py-2", r.livre < 0 && "text-alerta")}>{formatarReais(r.livre)}</div>
        {r.livre < 0 && <div className="text-alerta text-sm font-medium pb-2">Negativo: segure gastos até entrar mais venda.</div>}
        <div className="text-sm space-y-0.5">
          <Linha rotulo="Caixa da LL (Mercado Pago)" valor={<Reais c={r.caixa} />} />
          <Linha rotulo="− Reserva do pai" valor={formatarReais(r.divida.reserva_pendente)} />
          <Linha rotulo="− Colchão" valor={formatarReais(r.colchao)} />
          {r.fixas_pendentes_total > 0 && (
            <Linha rotulo={`− Contas do mês (${r.fixas_pendentes.map((f) => f.nome).join(", ")})`} valor={formatarReais(r.fixas_pendentes_total)} />
          )}
        </div>
        <button type="button" onClick={() => ir("novo/saldo")} className="text-sm underline mt-2 text-cinza">
          Conferir com o saldo do Mercado Pago
        </button>
      </Cartao>

      {/* Alertas */}
      {(camp || sync.pendentes > 0 || alertas.length > 0 || sync.erro) && (
        <div className="space-y-2">
          {camp && (
            <button type="button" onClick={() => ir(`campanha/${camp.id}`)} className="w-full flex items-center gap-3 rounded-xl bg-tinta text-papel px-4 min-h-12 text-left">
              <Icone nome="bandeira" className="w-5 h-5" />
              <span className="flex-1">
                Campanha ativa: <b>{camp.nome}</b>
              </span>
              <Icone nome="seta" className="w-5 h-5" />
            </button>
          )}
          {sync.pendentes > 0 && (
            <div className="flex items-center gap-3 rounded-xl border-2 border-linha px-4 min-h-12">
              <Icone nome={sync.online ? "nuvem" : "semNuvem"} className="w-5 h-5" />
              <span className="flex-1 text-sm">
                {sync.pendentes} {sync.pendentes === 1 ? "item aguardando" : "itens aguardando"} sincronizar{!sync.online && " (sem internet)"}. Está salvo no celular.
              </span>
            </div>
          )}
          {sync.erro && (
            <div className="flex items-center gap-3 rounded-xl border-2 border-alerta text-alerta px-4 min-h-12 text-sm">
              <Icone nome="alerta" className="w-5 h-5" /> Erro ao sincronizar: {sync.erro}
            </div>
          )}
          {alertas.length > 0 && (
            <button type="button" onClick={() => ir("estoque")} className="w-full flex items-start gap-3 rounded-xl border-2 border-alerta px-4 py-3 text-left">
              <Icone nome="alerta" className="w-5 h-5 text-alerta shrink-0 mt-0.5" />
              <span className="flex-1 text-sm">
                <b>Estoque baixo:</b>{" "}
                {alertas
                  .slice(0, 5)
                  .map((a) => `${nomeItem(a.item, dados.produtos.find((p) => p.id === a.produto_id)?.nome)} ${[a.cor, a.tamanho].filter(Boolean).join(" ")} (${a.quantidade})`.trim())
                  .join(", ")}
                {alertas.length > 5 && ` e mais ${alertas.length - 5}`}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Já me paguei? */}
      <Cartao>
        <div className="flex items-baseline justify-between">
          <div className="text-xs uppercase tracking-wider text-cinza font-medium">Já me paguei?</div>
          <div className="font-bold">{r.ja_me_paguei ? "Sim ✓" : "Ainda não"}</div>
        </div>
        <div className="h-3 rounded-full bg-fundo mt-3 overflow-hidden border border-linha">
          <div className="h-full bg-tinta transition-all" style={{ width: `${Math.round(pct * 100)}%` }} />
        </div>
        <div className="flex justify-between text-sm mt-2">
          <span className="num">{Math.round(r.progresso * 100)}% dos custos cobertos</span>
          <span>
            Resultado <Reais c={r.resultado} />
          </span>
        </div>
        {!r.ja_me_paguei && (
          <div className="mt-3 text-lg">
            Faltam <b className="num">~{r.faltam_camisas}</b> camisas
            <span className="text-sm text-cinza block">a {formatarReais(r.lucro_medio_peca)} de lucro médio por peça</span>
          </div>
        )}
      </Cartao>

      {/* Este mês */}
      <Cartao>
        <div className="text-xs uppercase tracking-wider text-cinza font-medium mb-2">Este mês · {nomeMes(r.mes.mes)}</div>
        <div className="grid grid-cols-2 gap-3">
          <Numero rotulo={`Vendas (${r.mes.vendas_qtd} ${r.mes.vendas_qtd === 1 ? "peça" : "peças"})`} c={r.mes.vendas_valor} />
          <Numero rotulo="Gastos" c={r.mes.gastos} />
          <Numero rotulo="Lucro" c={r.mes.lucro} />
          <Numero rotulo="Retiradas" c={r.mes.retiradas} />
        </div>
      </Cartao>

      {/* Dívida com o pai */}
      {r.divida.total > 0 && (
        <Cartao>
          <div className="text-xs uppercase tracking-wider text-cinza font-medium mb-1">Dívida com o pai (prensa)</div>
          <div className="h-2 rounded-full bg-fundo overflow-hidden border border-linha my-2">
            <div className="h-full bg-tinta" style={{ width: `${Math.round((r.divida.pago / r.divida.total) * 100)}%` }} />
          </div>
          <Linha rotulo="Total" valor={formatarReais(r.divida.total)} />
          <Linha rotulo="Pago" valor={formatarReais(r.divida.pago)} />
          <Linha rotulo="Falta" valor={formatarReais(r.divida.falta)} forte />
          <Linha rotulo={`Separado (${dados.config.pct_pai}% das vendas)`} valor={formatarReais(r.divida.reserva_pendente)} />
          {r.divida.falta > 0 && (
            <Botao variante="secundario" className="w-full mt-3" onClick={() => ir("novo/pai")}>
              Paguei meu pai
            </Botao>
          )}
        </Cartao>
      )}

      <div className="text-sm text-cinza space-y-1 px-1">
        <div>
          Estoque parado: <span className="num">{formatarReais(r.valor_estoque)}</span>
        </div>
        {r.estimado > 0 && <div>{Math.round(r.estimado * 100)}% dos valores são estimados</div>}
      </div>
    </div>
  );
}

function Numero({ rotulo, c }: { rotulo: string; c: number }) {
  return (
    <div>
      <div className="text-sm text-cinza">{rotulo}</div>
      <Reais c={c} className="text-xl font-medium" />
    </div>
  );
}

export function nomeItem(item: string, produto?: string) {
  if (item === "lisa") return "Lisa";
  if (item === "dtf") return "DTF";
  if (item === "embalagem") return "Embalagem";
  return produto ?? "Pronta";
}
