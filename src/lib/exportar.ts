"use client";
import type { Dados } from "./dados";
import { efeito } from "./dominio/calculos";
import { diaBR, horaBR } from "./dominio/datas";
import { NOMES_TIPO } from "./dominio/tipos";

const reais = (c: number) => (c / 100).toFixed(2).replace(".", ",");

function campo(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Baixa um CSV (separado por ";", abre direto no Excel/Google Planilhas em português). */
export function exportarCSV(dados: Dados) {
  const cab = [
    "data", "hora", "tipo", "descricao", "produto", "quantidade", "cor", "tamanho", "valor", "taxa", "custo_pecas",
    "efeito_caixa", "efeito_resultado", "pagamento", "canal", "categoria", "pago_por", "campanha", "estimado", "antes_do_app", "observacao", "id",
  ];
  const linhas = [...dados.lancamentos]
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((l) => {
      const e = efeito(l);
      return [
        diaBR(l.data), horaBR(l.data), NOMES_TIPO[l.tipo], l.descricao, dados.produtos.find((p) => p.id === l.produto_id)?.nome,
        l.quantidade, l.cor, l.tamanho, reais(l.valor_centavos), reais(l.taxa_centavos), reais(l.cpv_centavos), reais(e.caixa), reais(e.resultado),
        l.forma_pagamento, l.canal, l.categoria, l.pago_por, dados.campanhas.find((c) => c.id === l.campanha_id)?.nome,
        l.confianca === "estimado" ? "sim" : "", l.historico ? "sim" : "", l.observacao, l.id,
      ].map(campo).join(";");
    });
  const csv = "﻿" + [cab.join(";"), ...linhas].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `ll-caixa-${diaBR(new Date())}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
