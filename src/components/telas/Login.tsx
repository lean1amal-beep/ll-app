"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Botao, Campo, Texto } from "../ui";

export default function Login({ aoEntrar }: { aoEntrar: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [criando, setCriando] = useState(false);
  const [esqueci, setEsqueci] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const enviar = async () => {
    const sb = supabase();
    if (!sb) return;
    setCarregando(true);
    setMsg(null);
    try {
      if (esqueci) {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/` });
        if (error) return setMsg(traduzir(error.message));
        return setMsg("Pronto. Abra o e-mail que chegou (veja também o spam), toque no link e crie uma senha nova.");
      }
      if (criando) {
        const { data, error } = await sb.auth.signUp({ email, password: senha });
        if (error) return setMsg(traduzir(error.message));
        if (!data.session) return setMsg("Conta criada. Confirme pelo link que chegou no seu e-mail e depois entre aqui.");
        aoEntrar(email);
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password: senha });
        if (error) return setMsg(traduzir(error.message));
        aoEntrar(email);
      }
    } catch {
      setMsg("Sem internet. Para entrar pela primeira vez, precisa estar online.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <main className="min-h-dvh bg-tinta text-papel flex flex-col justify-center px-6 py-10">
      <div className="max-w-sm w-full mx-auto space-y-8">
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="LL" className="w-20 h-20 rounded-2xl border border-white/20" />
          <h1 className="text-4xl font-bold">LL Caixa</h1>
          <p className="opacity-60">O extrato da LL Original.</p>
        </div>
        <form
          className="space-y-4 [&_input]:text-tinta"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
        >
          <Campo rotulo={<span className="text-white/60">E-mail</span>}>
            <Texto type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Campo>
          {!esqueci && (
            <Campo rotulo={<span className="text-white/60">Senha</span>}>
              <Texto type="password" autoComplete={criando ? "new-password" : "current-password"} value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={6} />
            </Campo>
          )}
          {msg && <p className="text-sm bg-white/10 rounded-xl p-3">{msg}</p>}
          <Botao type="submit" variante="claro" className="w-full text-lg" disabled={carregando}>
            {carregando ? "Aguarde…" : esqueci ? "Mandar link pro e-mail" : criando ? "Criar conta" : "Entrar"}
          </Botao>
        </form>
        <div className="flex flex-col items-start gap-3">
          <button
            type="button"
            className="text-sm underline opacity-60"
            onClick={() => {
              setEsqueci(!esqueci);
              setCriando(false);
              setMsg(null);
            }}
          >
            {esqueci ? "Voltar pro login" : "Esqueci minha senha"}
          </button>
          {!esqueci && (
            <button type="button" className="text-sm underline opacity-60" onClick={() => setCriando(!criando)}>
              {criando ? "Já tenho conta" : "Primeiro acesso? Criar conta"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

function traduzir(m: string) {
  if (/invalid login/i.test(m)) return "E-mail ou senha errados.";
  if (/email not confirmed/i.test(m)) return "Confirme o e-mail pelo link que chegou na sua caixa de entrada.";
  if (/already registered/i.test(m)) return "Esse e-mail já tem conta. Use “Entrar”.";
  if (/same.*password|different from the old/i.test(m)) return "A senha nova precisa ser diferente da antiga.";
  if (/password/i.test(m)) return "A senha precisa ter pelo menos 6 caracteres.";
  if (/signups not allowed/i.test(m)) return "Cadastro fechado. Use “Entrar”.";
  if (/rate limit|too many/i.test(m)) return "Muitas tentativas. Espere alguns minutos e tente de novo.";
  return m;
}

/** Tela aberta pelo link do e-mail de recuperação: define a senha nova. */
export function NovaSenha({ aoTerminar }: { aoTerminar: () => void }) {
  const [senha, setSenha] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  return (
    <main className="min-h-dvh bg-tinta text-papel flex flex-col justify-center px-6 py-10">
      <form
        className="max-w-sm w-full mx-auto space-y-6 [&_input]:text-tinta"
        onSubmit={async (e) => {
          e.preventDefault();
          setCarregando(true);
          const { error } = (await supabase()?.auth.updateUser({ password: senha })) ?? { error: null };
          setCarregando(false);
          if (error) return setMsg(traduzir(error.message));
          window.history.replaceState(null, "", "/#/");
          aoTerminar();
        }}
      >
        <h1 className="text-3xl font-bold">Senha nova</h1>
        <Campo rotulo={<span className="text-white/60">Digite a senha nova (mínimo 6 caracteres)</span>}>
          <Texto type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={6} autoFocus />
        </Campo>
        {msg && <p className="text-sm bg-white/10 rounded-xl p-3">{msg}</p>}
        <Botao type="submit" variante="claro" className="w-full text-lg" disabled={carregando}>
          {carregando ? "Aguarde…" : "Salvar senha nova"}
        </Botao>
      </form>
    </main>
  );
}
