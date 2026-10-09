// Lê uma lista de peças prontas escrita à mão, do jeito que o Leandro manda no chat:
//   "M/P - Slipknot ALL HOPE IS GONE"
//   "GG - System of a down (logo peito)"
//   "2 GG - Linkin Park"   (quantidade opcional)

export interface LinhaProntas {
  nome: string;
  /** Um item por peça (tamanho repetido = mais de uma peça). */
  tamanhos: string[];
}

export interface ResultadoLista {
  linhas: LinhaProntas[];
  /** Linhas que não deu para entender. */
  erros: string[];
}

export function lerListaProntas(texto: string, tamanhosValidos: string[]): ResultadoLista {
  const validos = new Map(tamanhosValidos.map((t) => [t.toUpperCase(), t]));
  const linhas: LinhaProntas[] = [];
  const erros: string[] = [];
  for (const bruta of texto.split(/\r?\n/)) {
    const l = bruta.trim().replace(/[.;]$/, "");
    if (!l) continue;
    const m = l.match(/^(.+?)\s*[-–—:]\s*(.+)$/);
    if (!m) {
      erros.push(bruta.trim());
      continue;
    }
    const tamanhos: string[] = [];
    let ok = true;
    // "2 GG" / "2x GG" → "2xGG" antes de separar por espaço
    const tams = m[1].replace(/(\d+)\s*x?\s+/gi, "$1x");
    for (const parte of tams.split(/\s*[/,+]\s*|\s+e\s+|\s+/i).map((x) => x.trim()).filter(Boolean)) {
      const q = parte.match(/^(\d+)x?([A-Za-z]+\d*)$/i);
      const qtd = q ? Number(q[1]) : 1;
      const t = validos.get((q ? q[2] : parte).toUpperCase());
      if (!t || qtd < 1) {
        ok = false;
        break;
      }
      for (let i = 0; i < qtd; i++) tamanhos.push(t);
    }
    const nome = m[2].trim().replace(/\.$/, "");
    if (!ok || !tamanhos.length || !nome) erros.push(bruta.trim());
    else linhas.push({ nome, tamanhos });
  }
  return { linhas, erros };
}

/** Compara nomes ignorando maiúsculas, acentos e espaços extras. */
export function mesmoNome(a: string, b: string): boolean {
  const n = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  return n(a) === n(b);
}
