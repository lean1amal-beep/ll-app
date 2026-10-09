"use client";
import { useState } from "react";
import { formatarReais } from "@/lib/dominio/dinheiro";
import { quantidade as qtdEstoque } from "@/lib/dominio/estoque";
import { montarSaida, montarSimples, type AlvoSaida } from "@/lib/dominio/lancar";
import type { Lancamento } from "@/lib/dominio/tipos";
import { fechar } from "@/lib/rota";
import { Botao, CampoDinheiro, Campo, Chips, Contador, Folha, Texto } from "../ui";
import { MaisOpcoes, useCtx, useExtras, useSalvar, type PropsForm } from "./comum";

type Alvo = "peca" | "pronta" | "lisa" | "dtf" | "embalagem";

const MOTIVOS = ["Teste", "Estampa soltou", "Erro na prensa", "Defeito", "Brinde", "Outro"];

export default function FormSaida({ dados, original, tipo }: PropsForm & { tipo: "perda" | "retirada" }) {
  const ctx = useCtx(dados, original);
  const salvar = useSalvar();
  const { extras, mudar, campos } = useExtras(dados, original);
  const [emDinheiro, setEmDinheiro] = useState(tipo === "retirada" && (!original || original.tipo === "retirada_dinheiro"));
  const [valor, setValor] = useState<number | null>(original?.tipo === "retirada_dinheiro" ? original.valor_centavos : null);
  const [alvo, setAlvo] = useState<Alvo>((original?.categoria as Alvo) ?? (tipo === "perda" ? "peca" : "pronta"));
  const [produtoId, setProdutoId] = useState<string | null>(original?.produto_id ?? null);
  const [cor, setCor] = useState<string | null>(original?.cor ?? dados.config.cores[0] ?? null);
  const [tamanho, setTamanho] = useState<string | null>(original?.tamanho ?? null);
  const [qtd, setQtd] = useState(original?.quantidade ?? 1);
  const [motivo, setMotivo] = useState<string | null>(original?.descricao && MOTIVOS.includes(original.descricao) ? original.descricao : null);
  const [descricao, setDescricao] = useState(original?.descricao && !MOTIVOS.includes(original.descricao) ? original.descricao : "");

  const titulo = tipo === "perda" ? "Perda ou teste" : "Retirada";
  const prontas = [...ctx.estoque.values()].filter((p) => p.item === "pronta" && p.quantidade > 0);

  let previa: Lancamento | null = null;
  let texto = "";
  if (emDinheiro) {
    if (valor && valor > 0) {
      previa = montarSimples("retirada_dinheiro", valor, { ...campos, descricao: descricao.trim() || null });
      texto = `Retirada ${formatarReais(valor)}`;
    }
  } else {
    let a: AlvoSaida | null = null;
    if (alvo === "pronta") a = produtoId ? { item: "pronta", produto_id: produtoId, cor, tamanho } : null;
    else if (alvo === "peca" || alvo === "lisa") a = { item: alvo, cor, tamanho };
    else a = { item: alvo };
    if (a) {
      previa = montarSaida(
        {
          ...campos,
          tipo: tipo === "perda" ? "perda" : "retirada_produto",
          alvo: a,
          quantidade: qtd,
          descricao: tipo === "perda" ? (motivo === "Outro" || !motivo ? descricao.trim() || motivo : motivo) : descricao.trim() || null,
        },
        ctx,
      );
      texto = tipo === "perda" ? `Perda registrada (${formatarReais(previa.cpv_centavos)})` : `Retirada de ${qtd} peça${qtd > 1 ? "s" : ""}`;
    }
  }

  const precisaCorTamanho = !emDinheiro && (alvo === "peca" || alvo === "lisa" || alvo === "pronta");

  return (
    <Folha
      titulo={original ? `Editar ${titulo.toLowerCase()}` : titulo}
      aoFechar={fechar}
      rodape={
        <div className="space-y-2">
          {previa && !emDinheiro && <div className="text-sm text-cinza">Custo: {formatarReais(previa.cpv_centavos)}{tipo === "perda" ? " (entra como prejuízo)" : " (não é custo da marca)"}</div>}
          <Botao className="w-full text-lg" disabled={!previa} onClick={() => previa && salvar(previa, texto, { novo: !original })}>
            Salvar
          </Botao>
        </div>
      }
    >
      {tipo === "retirada" && !original && (
        <Campo rotulo="O que você pegou para você">
          <Chips
            grande
            opcoes={[
              { valor: "dinheiro", rotulo: "Dinheiro" },
              { valor: "peca", rotulo: "Uma peça" },
            ]}
            valor={emDinheiro ? "dinheiro" : "peca"}
            aoMudar={(v) => setEmDinheiro(v === "dinheiro")}
          />
        </Campo>
      )}

      {emDinheiro ? (
        <>
          <Campo rotulo="Valor" dica="Dinheiro da marca usado no pessoal. Sai do caixa, mas não é custo.">
            <CampoDinheiro valor={valor} aoMudar={setValor} grande autoFocus />
          </Campo>
          <Campo rotulo="Para quê (opcional)">
            <Texto value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </Campo>
        </>
      ) : (
        <>
          <Campo rotulo="O que saiu">
            <Chips
              opcoes={[
                { valor: "pronta", rotulo: "Peça pronta" },
                { valor: "peca", rotulo: "Lisa + estampa" },
                { valor: "lisa", rotulo: "Só a lisa" },
                { valor: "dtf", rotulo: "Estampa DTF" },
                { valor: "embalagem", rotulo: "Embalagem" },
              ]}
              valor={alvo}
              aoMudar={setAlvo}
            />
          </Campo>

          {alvo === "pronta" && (
            <Campo rotulo="Qual peça">
              {prontas.length === 0 && <p className="text-cinza text-sm">Nenhuma peça pronta no estoque.</p>}
              <div className="space-y-2">
                {prontas.map((p) => {
                  const prod = dados.produtos.find((x) => x.id === p.produto_id);
                  const sel = produtoId === p.produto_id && cor === p.cor && tamanho === p.tamanho;
                  return (
                    <button
                      key={p.chave}
                      type="button"
                      onClick={() => {
                        setProdutoId(p.produto_id);
                        setCor(p.cor);
                        setTamanho(p.tamanho);
                      }}
                      className={`w-full flex justify-between items-center min-h-12 px-4 rounded-xl border-2 ${sel ? "border-tinta bg-tinta text-papel" : "border-linha"}`}
                    >
                      <span className="text-left">
                        {prod?.nome ?? "?"} <span className="opacity-60">{[p.cor, p.tamanho].filter(Boolean).join(" ")}</span>
                      </span>
                      <span className="num">{p.quantidade}</span>
                    </button>
                  );
                })}
              </div>
            </Campo>
          )}

          {precisaCorTamanho && alvo !== "pronta" && (
            <>
              <Campo rotulo="Cor">
                <Chips opcoes={dados.config.cores.map((c) => ({ valor: c, rotulo: c }))} valor={cor ?? undefined} aoMudar={setCor} />
              </Campo>
              <Campo rotulo="Tamanho">
                <Chips
                  permitirVazio
                  opcoes={dados.config.tamanhos.map((t) => ({ valor: t, rotulo: `${t} ·${qtdEstoque(ctx.estoque, { item: "lisa", cor, tamanho: t })}` }))}
                  valor={tamanho ?? undefined}
                  aoMudar={setTamanho}
                />
              </Campo>
            </>
          )}

          <Campo rotulo="Quantidade">
            <Contador valor={qtd} aoMudar={setQtd} min={1} />
          </Campo>

          {tipo === "perda" ? (
            <Campo rotulo="Motivo">
              <Chips permitirVazio opcoes={MOTIVOS.map((m) => ({ valor: m, rotulo: m }))} valor={motivo ?? undefined} aoMudar={setMotivo} />
              {(motivo === "Outro" || !motivo) && <Texto value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descreva (opcional)" />}
            </Campo>
          ) : (
            <Campo rotulo="Observação (opcional)">
              <Texto value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: usei no show" />
            </Campo>
          )}
        </>
      )}

      <MaisOpcoes dados={dados} extras={extras} mudar={mudar} />
    </Folha>
  );
}
