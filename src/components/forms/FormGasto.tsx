"use client";
import { useState } from "react";
import { formatarReais } from "@/lib/dominio/dinheiro";
import { montarGasto, type LinhaGrade } from "@/lib/dominio/lancar";
import { CATEGORIA_ESTOQUE, NOMES_CATEGORIA, type CategoriaGasto, type PagoPor } from "@/lib/dominio/tipos";
import { fechar } from "@/lib/rota";
import { Alternar, Botao, CampoDinheiro, Campo, Chips, Contador, Folha, Texto } from "../ui";
import { Campanha } from "./FormVenda";
import { CampoFoto, MaisOpcoes, useExtras, useSalvar, type PropsForm } from "./comum";

const CATEGORIAS = Object.keys(NOMES_CATEGORIA) as CategoriaGasto[];

export default function FormGasto({ dados, original }: PropsForm) {
  const salvar = useSalvar();
  const { extras, mudar, campos } = useExtras(dados, original);
  const [cat, setCat] = useState<CategoriaGasto | null>((original?.categoria as CategoriaGasto) ?? null);
  const [valor, setValor] = useState<number | null>(original?.valor_centavos ?? null);
  const [pagoPor, setPagoPor] = useState<PagoPor>(original?.pago_por ?? "marca");
  const [presente, setPresente] = useState(original?.eh_presente ?? false);
  const [descricao, setDescricao] = useState(original?.descricao ?? "");
  const [contaFixa, setContaFixa] = useState<string | null>(original?.conta_fixa ?? null);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [grade, setGrade] = useState<Record<string, number>>(() => {
    const g: Record<string, number> = {};
    for (const m of original?.movimentos ?? []) g[`${m.cor ?? ""}|${m.tamanho ?? ""}`] = m.quantidade;
    return g;
  });
  const item = cat ? CATEGORIA_ESTOQUE[cat] : undefined;
  const linhas: LinhaGrade[] = Object.entries(grade)
    .filter(([, q]) => q > 0)
    .map(([k, q]) => {
      const [cor, tamanho] = k.split("|");
      return { cor: cor || null, tamanho: tamanho || null, quantidade: q };
    });
  const totalPecas = linhas.reduce((s, l) => s + l.quantidade, 0);
  const precisaGrade = !!item && !extras.historico;
  const pronto = cat && valor != null && valor > 0 && (!precisaGrade || totalPecas > 0);

  const montar = () =>
    montarGasto({
      ...campos,
      categoria: cat!,
      valor_centavos: valor!,
      pago_por: pagoPor,
      eh_presente: presente,
      grade: linhas,
      descricao: descricao.trim() || null,
      conta_fixa: cat === "assinatura" ? contaFixa : null,
    });

  return (
    <Folha
      titulo={original ? "Editar gasto" : "Novo gasto"}
      aoFechar={fechar}
      extra={<Campanha nome={dados.campanhas.find((c) => c.id === extras.campanha_id)?.nome} />}
      rodape={
        <Botao className="w-full text-lg" disabled={!pronto} onClick={() => pronto && salvar(montar(), `Gasto salvo ${formatarReais(valor!)}`, { novo: !original, foto })}>
          {!cat ? "Escolha a categoria" : precisaGrade && totalPecas === 0 ? "Informe a quantidade" : `Salvar gasto ${valor ? formatarReais(valor) : ""}`}
        </Botao>
      }
    >
      <Campo rotulo="Com o quê">
        <Chips grande opcoes={CATEGORIAS.map((c) => ({ valor: c, rotulo: NOMES_CATEGORIA[c] }))} valor={cat ?? undefined} aoMudar={setCat} />
      </Campo>

      {cat === "assinatura" && dados.config.contas_fixas.length > 0 && (
        <Campo rotulo="Conta fixa">
          <Chips
            permitirVazio
            opcoes={dados.config.contas_fixas.map((c) => ({ valor: c.nome, rotulo: `${c.nome} ${formatarReais(c.valor_centavos)}` }))}
            valor={contaFixa ?? undefined}
            aoMudar={(n) => {
              setContaFixa(n);
              const c = dados.config.contas_fixas.find((x) => x.nome === n);
              if (c) {
                setValor(c.valor_centavos);
                setDescricao(c.nome);
              }
            }}
          />
        </Campo>
      )}

      <Campo rotulo="Valor total">
        <CampoDinheiro valor={valor} aoMudar={setValor} grande />
      </Campo>

      {precisaGrade && item === "lisa" && (
        <Campo rotulo="Quantas camisas" dica={totalPecas > 0 && valor ? `${totalPecas} camisas · ${formatarReais(Math.round(valor / totalPecas))} cada` : undefined}>
          <div className="space-y-4">
            {dados.config.cores.map((cor) => (
              <div key={cor}>
                <div className="font-medium mb-1">{cor}</div>
                <div className="grid grid-cols-3 gap-x-2 gap-y-3">
                  {dados.config.tamanhos.map((t) => {
                    const k = `${cor}|${t}`;
                    return (
                      <div key={t} className="flex flex-col items-center">
                        <span className="text-sm text-cinza">{t}</span>
                        <Contador pequeno valor={grade[k] ?? 0} aoMudar={(n) => setGrade({ ...grade, [k]: n })} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Campo>
      )}
      {precisaGrade && item !== "lisa" && (
        <Campo
          rotulo={item === "dtf" ? "Quantas estampas" : "Quantas unidades"}
          dica={
            item === "dtf"
              ? `Conte estampas, não metros (1 metro ≈ 4 estampas).${totalPecas && valor ? ` ${formatarReais(Math.round(valor / totalPecas))} por estampa.` : ""}`
              : totalPecas && valor
                ? `${formatarReais(Math.round(valor / totalPecas))} cada`
                : undefined
          }
        >
          <Contador valor={grade["|"] ?? 0} aoMudar={(n) => setGrade({ "|": n })} />
        </Campo>
      )}

      <Campo
        rotulo="Quem pagou"
        dica={
          pagoPor === "leandro"
            ? "Não sai do caixa da marca. Conta como dinheiro seu colocado na marca."
            : pagoPor === "pai"
              ? presente
                ? "Presente: conta como investimento, sem dívida."
                : "Vira dívida com seu pai."
              : "Sai da conta da marca (Mercado Pago)."
        }
      >
        <Chips
          opcoes={[
            { valor: "marca", rotulo: "Conta da marca" },
            { valor: "leandro", rotulo: "Meu bolso" },
            { valor: "pai", rotulo: "Meu pai" },
          ]}
          valor={pagoPor}
          aoMudar={setPagoPor}
        />
        {pagoPor === "pai" && (
          <Alternar ligado={presente} aoMudar={setPresente}>
            Foi presente (não precisa devolver)
          </Alternar>
        )}
      </Campo>

      <Campo rotulo="Descrição (opcional)">
        <Texto value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: filme DTF Mercado Livre" />
      </Campo>

      {!original && <CampoFoto foto={foto} aoMudar={setFoto} />}

      <MaisOpcoes dados={dados} extras={extras} mudar={mudar} />
    </Folha>
  );
}
