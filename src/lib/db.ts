// Banco local (IndexedDB via Dexie). É a fonte da verdade da tela: tudo funciona offline.
import Dexie, { type Table } from "dexie";
import type { Campanha, Config, Lancamento, Produto } from "./dominio/tipos";

/** 1 = ainda não foi para o Supabase. */
export type Pendente = { _pendente?: 0 | 1 };

export type LancamentoLocal = Lancamento & Pendente;
export type ProdutoLocal = Produto & Pendente;
export type CampanhaLocal = Campanha & Pendente;
export interface ConfigLocal extends Pendente {
  id: "config";
  dados: Config;
  updated_at: string;
}
export interface ArquivoLocal {
  /** id do lançamento */
  id: string;
  blob: Blob;
  tipo: string;
}
export interface Meta {
  chave: string;
  valor: string | null;
}

class BancoLL extends Dexie {
  lancamentos!: Table<LancamentoLocal, string>;
  produtos!: Table<ProdutoLocal, string>;
  campanhas!: Table<CampanhaLocal, string>;
  config!: Table<ConfigLocal, string>;
  arquivos!: Table<ArquivoLocal, string>;
  meta!: Table<Meta, string>;

  constructor() {
    super("ll-caixa");
    this.version(1).stores({
      lancamentos: "id, data, tipo, _pendente, campanha_id",
      produtos: "id, _pendente",
      campanhas: "id, _pendente",
      config: "id, _pendente",
      arquivos: "id",
      meta: "chave",
    });
  }
}

export const db = new BancoLL();

export async function lerMeta(chave: string): Promise<string | null> {
  return (await db.meta.get(chave))?.valor ?? null;
}

export async function gravarMeta(chave: string, valor: string | null) {
  await db.meta.put({ chave, valor });
}
