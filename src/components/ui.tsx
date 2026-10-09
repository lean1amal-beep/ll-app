"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { formatarReais, lerReais } from "@/lib/dominio/dinheiro";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

// ─── Ícones (traço simples) ──────────────────────────────────────────────────

const caminhos: Record<string, ReactNode> = {
  mais: <path d="M12 5v14M5 12h14" />,
  fechar: <path d="M6 6l12 12M18 6L6 18" />,
  voltar: <path d="M15 5l-7 7 7 7" />,
  seta: <path d="M9 5l7 7-7 7" />,
  inicio: <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />,
  estoque: <path d="M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10" />,
  lista: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  bandeira: <path d="M5 21V4h11l-2 4 2 4H5" />,
  ajustes: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </>
  ),
  nuvem: <path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 18z" />,
  semNuvem: <path d="M7 18h10a4 4 0 0 0 1.5-7.7M14 5.3A6 6 0 0 0 5.5 11.5 3.5 3.5 0 0 0 7 18M3 3l18 18" />,
  check: <path d="M5 12l5 5 9-10" />,
  alerta: <path d="M12 3l10 18H2zM12 10v5M12 18h.01" />,
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  lixo: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  lapis: <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />,
};

export function Icone({ nome, className = "w-6 h-6" }: { nome: keyof typeof caminhos | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {caminhos[nome]}
    </svg>
  );
}

// ─── Botões ──────────────────────────────────────────────────────────────────

type Variante = "primario" | "secundario" | "fantasma" | "perigo" | "claro";

export function Botao({
  children,
  variante = "primario",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "min-h-12 px-4 rounded-xl font-medium transition active:scale-[0.98] disabled:opacity-30 disabled:active:scale-100",
        variante === "primario" && "bg-tinta text-papel",
        variante === "secundario" && "border-2 border-tinta bg-papel text-tinta",
        variante === "fantasma" && "text-tinta underline underline-offset-4",
        variante === "perigo" && "border-2 border-alerta text-alerta bg-papel",
        variante === "claro" && "bg-papel text-tinta",
        className,
      )}
    >
      {children}
    </button>
  );
}

// ─── Chips (escolha única) ───────────────────────────────────────────────────

export interface Opcao<T> {
  valor: T;
  rotulo: ReactNode;
}

