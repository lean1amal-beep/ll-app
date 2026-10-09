import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Sem as variáveis, o app funciona em "modo local" (só neste aparelho, sem backup). */
export const SUPABASE_ATIVO = !!(url && anon);

let cliente: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!SUPABASE_ATIVO) return null;
  if (!cliente) {
    cliente = createClient(url!, anon!, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "ll-caixa-auth" },
    });
  }
  return cliente;
}
