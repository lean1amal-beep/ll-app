"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Botao, Campo, Texto } from "../ui";

export default function Login({ aoEntrar }: { aoEntrar: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [criando, setCriando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const enviar = async () => {
    const sb = supabase();
    if (!sb) return;
    setCarregando(true);
    setMsg(null);
    try {
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
          <Campo rotulo={<span className="text-white/60">Senha</span>}>
            <Texto type="password" autoComplete={criando ? "new-password" : "current-password"} value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={6} />
          </Campo>
          {msg && <p className="text-sm bg-white/10 rounded-xl p-3">{msg}</p>}
          <Botao type="submit" variante="claro" className="w-full text-lg" disabled={carregando}>
            {carregando ? "Aguarde…" : criando ? "Criar conta" : "Entrar"}
          </Botao>
        </form>
        <button type="button" className="text-sm underline opacity-60" onClick={() => setCriando(!criando)}>
          {criando ? "Já tenho conta" : "Primeiro acesso? Criar conta"}
        </button>
      </div>
    </main>
  );
}

function traduzir(m: string) {
  if (/invalid login/i.test(m)) return "E-mail ou senha errados.";
  if (/email not confirmed/i.test(m)) return "Confirme o e-mail pelo link que chegou na sua caixa de entrada.";
  if (/already registered/i.test(m)) return "Esse e-mail já tem conta. Use “Entrar”.";
  if (/password/i.test(m)) return "A senha precisa ter pelo menos 6 caracteres.";
  if (/signups not allowed/i.test(m)) return "Cadastro fechado. Use “Entrar”.";
  return m;
}
