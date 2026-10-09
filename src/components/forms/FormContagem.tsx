"use client";
import { useMemo, useState } from "react";
import { formatarReais } from "@/lib/dominio/dinheiro";
import { quantidade as qtdEstoque } from "@/lib/dominio/estoque";
import { montarContagem, type Contagem } from "@/lib/dominio/lancar";
import type { ItemEstoque } from "@/lib/dominio/tipos";
import { fechar } from "@/lib/rota";
import { Botao, Campo, Contador, Folha, cx, useAviso } from "../ui";
import { MaisOpcoes, useExtras, useSalvar, type PropsForm } from "./comum";
import type { Dados } from "@/lib/dados";

interface Celula {
  item: ItemEstoque;
  produto_id?: string | null;
  cor?: string | null;
  tamanho?: string | null;
}

const chave = (c: Celula) => [c.item, c.produto_id ?? "", c.cor ?? "", c.tamanho ?? ""].join("|");

/** Grade de contagem reutilizável (tela de contagem e acerto inicial). */
export function GradeContagem({ dados, valores, setValores }: { dados: Dados; valores: Record<string, number>; setValores: (v: Record<string, number>) => void }) {
  const est = dados.ctx.estoque;
  const [extrasProntas, setExtrasProntas] = useState<Celula[]>([]);
  const [novoProduto, setNovoProduto] = useState<string>("");
  const prontas: Celula[] = useMemo(() => {
    const lista: Celula[] = [...est.values()].filter((p) => p.item === "pronta").map((p) => ({ item: "pronta", produto_id: p.produto_id, cor: p.cor, tamanho: p.tamanho }));
    for (const e of extrasProntas) if (!lista.some((x) => chave(x) === chave(e))) lista.push(e);
    return lista;
  }, [est, extrasProntas]);

  const atual = (c: Celula) => qtdEstoque(est, c);
  const valor = (c: Celula) => valores[chave(c)] ?? atual(c);
  const mudar = (c: Celula, n: number) => setValores({ ...valores, [chave(c)]: n });
  const mudou = (c: Celula) => valores[chave(c)] !== undefined && valores[chave(c)] !== atual(c);

  const cel = (c: Celula, rotulo: string) => (
    <div key={chave(c)} className={cx("flex flex-col items-center rounded-xl py-1", mudou(c) && "bg-fundo")}>
      <span className="text-sm text-cinza">{rotulo}</span>
      <Contador pequeno valor={valor(c)} aoMudar={(n) => mudar(c, n)} min={0} />
    </div>
  );

  const [prodSel, setProdSel] = useState<{ cor: string | null; tamanho: string | null }>({ cor: null, tamanho: null });

  return (
    <div className="space-y-8">
      <Campo rotulo="Camisas lisas">
        <div className="space-y-4">
          {dados.config.cores.map((cor) => (
            <div key={cor}>
              <div className="font-medium mb-1">{cor}</div>
              <div className="grid grid-cols-3 gap-2">
                {dados.config.tamanhos.map((t) => (
                  cel({ item: "lisa", cor, tamanho: t }, t)
                ))}
              </div>
            </div>
          ))}
        </div>
      </Campo>

      <Campo rotulo="Insumos">
        <div className="grid grid-cols-2 gap-2">
          {cel({ item: "dtf" }, "Estampas DTF")}
          {cel({ item: "embalagem" }, "Embalagens")}
        </div>
      </Campo>

      <Campo rotulo="Peças prontas (já prensadas)">
        <div className="space-y-2">
          {prontas.map((c) => (
            <div key={chave(c)} className={cx("flex items-center justify-between gap-2 rounded-xl px-2", mudou(c) && "bg-fundo")}>
              <span className="text-sm">
                {dados.produtos.find((p) => p.id === c.produto_id)?.nome ?? "?"} <span className="text-cinza">{[c.cor, c.tamanho].filter(Boolean).join(" ")}</span>
              </span>
              <Contador pequeno valor={valor(c)} aoMudar={(n) => mudar(c, n)} min={0} />
            </div>
          ))}
        </div>
        <div className="rounded-xl border-2 border-dashed border-linha p-3 space-y-2">
          <div className="text-sm font-medium">Adicionar peça pronta</div>
          <select value={novoProduto} onChange={(e) => setNovoProduto(e.target.value)} className="w-full min-h-12 px-3 rounded-xl border-2 border-linha bg-papel">
            <option value="">Estampa…</option>
            {dados.produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <select value={prodSel.cor ?? ""} onChange={(e) => setProdSel({ ...prodSel, cor: e.target.value || null })} className="flex-1 min-h-12 px-3 rounded-xl border-2 border-linha bg-papel">
              <option value="">Cor</option>
              {dados.config.cores.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select value={prodSel.tamanho ?? ""} onChange={(e) => setProdSel({ ...prodSel, tamanho: e.target.value || null })} className="flex-1 min-h-12 px-3 rounded-xl border-2 border-linha bg-papel">
              <option value="">Tam.</option>
              {dados.config.tamanhos.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <Botao
              variante="secundario"
              disabled={!novoProduto}
              onClick={() => {
                const p = dados.produtos.find((x) => x.id === novoProduto);
                setExtrasProntas([...extrasProntas, { item: "pronta", produto_id: novoProduto, cor: prodSel.cor ?? p?.cor_padrao ?? null, tamanho: prodSel.tamanho }]);
                setNovoProduto("");
              }}
            >
              +
            </Botao>
          </div>
        </div>
      </Campo>
    </div>
  );
}

/** Converte o que foi digitado em contagens (só o que mudou). */
export function paraContagens(valores: Record<string, number>): Contagem[] {
  return Object.entries(valores).map(([k, real]) => {
    const [item, produto_id, cor, tamanho] = k.split("|");
    return { item: item as ItemEstoque, produto_id: produto_id || null, cor: cor || null, tamanho: tamanho || null, real };
  });
}

export default function FormContagem({ dados }: PropsForm) {
  const salvar = useSalvar();
  const avisar = useAviso();
  const { extras, mudar, campos } = useExtras(dados, undefined);
  const [valores, setValores] = useState<Record<string, number>>({});
  const previa = montarContagem(paraContagens(valores), dados.ctx, campos);
  return (
    <Folha
      titulo="Contar estoque"
      aoFechar={fechar}
      rodape={
        <div className="space-y-2">
          {previa && (
            <div className="text-sm text-cinza">
              {previa.movimentos.length} {previa.movimentos.length === 1 ? "item mudou" : "itens mudaram"} · {previa.valor_centavos < 0 ? "perda" : "sobra"} de {formatarReais(Math.abs(previa.valor_centavos))}
            </div>
          )}
          <Botao className="w-full text-lg" onClick={() => (previa ? salvar(previa, "Contagem salva", { novo: true }) : (avisar("Nada mudou"), fechar()))}>
            {previa ? "Salvar contagem" : "Nada mudou"}
          </Botao>
        </div>
      }
    >
      <p className="text-cinza">Conte o que tem de verdade e ajuste os números. Diferença para menos entra como perda (pelo custo); para mais, como sobra.</p>
      <GradeContagem dados={dados} valores={valores} setValores={setValores} />
      <MaisOpcoes dados={dados} extras={extras} mudar={mudar} semHistorico />
    </Folha>
  );
}
