// Chamado pelo Vercel Cron (ver vercel.json):
//  - tipo=semanal: domingo 20h de Brasília → "Lançou tudo da semana?"
//  - tipo=campanha: todo dia 9h de Brasília → lembra de fechar campanha de evento que terminou ontem.
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { diaBR, somarDias } from "@/lib/dominio/datas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Inscricao {
  endpoint: string;
  user_id: string;
  chaves: { p256dh: string; auth: string };
}

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`)
    return Response.json({ erro: "não autorizado" }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!url || !service || !pub || !priv)
    return Response.json({ erro: "variáveis de ambiente faltando" }, { status: 500 });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:lembrete@llcaixa.app", pub, priv);
  const sb = createClient(url, service, { auth: { persistSession: false } });
  const tipo = new URL(req.url).searchParams.get("tipo") ?? "semanal";

  const { data: inscricoes, error } = await sb.from("push_inscricoes").select("endpoint, user_id, chaves");
  if (error) return Response.json({ erro: error.message }, { status: 500 });

  // Mensagem por usuário (só quem ativou o lembrete nos Ajustes)
  const mensagens = new Map<string, { titulo: string; corpo: string }>();
  const usuarios = [...new Set((inscricoes ?? []).map((i) => i.user_id as string))];
  for (const uid of usuarios) {
    const { data: cfg } = await sb.from("configuracoes").select("dados").eq("user_id", uid).maybeSingle();
    if (!cfg?.dados?.lembrete_ativo) continue;
    if (tipo === "semanal") {
      mensagens.set(uid, { titulo: "LL Caixa", corpo: "Lançou tudo da semana? Vendas, gastos, retiradas." });
    } else {
      const ontem = somarDias(diaBR(new Date()), -1);
      const { data: camps } = await sb
        .from("campanhas")
        .select("nome")
        .eq("user_id", uid)
        .eq("tipo", "evento")
        .eq("fim", ontem)
        .is("deleted_at", null);
      if (camps?.length)
        mensagens.set(uid, {
          titulo: `Fechando ${camps[0].nome}`,
          corpo: "Lançou todas as vendas e gastos do evento? Confere o que sobrou no estoque.",
        });
    }
  }

  let enviados = 0;
  for (const i of (inscricoes ?? []) as Inscricao[]) {
    const msg = mensagens.get(i.user_id);
    if (!msg) continue;
    try {
      await webpush.sendNotification(
        { endpoint: i.endpoint, keys: i.chaves },
        JSON.stringify({ titulo: msg.titulo, corpo: msg.corpo, url: "/" }),
      );
      enviados++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await sb.from("push_inscricoes").delete().eq("endpoint", i.endpoint);
    }
  }
  return Response.json({ tipo, enviados });
}
