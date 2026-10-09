"use client";
import { useMemo, useState } from "react";
import { salvarLancamento, salvarProduto } from "@/lib/dados";
import { formatarReais } from "@/lib/dominio/dinheiro";
import { quantidade as qtdEstoque } from "@/lib/dominio/estoque";
import { montarContagem, novoId, type Contagem } from "@/lib/dominio/lancar";
import { lerListaProntas, mesmoNome } from "@/lib/dominio/lista";
import { tamanhosDo, type Produto } from "@/lib/dominio/tipos";
import { fechar } from "@/lib/rota";
import { Botao, CampoDinheiro, Campo, Chips, Folha, cx, estiloInput, useAviso } from "../ui";
import { EscolhaModelo, type PropsForm } from "./comum";

const EXEMPLO = `M/P - Slipknot All Hope Is Gone
G/GG - LP Hybrid Theory
2 GG - System of a Down`;

/** Cola uma lista ("GG - Estampa") e o app cadastra as estampas novas e põe as peças no estoque de prontas. */
export default function FormListaProntas({ dados }: PropsForm) {
  const avisar = useAviso();
  const [texto, setTexto] = useState("");
  const [modelo, setModelo] = useState<string | null>(null);
  const [cor, setCor] = useState<string | null>(dados.config.cores[0] ?? null);
  const [preco, setPreco] = useState<number | null>(8990);
  const [salvando, setSalvando] = useState(false);

  const { linhas, erros } = useMemo(() => lerListaProntas(texto, tamanhosDo(dados.config, modelo)), [texto, dados.config, modelo]);
  const existente = (nome: string) => dados.produtos.find((p) => mesmoNome(p.nome, nome));
  const novas = [...new Set(linhas.filter((l) => !existente(l.nome)).map((l) => l.nome))];
  const total = linhas.reduce((s, l) => s + l.tamanhos.length, 0);

  const salvar = async () => {
    setSalvando(true);
    const agora = new Date().toISOString();
    // 1. Estampas novas no catálogo
    const criados: Produto[] = [];
    for (const nome of novas) {
      const p: Produto = {
        id: novoId(),
        nome,
        tipo: "camiseta",
        cor_padrao: cor,
        preco_padrao_centavos: preco ?? 0,
        custo_padrao_centavos: null,
        imagem_url: null,
        ativo: true,
        ordem: dados.produtos.length + criados.length,
        created_at: agora,
        updated_at: agora,
        deleted_at: null,
      };
      criados.push(p);
      await salvarProduto(p);
    }
    const idDe = (nome: string) => (existente(nome) ?? criados.find((p) => mesmoNome(p.nome, nome)))!.id;
    // 2. Soma as peças às que já existem no estoque
    const somas = new Map<string, Contagem & { add: number }>();
    for (const l of linhas) {
      for (const tamanho of l.tamanhos) {
        const c = { item: "pronta" as const, produto_id: idDe(l.nome), modelo, cor, tamanho };
        const k = `${c.produto_id}|${tamanho}`;
        const atual = somas.get(k) ?? { ...c, real: 0, add: 0 };
        atual.add++;
        somas.set(k, atual);
      }
    }
    const contagens = [...somas.values()].map(({ add, ...c }) => ({ ...c, real: qtdEstoque(dados.ctx.estoque, c) + add }));
    const l = montarContagem(contagens, dados.ctx, { observacao: "Peças prontas adicionadas por lista", confianca: "estimado" });
    if (l) await salvarLancamento(l);
    avisar(`${total} peças prontas adicionadas ✓`);
    fechar();
  };

  return (
    <Folha
      titulo="Adicionar prontas (lista)"
      aoFechar={fechar}
      rodape={
        <Botao className="w-full text-lg" disabled={!total || salvando} onClick={() => void salvar()}>
          {total ? `Adicionar ${total} ${total === 1 ? "peça" : "peças"}` : "Cole a lista"}
        </Botao>
      }
    >
      <p className="text-cinza">
        Uma linha por estampa: <b>tamanhos - nome</b>. Ex.: <span className="num">M/P - Slipknot</span>. Estampas que ainda não estão no catálogo são criadas.
      </p>
      <Campo rotulo="Lista">
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={EXEMPLO} className={cx(estiloInput, "min-h-44 py-3")} />
      </Campo>
      <EscolhaModelo config={dados.config} valor={modelo} aoMudar={setModelo} />
      <Campo rotulo="Cor das camisas">
        <Chips opcoes={dados.config.cores.map((c) => ({ valor: c, rotulo: c }))} valor={cor ?? undefined} aoMudar={setCor} />
      </Campo>
      {novas.length > 0 && (
        <Campo rotulo="Preço das estampas novas" dica="Dá pra mudar depois, uma por uma, em Ajustes → Catálogo.">
          <CampoDinheiro valor={preco} aoMudar={setPreco} />
        </Campo>
      )}
      {linhas.length > 0 && (
        <Campo rotulo={`Vai adicionar (${total} peças)`}>
          <div className="divide-y divide-linha">
            {linhas.map((l, i) => (
              <div key={i} className="flex justify-between gap-3 py-2">
                <span>
                  {l.nome} {!existente(l.nome) && <span className="text-xs bg-tinta text-papel rounded-full px-2 py-0.5 ml-1">nova</span>}
                </span>
                <span className="num shrink-0">{l.tamanhos.join(", ")}</span>
              </div>
            ))}
          </div>
        </Campo>
      )}
      {erros.length > 0 && (
        <div className="rounded-xl border-2 border-alerta p-3 text-sm">
          <b className="text-alerta">Não entendi {erros.length === 1 ? "esta linha" : "estas linhas"}:</b>
          <ul className="list-disc pl-5 mt-1">
            {erros.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <div className="text-cinza mt-1">Use os tamanhos {tamanhosDo(dados.config, modelo).join(", ")}.</div>
        </div>
      )}
      {total > 0 && <p className="text-sm text-cinza">Entram pelo custo de referência (~{formatarReais(dados.config.custos_referencia.lisa_centavos + dados.config.custos_referencia.dtf_centavos + dados.config.custos_referencia.embalagem_centavos)} cada), marcadas como estimado.</p>}
    </Folha>
  );
}
