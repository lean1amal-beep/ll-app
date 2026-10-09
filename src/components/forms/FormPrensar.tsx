"use client";
import { useState } from "react";
import { formatarReais } from "@/lib/dominio/dinheiro";
import { controla, quantidade as qtdEstoque } from "@/lib/dominio/estoque";
import { montarPrensagem } from "@/lib/dominio/lancar";
import { fechar } from "@/lib/rota";
import { MiniProduto } from "../Produto";
import { Alternar, Botao, Campo, Chips, Contador, Folha, cx } from "../ui";
import { Campanha } from "./FormVenda";
import { EscolhaModelo, MaisOpcoes, useCtx, useExtras, useSalvar, type PropsForm } from "./comum";
import { tamanhosDo } from "@/lib/dominio/tipos";

export default function FormPrensar({ dados, original }: PropsForm) {
  const ctx = useCtx(dados, original);
  const salvar = useSalvar();
  const { extras, mudar, campos } = useExtras(dados, original);
  const camisetas = dados.produtos.filter((p) => (p.ativo || p.id === original?.produto_id) && p.tipo === "camiseta");
  const [produtoId, setProdutoId] = useState<string | null>(original?.produto_id ?? null);
  const produto = dados.produtos.find((p) => p.id === produtoId);
  const [cor, setCor] = useState<string | null>(original?.cor ?? null);
  const corEfetiva = cor ?? produto?.cor_padrao ?? dados.config.cores[0] ?? null;
  const [modelo, setModelo] = useState<string | null>(original?.modelo ?? null);
  const [qtds, setQtds] = useState<Record<string, number>>(() => {
    const q: Record<string, number> = {};
    for (const m of original?.movimentos ?? []) if (m.item === "pronta") q[m.tamanho ?? ""] = m.quantidade;
    return q;
  });
  const [embalagem, setEmbalagem] = useState(original ? original.movimentos.some((m) => m.item === "embalagem") : controla(ctx.estoque, "embalagem"));

  const total = Object.values(qtds).reduce((a, b) => a + b, 0);
  const dtf = qtdEstoque(ctx.estoque, { item: "dtf" });
  const previa =
    produtoId && total > 0
      ? montarPrensagem(
          {
            ...campos,
            produto_id: produtoId,
            modelo,
            cor: corEfetiva,
            tamanhos: Object.entries(qtds).map(([tamanho, quantidade]) => ({ tamanho: tamanho || null, quantidade })),
            com_embalagem: embalagem,
          },
          ctx,
        )
      : null;

  return (
    <Folha
      titulo={original ? "Editar prensagem" : "Prensar"}
      aoFechar={fechar}
      extra={<Campanha nome={dados.campanhas.find((c) => c.id === extras.campanha_id)?.nome} />}
      rodape={
        <div className="space-y-2">
          {previa && (
            <div className="text-sm text-cinza">
              Custo {formatarReais(Math.round(previa.cpv_centavos / total))} por peça · total {formatarReais(previa.cpv_centavos)}
            </div>
          )}
          <Botao className="w-full text-lg" disabled={!previa} onClick={() => previa && salvar(previa, `${total} peças prensadas`, { novo: !original })}>
            {!produtoId ? "Escolha a estampa" : total === 0 ? "Informe as quantidades" : `Prensar ${total} ${total === 1 ? "peça" : "peças"}`}
          </Botao>
        </div>
      }
    >
      <Campo rotulo="Estampa">
        {camisetas.length === 0 && <p className="text-cinza">Cadastre as estampas em Ajustes → Catálogo.</p>}
        <div className="grid grid-cols-3 gap-2">
          {camisetas.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setProdutoId(p.id);
                setCor(null);
              }}
              className={cx("rounded-xl border-2 p-1 text-left", p.id === produtoId ? "border-tinta" : "border-linha")}
            >
              <MiniProduto produto={p} className="w-full aspect-square" />
              <div className="text-xs font-medium p-1 line-clamp-2 leading-tight">{p.nome}</div>
            </button>
          ))}
        </div>
      </Campo>

      <EscolhaModelo
        config={dados.config}
        valor={modelo}
        aoMudar={(m) => {
          setModelo(m);
          setQtds({});
        }}
      />

      <Campo rotulo="Cor da camisa">
        <Chips opcoes={dados.config.cores.map((c) => ({ valor: c, rotulo: c }))} valor={corEfetiva ?? undefined} aoMudar={setCor} />
      </Campo>

      <Campo rotulo="Quantas de cada tamanho" dica={`Estampas DTF no estoque: ${dtf}${total > dtf ? " (vai ficar negativo)" : ""}`}>
        <div className="grid grid-cols-3 gap-x-2 gap-y-3">
          {tamanhosDo(dados.config, modelo).map((t) => {
            const lisas = qtdEstoque(ctx.estoque, { item: "lisa", modelo, cor: corEfetiva, tamanho: t });
            return (
              <div key={t} className="flex flex-col items-center">
                <span className="text-sm">
                  {t} <span className={cx("text-xs", (qtds[t] ?? 0) > lisas ? "text-alerta" : "text-cinza")}>({lisas} lisas)</span>
                </span>
                <Contador pequeno valor={qtds[t] ?? 0} aoMudar={(n) => setQtds({ ...qtds, [t]: n })} />
              </div>
            );
          })}
        </div>
      </Campo>

      <Alternar ligado={embalagem} aoMudar={setEmbalagem}>
        Já embalar <span className="text-cinza text-sm block">Baixa uma embalagem por peça</span>
      </Alternar>

      <MaisOpcoes dados={dados} extras={extras} mudar={mudar} semHistorico />
    </Folha>
  );
}
