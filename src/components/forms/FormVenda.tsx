"use client";
import { useMemo, useState } from "react";
import { formatarReais } from "@/lib/dominio/dinheiro";
import { quantidade as qtdEstoque } from "@/lib/dominio/estoque";
import { modoSugerido, montarVenda } from "@/lib/dominio/lancar";
import { CANAIS, type FormaPagamento, type ModoVenda, type Produto } from "@/lib/dominio/tipos";
import { fechar } from "@/lib/rota";
import { Botao, CampoDinheiro, Campo, Chips, Contador, Folha, Texto, cx } from "../ui";
import { MiniProduto } from "../Produto";
import { MaisOpcoes, useCtx, useExtras, useSalvar, type PropsForm } from "./comum";

type Pagamento = "pix" | "cartao" | "dinheiro";

export default function FormVenda({ dados, original }: PropsForm) {
  const ctx = useCtx(dados, original);
  const salvar = useSalvar();
  const { extras, mudar, campos } = useExtras(dados, original);
  const ativos = dados.produtos.filter((p) => p.ativo || p.id === original?.produto_id);

  const [produtoId, setProdutoId] = useState<string | null | undefined>(original ? original.produto_id : undefined);
  const [avulsa, setAvulsa] = useState(original?.descricao ?? "");
  const produto = dados.produtos.find((p) => p.id === produtoId) ?? null;
  const [qtd, setQtd] = useState(original?.quantidade ?? 1);
  const [preco, setPreco] = useState<number | null>(original ? Math.round(original.valor_centavos / Math.max(1, original.quantidade)) : null);
  const [pag, setPag] = useState<Pagamento | null>(
    original?.forma_pagamento ? (["credito", "debito", "link"].includes(original.forma_pagamento) ? "cartao" : (original.forma_pagamento as Pagamento)) : null,
  );
  const [cartao, setCartao] = useState<FormaPagamento>(original && ["credito", "debito", "link"].includes(original.forma_pagamento ?? "") ? original.forma_pagamento! : "credito");
  const [tamanho, setTamanho] = useState<string | null>(original?.tamanho ?? null);
  const [cor, setCor] = useState<string | null>(original?.cor ?? null);
  const evento = dados.campanhas.find((c) => c.id === extras.campanha_id)?.tipo === "evento";
  const [canal, setCanal] = useState<string | null>(original ? original.canal : evento ? "Show" : null);
  const [modo, setModo] = useState<ModoVenda | null>(original?.modo_venda ?? null);
  const [cpvManual, setCpvManual] = useState<number | null>(null);

  const escolher = (p: Produto | null) => {
    setProdutoId(p ? p.id : null);
    setPreco(p ? p.preco_padrao_centavos : null);
    setCor(p?.cor_padrao ?? null);
    setModo(null);
  };

  const forma: FormaPagamento | null = pag === "cartao" ? cartao : pag;
  const corEfetiva = cor ?? produto?.cor_padrao ?? null;
  const modoEfetivo = modo ?? modoSugerido(ctx, produtoId ?? null, corEfetiva, tamanho);

  const previa = useMemo(() => {
    if (preco == null || !forma || produtoId === undefined) return null;
    return montarVenda(
      {
        ...campos,
        produto_id: produtoId,
        descricao: produtoId ? null : avulsa.trim() || "Venda avulsa",
        preco_unitario_centavos: preco,
        quantidade: qtd,
        forma_pagamento: forma,
        cor: corEfetiva,
        tamanho,
        canal,
        modo_venda: modo,
        cpv_manual_centavos: cpvManual,
      },
      ctx,
    );
  }, [preco, forma, produtoId, avulsa, qtd, corEfetiva, tamanho, canal, modo, cpvManual, ctx, campos]);

  // Passo 1: escolher o produto
  if (produtoId === undefined) {
    return (
      <Folha titulo="Nova venda" aoFechar={fechar} extra={<Campanha nome={dados.campanhaAtiva?.nome} />}>
        {ativos.length === 0 && <p className="text-cinza">Nenhum produto no catálogo ainda. Cadastre em Ajustes → Catálogo, ou lance como venda avulsa.</p>}
        <div className="grid grid-cols-2 gap-3">
          {ativos.map((p) => {
            const prontas = qtdTotalProntas(ctx, p.id);
            return (
              <button key={p.id} type="button" onClick={() => escolher(p)} className="text-left rounded-2xl border-2 border-linha p-2 active:scale-[0.98] transition">
                <MiniProduto produto={p} className="w-full aspect-square" />
                <div className="pt-2 px-1 font-medium leading-tight line-clamp-2">{p.nome}</div>
                <div className="px-1 pb-1 flex justify-between text-sm">
                  <span className="num">{formatarReais(p.preco_padrao_centavos)}</span>
                  {prontas > 0 && <span className="text-cinza">{prontas} prontas</span>}
                </div>
              </button>
            );
          })}
          <button type="button" onClick={() => escolher(null)} className="rounded-2xl border-2 border-dashed border-linha p-4 min-h-32 text-cinza font-medium">
            Outro / avulsa
          </button>
        </div>
      </Folha>
    );
  }

  const prontasPorTamanho = (t: string) => (produtoId ? qtdEstoque(ctx.estoque, { item: "pronta", produto_id: produtoId, cor: corEfetiva, tamanho: t }) : 0);
  const recebe = previa ? previa.valor_centavos - previa.taxa_centavos : 0;

  return (
    <Folha
      titulo={original ? "Editar venda" : "Nova venda"}
      aoFechar={fechar}
      extra={<Campanha nome={dados.campanhas.find((c) => c.id === extras.campanha_id)?.nome} />}
      rodape={
        <div className="space-y-2">
          {previa && (
            <div className="flex justify-between text-sm text-cinza">
              <span>
                Cai no caixa <span className="num text-tinta">{formatarReais(recebe)}</span>
                {previa.taxa_centavos > 0 && <> (taxa {formatarReais(previa.taxa_centavos)})</>}
              </span>
              <span>
                lucro <span className="num text-tinta">{formatarReais(recebe - previa.cpv_centavos)}</span>
              </span>
            </div>
          )}
          <Botao
            className="w-full text-lg"
            disabled={!previa}
            onClick={() => previa && salvar(previa, `Venda salva ${formatarReais(previa.valor_centavos)}`, { novo: !original })}
          >
            {!forma ? "Escolha a forma de pagamento" : `Salvar venda ${previa ? formatarReais(previa.valor_centavos) : ""}`}
          </Botao>
        </div>
      }
    >
      <button type="button" onClick={() => !original && setProdutoId(undefined)} className="flex items-center gap-3 w-full text-left">
        {produto ? <MiniProduto produto={produto} className="w-16 h-16 shrink-0" /> : null}
        <div className="flex-1">
          <div className="font-bold text-lg leading-tight">{produto?.nome ?? "Venda avulsa"}</div>
          {!original && <div className="text-sm text-cinza underline">trocar</div>}
        </div>
      </button>

      {!produto && (
        <Campo rotulo="O que foi vendido">
          <Texto value={avulsa} onChange={(e) => setAvulsa(e.target.value)} placeholder="Ex.: camisa personalizada Setfire" />
        </Campo>
      )}

      <div className="flex gap-3 items-end">
        <Campo rotulo="Preço por peça" className="flex-1 min-w-0">
          <CampoDinheiro valor={preco} aoMudar={setPreco} grande />
        </Campo>
        <Campo rotulo="Qtd" className="shrink-0">
          <div className="min-h-16 flex items-center">
            <Contador pequeno valor={qtd} aoMudar={setQtd} min={1} />
          </div>
        </Campo>
      </div>

      <Campo rotulo="Pagamento">
        <Chips
          grande
          opcoes={[
            { valor: "pix", rotulo: "Pix" },
            { valor: "cartao", rotulo: "Cartão MP" },
            { valor: "dinheiro", rotulo: "Dinheiro" },
          ]}
          valor={pag ?? undefined}
          aoMudar={(v) => setPag(v as Pagamento)}
        />
        {pag === "cartao" && (
          <Chips
            className="pt-1"
            opcoes={[
              { valor: "credito", rotulo: `Crédito ${dados.config.taxas.credito}%` },
              { valor: "debito", rotulo: `Débito ${dados.config.taxas.debito}%` },
              { valor: "link", rotulo: `Link ${dados.config.taxas.link}%` },
            ]}
            valor={cartao}
            aoMudar={(v) => setCartao(v as FormaPagamento)}
          />
        )}
      </Campo>

      {(!produto || produto.tipo === "camiseta") && (
        <Campo rotulo="Tamanho (opcional)">
          <Chips
            permitirVazio
            opcoes={dados.config.tamanhos.map((t) => {
              const n = prontasPorTamanho(t);
              return { valor: t, rotulo: n > 0 ? <>{t} <span className="opacity-60">·{n}</span></> : t };
            })}
            valor={tamanho ?? undefined}
            aoMudar={(v) => setTamanho(v)}
          />
        </Campo>
      )}

      <MaisOpcoes dados={dados} extras={extras} mudar={mudar}>
        <Campo rotulo="Canal">
          <Chips permitirVazio opcoes={CANAIS.map((c) => ({ valor: c, rotulo: c }))} valor={canal ?? undefined} aoMudar={setCanal} />
        </Campo>
        {(!produto || produto.tipo === "camiseta") && (
          <Campo rotulo="Cor">
            <Chips permitirVazio opcoes={dados.config.cores.map((c) => ({ valor: c, rotulo: c }))} valor={corEfetiva ?? undefined} aoMudar={setCor} />
          </Campo>
        )}
        {produto && !extras.historico && (
          <Campo rotulo="A peça" dica={modoEfetivo === "pronta" ? "Sai do estoque de peças prontas." : "Sai lisa + estampa DTF do estoque (prensa na hora)."}>
            <Chips
              opcoes={[
                { valor: "pronta", rotulo: "Já estava pronta" },
                { valor: "sob_demanda", rotulo: "Sob demanda" },
              ]}
              valor={modoEfetivo}
              aoMudar={setModo}
            />
          </Campo>
        )}
        <Campo rotulo="Custo da peça" dica={previa ? `Calculado: ${formatarReais(previa.cpv_centavos)}. Só preencha para corrigir.` : undefined}>
          <CampoDinheiro valor={cpvManual} aoMudar={setCpvManual} placeholder="automático" />
        </Campo>
      </MaisOpcoes>
    </Folha>
  );
}

function qtdTotalProntas(ctx: ReturnType<typeof useCtx>, produtoId: string) {
  let n = 0;
  for (const p of ctx.estoque.values()) if (p.item === "pronta" && p.produto_id === produtoId) n += Math.max(0, p.quantidade);
  return n;
}

export function Campanha({ nome }: { nome?: string | null }) {
  if (!nome) return null;
  return <span className={cx("text-xs font-medium px-2 py-1 rounded-full bg-tinta text-papel mr-2 truncate max-w-36")}>{nome}</span>;
}

