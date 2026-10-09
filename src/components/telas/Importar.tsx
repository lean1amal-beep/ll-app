"use client";
import { useMemo, useState } from "react";
import { salvarLancamento, type Dados } from "@/lib/dados";
import { adivinharColunas, lerCSV, lerExtrato, type Colunas } from "@/lib/dominio/csv";
import { dataParaISO } from "@/lib/dominio/datas";
import { formatarReais } from "@/lib/dominio/dinheiro";
import { montarGasto, montarSimples, montarVenda } from "@/lib/dominio/lancar";
import { NOMES_CATEGORIA, type CategoriaGasto, type Lancamento } from "@/lib/dominio/tipos";
import { fechar } from "@/lib/rota";
import { Botao, Campo, Chips, Folha, Reais, cx, estiloInput, useAviso } from "../ui";

type Classe = "venda" | "gasto" | "pessoal" | "ignorar";

export default function Importar({ dados }: { dados: Dados }) {
  const avisar = useAviso();
  const [texto, setTexto] = useState("");
  const [col, setCol] = useState<Colunas | null>(null);
  const [classes, setClasses] = useState<Record<number, Classe>>({});
  const [categorias, setCategorias] = useState<Record<number, CategoriaGasto>>({});
  const [quemPagou, setQuemPagou] = useState<"leandro" | "marca">("leandro");

  const linhas = useMemo(() => (texto ? lerCSV(texto) : []), [texto]);
  const colunas = col ?? (linhas.length ? adivinharColunas(linhas[0]) : null);
  const extrato = useMemo(() => (colunas ? lerExtrato(linhas, colunas) : []), [linhas, colunas]);
  const classe = (i: number, _v: number): Classe => classes[i] ?? "ignorar";

  const montar = (): Lancamento[] =>
    extrato.flatMap((e) => {
      const c = classe(e.indice, e.valor_centavos);
      const base = { historico: true, data: dataParaISO(e.data), observacao: `Extrato: ${e.descricao}`.slice(0, 200) };
      const v = Math.abs(e.valor_centavos);
      if (c === "venda")
        return [montarVenda({ ...base, produto_id: null, descricao: e.descricao || "Venda (extrato)", preco_unitario_centavos: v, quantidade: 1, forma_pagamento: "pix", cpv_manual_centavos: 0 }, dados.ctx)];
      if (c === "gasto") return [montarGasto({ ...base, categoria: categorias[e.indice] ?? "outro", valor_centavos: v, pago_por: quemPagou, descricao: e.descricao })];
      if (c === "pessoal" && e.valor_centavos < 0) return [montarSimples("retirada_dinheiro", v, { ...base, descricao: e.descricao })];
      return [];
    });

  const escolhidas = extrato.filter((e) => classe(e.indice, e.valor_centavos) !== "ignorar").length;

  if (!linhas.length) {
    return (
      <Folha titulo="Importar extrato" aoFechar={fechar}>
        <p>Exporte o extrato do Mercado Pago ou do Nubank em CSV e escolha o arquivo. Depois você marca cada linha: venda, gasto da marca, pessoal ou ignorar.</p>
        <label className="flex items-center justify-center min-h-16 rounded-xl border-2 border-dashed border-tinta font-medium cursor-pointer">
          Escolher arquivo CSV
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setTexto(await lerArquivo(f));
            }}
          />
        </label>
        <Campo rotulo="Ou cole o conteúdo aqui">
          <textarea className={cx(estiloInput, "min-h-32 py-3 font-mono text-sm")} onChange={(e) => setTexto(e.target.value)} placeholder="data;descrição;valor" />
        </Campo>
      </Folha>
    );
  }

  return (
    <Folha
      titulo="Classificar extrato"
      aoFechar={fechar}
      rodape={
        <Botao
          className="w-full text-lg"
          disabled={escolhidas === 0}
          onClick={async () => {
            const ls = montar();
            for (const l of ls) await salvarLancamento(l);
            avisar(`${ls.length} lançamentos importados ✓`);
            fechar();
          }}
        >
          Importar {escolhidas} {escolhidas === 1 ? "linha" : "linhas"}
        </Botao>
      }
    >
      {colunas && (
        <div className="grid grid-cols-3 gap-2">
          {(["data", "descricao", "valor"] as const).map((k) => (
            <Campo key={k} rotulo={k === "descricao" ? "Descrição" : k === "data" ? "Data" : "Valor"}>
              <select value={colunas[k]} onChange={(e) => setCol({ ...colunas, [k]: Number(e.target.value) })} className={cx(estiloInput, "px-2 text-sm")}>
                {linhas[0].map((h, i) => (
                  <option key={i} value={i}>
                    {h || `col ${i + 1}`}
                  </option>
                ))}
              </select>
            </Campo>
          ))}
        </div>
      )}
      <p className="text-sm text-cinza">
        {extrato.length} linhas com valor. Tudo entra como “antes do app” (não mexe no caixa de hoje). Venda importada fica sem custo de peça; gasto de material entra direto no resultado.
      </p>
      <Campo rotulo="Os gastos foram pagos por">
        <Chips
          opcoes={[
            { valor: "leandro", rotulo: "Meu bolso (Nubank)" },
            { valor: "marca", rotulo: "Conta da marca (MP)" },
          ]}
          valor={quemPagou}
          aoMudar={setQuemPagou}
        />
      </Campo>
      <div className="flex gap-2 text-sm">
        <button type="button" className="underline" onClick={() => setClasses(Object.fromEntries(extrato.map((e) => [e.indice, e.valor_centavos > 0 ? "venda" : "gasto"])))}>
          Entradas = venda, saídas = gasto
        </button>
        <button type="button" className="underline" onClick={() => setClasses({})}>
          Limpar
        </button>
      </div>
      <div className="divide-y divide-linha">
        {extrato.map((e) => {
          const c = classe(e.indice, e.valor_centavos);
          return (
            <div key={e.indice} className={cx("py-3 space-y-2", c === "ignorar" && "opacity-60")}>
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm text-cinza">{e.data.split("-").reverse().join("/")}</div>
                  <div className="font-medium break-words">{e.descricao || "—"}</div>
                </div>
                <Reais c={e.valor_centavos} sinal className="shrink-0 font-medium" />
              </div>
              <Chips
                opcoes={(e.valor_centavos > 0 ? (["venda", "ignorar"] as Classe[]) : (["gasto", "pessoal", "ignorar"] as Classe[])).map((k) => ({
                  valor: k,
                  rotulo: { venda: "Venda", gasto: "Gasto da marca", pessoal: "Pessoal (retirada)", ignorar: "Ignorar" }[k],
                }))}
                valor={c}
                aoMudar={(v) => setClasses({ ...classes, [e.indice]: v })}
              />
              {c === "gasto" && (
                <select
                  value={categorias[e.indice] ?? "outro"}
                  onChange={(ev) => setCategorias({ ...categorias, [e.indice]: ev.target.value as CategoriaGasto })}
                  className={cx(estiloInput, "text-sm")}
                >
                  {Object.entries(NOMES_CATEGORIA).map(([k, n]) => (
                    <option key={k} value={k}>
                      {n}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>
      <div className="text-sm">
        Total marcado como venda: {formatarReais(extrato.filter((e) => classe(e.indice, e.valor_centavos) === "venda").reduce((s, e) => s + e.valor_centavos, 0))}
      </div>
    </Folha>
  );
}

/** Lê o arquivo tentando UTF-8; se vier com caracteres quebrados, tenta Latin-1 (comum em bancos). */
async function lerArquivo(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buf);
  if (!utf8.includes("�")) return utf8;
  return new TextDecoder("windows-1252").decode(buf);
}
