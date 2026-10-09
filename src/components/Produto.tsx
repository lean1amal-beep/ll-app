"use client";
import type { Produto } from "@/lib/dominio/tipos";
import { cx } from "./ui";

/** Foto do produto, ou as iniciais em preto e branco. */
export function MiniProduto({ produto, className }: { produto: Pick<Produto, "nome" | "imagem_url" | "cor_padrao">; className?: string }) {
  if (produto.imagem_url)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={produto.imagem_url} alt="" className={cx("object-cover rounded-xl bg-fundo", className)} />;
  const iniciais = produto.nome
    .split(/\s+/)
    .filter((p) => p.length > 2 || /^[A-Z]/.test(p))
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const branca = produto.cor_padrao?.toLowerCase().startsWith("branc");
  return (
    <div className={cx("rounded-xl flex items-center justify-center font-bold text-2xl", branca ? "bg-fundo text-tinta border border-linha" : "bg-tinta text-papel", className)}>
      {iniciais || "LL"}
    </div>
  );
}