export function Chips<T extends string | number | null>({
  opcoes,
  valor,
  aoMudar,
  className,
  grande,
  permitirVazio,
}: {
  opcoes: Opcao<T>[];
  valor: T | undefined;
  aoMudar: (v: T) => void;
  className?: string;
  grande?: boolean;
  /** Tocar no selecionado desmarca (manda null). */
  permitirVazio?: boolean;
}) {
  return (
    <div className={cx("flex flex-wrap gap-2", className)}>
      {opcoes.map((o) => {
        const ativo = o.valor === valor;
        return (
          <button
            key={String(o.valor)}
            type="button"
            onClick={() => aoMudar(ativo && permitirVazio ? (null as T) : o.valor)}
            className={cx(
              "rounded-full border-2 font-medium transition active:scale-95",
              grande ? "px-5 min-h-12 text-base" : "px-3.5 min-h-10 text-sm",
              ativo ? "bg-tinta text-papel border-tinta" : "bg-papel text-tinta border-linha",
            )}
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}

// ─── Campos ──────────────────────────────────────────────────────────────────

export function Campo({ rotulo, dica, children, className }: { rotulo?: ReactNode; dica?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx("space-y-2", className)}>
      {rotulo && <div className="text-xs font-medium uppercase tracking-wider text-cinza">{rotulo}</div>}
      {children}
      {dica && <div className="text-sm text-cinza">{dica}</div>}
    </div>
  );
}

export const estiloInput =
  "w-full min-h-12 px-4 rounded-xl border-2 border-linha bg-papel focus:border-tinta outline-none transition";

export function Texto(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(estiloInput, props.className)} />;
}

/** Campo de dinheiro: digita "99,90", devolve centavos (ou null). */
export function CampoDinheiro({
  valor,
  aoMudar,
  grande,
  autoFocus,
  placeholder = "0,00",
  permitirNegativo,
}: {
  valor: number | null;
  aoMudar: (c: number | null) => void;
  grande?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  permitirNegativo?: boolean;
}) {
  const [texto, setTexto] = useState(() => (valor != null ? paraTexto(valor) : ""));
  const ultimo = useRef(valor);
  useEffect(() => {
    // Valor mudou por fora (ex.: escolheu outro produto)
    if (valor !== ultimo.current) {
      setTexto(valor != null ? paraTexto(valor) : "");
      ultimo.current = valor;
    }
  }, [valor]);
  return (
    <div className={cx("flex items-center rounded-xl border-2 border-linha focus-within:border-tinta bg-papel px-4", grande ? "min-h-16" : "min-h-12")}>
      <span className={cx("text-cinza mr-2", grande && "text-xl")}>R$</span>
      <input
        inputMode="decimal"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={texto}
        onChange={(e) => {
          const t = e.target.value.replace(permitirNegativo ? /[^\d,.-]/g : /[^\d,.]/g, "");
          setTexto(t);
          const c = lerReais(t);
          ultimo.current = c;
          aoMudar(c);
        }}
        className={cx("num flex-1 min-w-0 bg-transparent outline-none", grande ? "text-3xl font-medium" : "text-lg")}
      />
    </div>
  );
}

function paraTexto(c: number) {
  return formatarReais(c).replace("R$", "").trim();
}

export function Contador({ valor, aoMudar, min = 0, max = 999, pequeno }: { valor: number; aoMudar: (n: number) => void; min?: number; max?: number; pequeno?: boolean }) {
  const b = cx("rounded-full border-2 border-linha flex items-center justify-center font-medium active:bg-fundo shrink-0", pequeno ? "w-8 h-8 text-lg" : "w-12 h-12 text-2xl");
  return (
    <div className={cx("flex items-center", pequeno ? "gap-0.5" : "gap-2")}>
      <button type="button" className={b} onClick={() => aoMudar(Math.max(min, valor - 1))} aria-label="menos">
        −
      </button>
      <input
        inputMode="numeric"
        value={String(valor)}
        onChange={(e) => {
          const n = parseInt(e.target.value.replace(/\D/g, "") || "0", 10);
          aoMudar(Math.min(max, Math.max(min, n)));
        }}
        className={cx("num text-center bg-transparent outline-none font-medium", pequeno ? "w-7 text-base" : "w-12 text-2xl")}
      />
      <button type="button" className={b} onClick={() => aoMudar(Math.min(max, valor + 1))} aria-label="mais">
        +
      </button>
    </div>
  );
}

export function Alternar({ ligado, aoMudar, children }: { ligado: boolean; aoMudar: (v: boolean) => void; children: ReactNode }) {
  return (
    <button type="button" onClick={() => aoMudar(!ligado)} className="flex items-center gap-3 w-full text-left min-h-12">
      <span className={cx("w-12 h-7 rounded-full p-1 transition shrink-0", ligado ? "bg-tinta" : "bg-linha")}>
        <span className={cx("block w-5 h-5 rounded-full bg-papel transition", ligado && "translate-x-5")} />
      </span>
      <span className="flex-1">{children}</span>
    </button>
  );
}

// ─── Estrutura ───────────────────────────────────────────────────────────────

export function Cartao({ children, className, escuro, onClick }: { children: ReactNode; className?: string; escuro?: boolean; onClick?: () => void }) {
  const C = onClick ? "button" : "div";
  return (
    <C
      onClick={onClick}
      className={cx("block w-full text-left rounded-2xl p-4", escuro ? "bg-tinta text-papel" : "bg-papel border-2 border-linha", onClick && "active:scale-[0.99] transition", className)}
    >
      {children}
    </C>
  );
}

/** Tela cheia por cima (formulários). */
export function Folha({
  titulo,
  aoFechar,
  children,
  rodape,
  extra,
}: {
  titulo: ReactNode;
  aoFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-papel flex flex-col animar-subir">
      <header className="flex items-center gap-2 px-2 pt-[env(safe-area-inset-top)] min-h-14 border-b border-linha shrink-0">
        <button type="button" onClick={aoFechar} className="w-12 h-12 flex items-center justify-center" aria-label="Fechar">
          <Icone nome="fechar" />
        </button>
        <h1 className="flex-1 text-lg font-bold truncate">{titulo}</h1>
        {extra}
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto p-4 space-y-6 pb-8">{children}</div>
      </div>
      {rodape && (
        <footer className="shrink-0 border-t border-linha bg-papel px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <div className="max-w-lg mx-auto">{rodape}</div>
        </footer>
      )}
    </div>
  );
}

export function Recolhivel({ titulo, children, abertoInicial = false }: { titulo: ReactNode; children: ReactNode; abertoInicial?: boolean }) {
  const [aberto, setAberto] = useState(abertoInicial);
  return (
    <div className="border-t border-linha pt-2">
      <button type="button" onClick={() => setAberto(!aberto)} className="flex items-center justify-between w-full min-h-12 font-medium">
        {titulo}
        <Icone nome="seta" className={cx("w-5 h-5 transition", aberto && "rotate-90")} />
      </button>
      {aberto && <div className="space-y-5 pt-2">{children}</div>}
    </div>
  );
}

export function Linha({ rotulo, valor, forte, className }: { rotulo: ReactNode; valor: ReactNode; forte?: boolean; className?: string }) {
  return (
    <div className={cx("flex items-baseline justify-between gap-3 py-1", forte && "font-bold", className)}>
      <span className={cx(!forte && "text-cinza")}>{rotulo}</span>
      <span className="num text-right">{valor}</span>
    </div>
  );
}

export function Reais({ c, sinal, className }: { c: number; sinal?: boolean; className?: string }) {
  const txt = formatarReais(c);
  return <span className={cx("num", c < 0 && "text-alerta", className)}>{sinal && c > 0 ? `+${txt}` : txt}</span>;
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="text-center text-cinza py-10 px-6">{children}</div>;
}

// ─── Avisos (toast) com "Desfazer" ───────────────────────────────────────────

interface Aviso {
  id: number;
  texto: ReactNode;
  desfazer?: () => void;
}

const CtxAviso = createContext<(texto: ReactNode, desfazer?: () => void) => void>(() => {});

export function useAviso() {
  return useContext(CtxAviso);
}

export function ProvedorAvisos({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const avisar = useCallback((texto: ReactNode, desfazer?: () => void) => {
    window.clearTimeout(timer.current);
    setAviso({ id: Date.now(), texto, desfazer });
    timer.current = window.setTimeout(() => setAviso(null), desfazer ? 7000 : 3000);
  }, []);
  return (
    <CtxAviso.Provider value={avisar}>
      {children}
      {aviso && (
        <div key={aviso.id} className="fixed left-0 right-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-50 px-4 animar-subir">
          <div className="max-w-lg mx-auto bg-tinta text-papel rounded-2xl px-4 min-h-14 flex items-center gap-3 shadow-lg">
            <span className="flex-1 font-medium">{aviso.texto}</span>
            {aviso.desfazer && (
              <button
                type="button"
                className="font-bold underline underline-offset-4 min-h-12 px-2"
                onClick={() => {
                  aviso.desfazer?.();
                  setAviso(null);
                }}
              >
                Desfazer
              </button>
            )}
          </div>
        </div>
      )}
    </CtxAviso.Provider>
  );
}
