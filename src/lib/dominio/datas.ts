// Tudo no fuso de Brasília (America/Sao_Paulo, sem horário de verão desde 2019).
const TZ = "America/Sao_Paulo";

const partesFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** ISO (UTC) → "YYYY-MM-DD" no horário de Brasília. */
export function diaBR(iso: string | Date): string {
  return partesFmt.format(typeof iso === "string" ? new Date(iso) : iso);
}

/** ISO → "YYYY-MM" no horário de Brasília. */
export function mesBR(iso: string | Date): string {
  return diaBR(iso).slice(0, 7);
}

export function hojeBR(agora: Date = new Date()): string {
  return diaBR(agora);
}

/** "YYYY-MM-DD" (dia em Brasília) → ISO, meio-dia de Brasília. Se for hoje, usa a hora atual. */
export function dataParaISO(dia: string, agora: Date = new Date()): string {
  if (dia === diaBR(agora)) return agora.toISOString();
  return new Date(`${dia}T12:00:00-03:00`).toISOString();
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-10" → "out/2026" */
export function nomeMes(mes: string): string {
  const [a, m] = mes.split("-");
  return `${MESES[Number(m) - 1]}/${a}`;
}

/** ISO → "09/10" ou "09/10/2025" se for de outro ano. */
export function dataCurta(iso: string, agora: Date = new Date()): string {
  const d = diaBR(iso);
  const [a, m, dd] = d.split("-");
  return a === diaBR(agora).slice(0, 4) ? `${dd}/${m}` : `${dd}/${m}/${a}`;
}

export function horaBR(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
}

/** Soma dias a "YYYY-MM-DD". */
export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
