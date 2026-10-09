// Leitura de extrato em CSV (Mercado Pago, Nubank ou planilha) para o acerto inicial.
import { lerReais } from "./dinheiro";

/** Divide o texto em linhas/colunas. Detecta ";" ou "," e respeita aspas. */
export function lerCSV(texto: string): string[][] {
  const limpo = texto.replace(/^\uFEFF/, "");
  const primeira = limpo.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const sep = [";", ",", "\t"].reduce((a, b) => (contar(primeira, b) > contar(primeira, a) ? b : a));
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpo[i + 1] === "\n") i++;
      linha.push(campo);
      if (linha.some((x) => x.trim())) linhas.push(linha.map((x) => x.trim()));
      linha = [];
      campo = "";
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((x) => x.trim())) linhas.push(linha.map((x) => x.trim()));
  return linhas;
}

function contar(s: string, c: string) {
  return s.split(c).length - 1;
}

/** "31/12/2026", "31/12/26", "2026-12-31", "2026-12-31T10:00:00" → "2026-12-31" */
export function lerData(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

export interface Colunas {
  data: number;
  descricao: number;
  valor: number;
}

/** Adivinha as colunas pelo cabeçalho. */
export function adivinharColunas(cabecalho: string[]): Colunas {
  const h = cabecalho.map((x) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));
  const achar = (...nomes: string[]) => h.findIndex((x) => nomes.some((n) => x.includes(n)));
  const data = achar("data", "date");
  const descricao = achar("descricao", "description", "titulo", "historico", "detalhe", "identificador");
  const valor = achar("valor", "amount", "montante", "net_amount", "quantia");
  return {
    data: data >= 0 ? data : 0,
    descricao: descricao >= 0 ? descricao : 1,
    valor: valor >= 0 ? valor : Math.min(2, cabecalho.length - 1),
  };
}

export interface LinhaExtrato {
  indice: number;
  data: string;
  descricao: string;
  /** Positivo = entrou, negativo = saiu */
  valor_centavos: number;
}

export function lerExtrato(linhas: string[][], col: Colunas, temCabecalho = true): LinhaExtrato[] {
  const out: LinhaExtrato[] = [];
  linhas.slice(temCabecalho ? 1 : 0).forEach((l, i) => {
    const data = lerData(l[col.data] ?? "");
    const valor = lerReais(l[col.valor] ?? "");
    if (!data || valor === null || valor === 0) return;
    out.push({ indice: i, data, descricao: l[col.descricao] ?? "", valor_centavos: valor });
  });
  return out;
}
