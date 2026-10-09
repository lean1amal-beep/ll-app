"use client";
// Navegação simples por hash (#/estoque, #/novo/venda). O botão "voltar" do Android fecha telas.
import { useSyncExternalStore } from "react";

const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

if (typeof window !== "undefined") {
  window.addEventListener("popstate", avisar);
  window.addEventListener("hashchange", avisar);
}

export function rotaAtual(): string {
  if (typeof window === "undefined") return "";
  return decodeURIComponent(window.location.hash.replace(/^#\/?/, ""));
}

/** Abre uma tela por cima (o "voltar" retorna). */
export function ir(rota: string) {
  const nivel = (window.history.state?.ll ?? 0) + 1;
  window.history.pushState({ ll: nivel }, "", `#/${rota}`);
  avisar();
}

/** Troca a tela atual sem criar histórico. */
export function substituir(rota: string) {
  window.history.replaceState(window.history.state, "", `#/${rota}`);
  avisar();
}

/** Fecha a tela atual (volta), ou vai pro início se abriu direto. */
export function fechar() {
  if (window.history.state?.ll) window.history.back();
  else substituir("");
}

export function useRota(): string {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    rotaAtual,
    () => "",
  );
}
