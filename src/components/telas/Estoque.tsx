"use client";
import { useMemo, useState } from "react";
import { salvarConfig, salvarLancamento, type Dados } from "@/lib/dados";
import { formatarReais } from "@/lib/dominio/dinheiro";
import { chaveEstoque, quantidade as qtdEstoque, valorEstoque, valorPosicao, type PosicaoEstoque } from "@/lib/dominio/estoque";
import { montarContagem, montarCorrecaoCusto } from "@/lib/dominio/lancar";
import { nomesModelos, tamanhosDo, type ItemEstoque } from "@/lib/dominio/tipos";
import { ir } from "@/lib/rota";
import { Alternar, Botao, CampoDinheiro, Chips, Contador, Vazio, cx, useAviso } from "../ui";

type Aba = "lisas" | "prontas" | "insumos";

interface Alvo {
  item: ItemEstoque;
  produto_id?: string | null;
  modelo?: string | null;
  cor?: string | null;
  tamanho?: string | null;
  nome: string;
}

export default function Estoque({ dados }: { dados: Dados }) {
  const [aba, setAba] = useState<Aba>("prontas");
  const [contando, setContando] = useState<Alvo | null>(null);
  const [corrigindo, setCorrigindo] = useState(false);
  const est = dados.ctx.estoque;
  const minimo = dados.config.estoque_minimo;

  const prontas = useMemo(() => {
    const porProduto = new Map<string, PosicaoEstoque[]>();
    for (const p of est.values()) {
      if (p.item !== "pronta" || p.quantidade === 0) continue;
      const k = p.produto_id ?? "";
      porProduto.set(k, [...(porProduto.get(k) ?? []), p]);
    }
    return [...porProduto.entries()];
  }, [est]);

  const valorDe = (item: ItemEstoque) => [...est.values()].filter((p) => p.item === item).reduce((s, p) => s + valorPosicao(p), 0);

  const celula = (a: Alvo, rotulo: string) => {
    const q = qtdEstoque(est, a);
    // Só avisa em posições que já tiveram movimento (tamanho que ele nunca teve não fica vermelho).
    const baixo = minimo[a.item] > 0 && q < minimo[a.item] && est.has(chaveEstoque(a));
    return (
      <button
        key={rotulo}
        type="button"
        onClick={() => setContando(a)}
        className={cx("rounded-xl border-2 min-h-16 flex flex-col items-center justify-center active:scale-95 transition", baixo ? "border-alerta" : "border-linha", q === 0 && "text-cinza")}
      >
        <span className="text-xs">{rotulo}</span>
        <span className={cx("num text-xl font-medium", (baixo || q < 0) && "text-alerta")}>{q}</span>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-cinza font-medium">Estoque parado</div>
          <div className="num text-3xl font-medium">{formatarReais(valorEstoque(est))}</div>
        </div>
        <button type="button" className="underline text-sm" onClick={() => ir("novo/contagem")}>
          Contar tudo
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Botao onClick={() => ir("novo/prensar")}>Prensar</Botao>
        <Botao variante="secundario" onClick={() => ir("novo/gasto")}>
          Comprei material
        </Botao>
      </div>

      <Chips
        opcoes={[
          { valor: "prontas", rotulo: "Prontas" },
          { valor: "lisas", rotulo: "Lisas" },
          { valor: "insumos", rotulo: "Insumos" },
        ]}
        valor={aba}
        aoMudar={setAba}
      />

      {aba === "lisas" && (
        <div className="space-y-5">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-sm text-cinza">Valor: {formatarReais(valorDe("lisa"))} · toque num número para corrigir</div>
            <button type="button" className="underline text-sm shrink-0" onClick={() => setCorrigindo(true)}>
              Corrigir custo
            </button>
          </div>
          {nomesModelos(dados.config).flatMap((modelo, i) =>
            dados.config.cores.map((cor) => (
              <div key={`${modelo}${cor}`}>
                <div className="font-bold mb-2">
                  {cor}
                  {nomesModelos(dados.config).length > 1 && <span className="font-normal text-cinza"> · {modelo}</span>}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {tamanhosDo(dados.config, modelo).map((t) =>
                    celula({ item: "lisa", modelo: i === 0 ? null : modelo, cor, tamanho: t, nome: `Lisa ${i === 0 ? "" : modelo + " "}${cor} ${t}` }, t),
                  )}
                </div>
              </div>
            )),
          )}
        </div>
      )}

      {aba === "prontas" && (
        <div className="space-y-5">
          {prontas.length === 0 ? (
            <Vazio>Nenhuma peça pronta. Use “Prensar” para criar peças prontas (ex.: antes de um evento).</Vazio>
          ) : (
            <div className="text-sm text-cinza">Valor: {formatarReais(valorDe("pronta"))}</div>
          )}
          <Botao variante="secundario" className="w-full" onClick={() => ir("novo/prontas")}>
            Adicionar prontas que já tenho (lista)
          </Botao>
          {prontas.map(([pid, posicoes]) => {
            const prod = dados.produtos.find((p) => p.id === pid);
            const total = posicoes.reduce((s, p) => s + p.quantidade, 0);
            return (
              <div key={pid}>
                <div className="flex justify-between font-bold mb-2">
                  <span>{prod?.nome ?? "Produto removido"}</span>
                  <span className="num">{total}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {posicoes
                    .sort(
                      (a, b) =>
                        (a.modelo ?? "").localeCompare(b.modelo ?? "") ||
                        tamanhosDo(dados.config, a.modelo).indexOf(a.tamanho ?? "") - tamanhosDo(dados.config, b.modelo).indexOf(b.tamanho ?? ""),
                    )
                    .map((p) =>
                      celula(
                        { item: "pronta", produto_id: pid, modelo: p.modelo, cor: p.cor, tamanho: p.tamanho, nome: `${prod?.nome ?? ""} ${p.modelo ?? ""} ${p.cor ?? ""} ${p.tamanho ?? ""}` },
                        [siglaModelo(p.modelo), p.cor && dados.config.cores.length > 1 ? p.cor.slice(0, 3) : null, p.tamanho ?? "s/ tam."].filter(Boolean).join(" "),
                      ),
                    )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {aba === "insumos" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {celula({ item: "dtf", nome: "Estampas DTF" }, "Estampas DTF")}
            {celula({ item: "embalagem", nome: "Embalagens" }, "Embalagens")}
          </div>
          <div className="text-sm text-cinza">
            Valor DTF: {formatarReais(valorDe("dtf"))} · Embalagens: {formatarReais(valorDe("embalagem"))}
          </div>
        </div>
      )}

      <AlertaMinimo dados={dados} />

      {contando && <ContarUm dados={dados} alvo={contando} aoFechar={() => setContando(null)} />}
      {corrigindo && <CorrigirCusto dados={dados} aoFechar={() => setCorrigindo(false)} />}
    </div>
  );
}

function ContarUm({ dados, alvo, aoFechar }: { dados: Dados; alvo: Alvo; aoFechar: () => void }) {
  const avisar = useAviso();
  const atual = qtdEstoque(dados.ctx.estoque, alvo);
  const [real, setReal] = useState(Math.max(0, atual));
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end" onClick={aoFechar}>
      <div className="bg-papel w-full rounded-t-3xl p-6 pb-[calc(env(safe-area-inset-bottom)+24px)] space-y-5 animar-subir" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="font-bold text-lg">{alvo.nome.trim()}</div>
          <div className="text-cinza">O app acha que tem {atual}. Quantas tem de verdade?</div>
        </div>
        <div className="flex justify-center">
          <Contador valor={real} aoMudar={setReal} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            onClick={async () => {
              const l = montarContagem([{ ...alvo, real }], dados.ctx);
              if (l) {
                await salvarLancamento(l);
                avisar(`Corrigido para ${real} ✓`);
              }
              aoFechar();
            }}
          >
            Salvar
          </Botao>
        </div>
      </div>
    </div>
  );
}

function CorrigirCusto({ dados, aoFechar }: { dados: Dados; aoFechar: () => void }) {
  const avisar = useAviso();
  const lisas = [...dados.ctx.estoque.values()].filter((p) => p.item === "lisa" && p.quantidade > 0);
  const qtd = lisas.reduce((s, p) => s + p.quantidade, 0);
  const atual = qtd ? Math.round(lisas.reduce((s, p) => s + p.quantidade * p.custo_medio, 0) / qtd) : 0;
  const [custo, setCusto] = useState<number | null>(dados.config.custos_referencia.lisa_centavos);
  const [referencia, setReferencia] = useState(true);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end" onClick={aoFechar}>
      <div className="bg-papel w-full rounded-t-3xl p-6 pb-[calc(env(safe-area-inset-bottom)+24px)] space-y-5 animar-subir" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="font-bold text-lg">Corrigir custo das lisas</div>
          <div className="text-cinza">
            {qtd} lisas no estoque, hoje a {formatarReais(atual)} cada (média). Qual o custo real de cada uma, com frete?
          </div>
        </div>
        <CampoDinheiro valor={custo} aoMudar={setCusto} grande />
        <Alternar ligado={referencia} aoMudar={setReferencia}>
          Usar esse valor também nas próximas contas <span className="text-cinza text-sm block">Muda o custo de referência da lisa em Ajustes</span>
        </Alternar>
        <div className="grid grid-cols-2 gap-2">
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            disabled={!custo}
            onClick={async () => {
              const l = montarCorrecaoCusto("lisa", custo!, dados.ctx, { confianca: "estimado" });
              if (l) await salvarLancamento(l);
              if (referencia) await salvarConfig((c) => ({ ...c, custos_referencia: { ...c.custos_referencia, lisa_centavos: custo! } }));
              avisar(`Custo das lisas: ${formatarReais(custo!)} ✓`);
              aoFechar();
            }}
          >
            Salvar
          </Botao>
        </div>
      </div>
    </div>
  );
}

function AlertaMinimo({ dados }: { dados: Dados }) {
  const m = dados.config.estoque_minimo;
  const linha = (item: ItemEstoque, rotulo: string) => (
    <div className="flex items-center justify-between">
      <span>{rotulo}</span>
      <Contador pequeno valor={m[item]} aoMudar={(n) => void salvarConfig((c) => ({ ...c, estoque_minimo: { ...c.estoque_minimo, [item]: n } }))} />
    </div>
  );
  return (
    <details className="border-t border-linha pt-3">
      <summary className="min-h-12 flex items-center font-medium cursor-pointer">Avisar quando tiver menos de…</summary>
      <div className="space-y-2 pt-2 text-sm">
        {linha("lisa", "Lisas (cada cor/tamanho)")}
        {linha("pronta", "Prontas (cada estampa/tamanho)")}
        {linha("dtf", "Estampas DTF")}
        {linha("embalagem", "Embalagens")}
        <div className="text-cinza">0 = sem aviso</div>
      </div>
    </details>
  );
}

/** "Baby look" → "BL" (para caber na célula). */
export function siglaModelo(m: string | null | undefined) {
  if (!m) return null;
  return m
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
