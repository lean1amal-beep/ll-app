const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 123456 → "R$ 1.234,56" (com espaço normal). */
export function formatarReais(centavos: number): string {
  return fmt.format(centavos / 100).replace(/ /g, " ");
}

/** Versão curta sem centavos quando redondo: 9990 → "R$ 99,90", 5000 → "R$ 50". */
export function formatarCurto(centavos: number): string {
  if (centavos % 100 === 0) return formatarReais(centavos).replace(/,00$/, "");
  return formatarReais(centavos);
}

/**
 * Lê valor digitado em reais ("99,90", "1.234,56", "R$ 50", "-12,5", "1234.56") → centavos.
 * Retorna null se não for número.
 */
export function lerReais(texto: string): number | null {
  let s = texto.replace(/R\$|\s/g, "").trim();
  if (!s) return null;
  const negativo = s.startsWith("-") || (s.startsWith("(") && s.endsWith(")"));
  s = s.replace(/[-()]/g, "");
  const temVirgula = s.includes(",");
  if (temVirgula) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // "1.234" (milhar) vs "12.50" (decimal com ponto)
    const partes = s.split(".");
    if (partes.length > 2 || (partes.length === 2 && partes[1].length === 3)) s = partes.join("");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const centavos = Math.round(parseFloat(s) * 100);
  return negativo ? -centavos : centavos;
}

/** Percentual de um valor, arredondado ao centavo. */
export function pct(centavos: number, percentual: number): number {
  return Math.round((centavos * percentual) / 100);
}

/** Divide um total em partes proporcionais às quantidades, sem perder centavos. */
export function ratear(total: number, pesos: number[]): number[] {
  const soma = pesos.reduce((a, b) => a + b, 0);
  if (soma === 0) return pesos.map(() => 0);
  const partes = pesos.map((p) => Math.floor((total * p) / soma));
  let resto = total - partes.reduce((a, b) => a + b, 0);
  for (let i = 0; resto > 0 && i < partes.length; i++) {
    if (pesos[i] > 0) {
      partes[i]++;
      resto--;
    }
  }
  return partes;
}
