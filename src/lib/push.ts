"use client";
import { supabase } from "./supabase";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export const PUSH_DISPONIVEL = !!VAPID;

function base64ParaUint8(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const s = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/** Pede permissão, inscreve o aparelho e salva no Supabase. Retorna mensagem de erro ou null. */
export async function ativarLembrete(): Promise<string | null> {
  if (!VAPID) return "Lembrete ainda não configurado no servidor (chaves VAPID).";
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    return "Este navegador não aceita notificações. Instale o app pelo Chrome.";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return "Permissão de notificação negada. Libere nas configurações do Chrome.";
  const reg = await navigator.serviceWorker.ready;
  const insc =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ParaUint8(VAPID) }));
  const sb = supabase();
  if (!sb) return "Precisa estar conectado à conta (Supabase) para receber o lembrete.";
  const j = insc.toJSON();
  const { data } = await sb.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return "Entre na sua conta para ativar o lembrete.";
  const { error } = await sb
    .from("push_inscricoes")
    .upsert({ endpoint: j.endpoint, user_id: uid, chaves: j.keys }, { onConflict: "endpoint" });
  return error ? `Erro ao salvar: ${error.message}` : null;
}

export async function testarNotificacao() {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification("LL Caixa", { body: "Assim vai chegar o lembrete de domingo.", icon: "/icons/icon-192.png" });
}
