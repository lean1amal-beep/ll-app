"use client";
import { useMemo, useState, type ReactNode } from "react";
import { apagarLancamento, salvarLancamento, anexarComprovante, type Dados } from "@/lib/dados";
import { dataParaISO, diaBR } from "@/lib/dominio/datas";
import { calcularEstoque } from "@/lib/dominio/estoque";
import type { Contexto } from "@/lib/dominio/lancar";
import { MODELO_PADRAO, modeloNormal, nomesModelos, type Config, type Confianca, type Lancamento } from "@/lib/dominio/tipos";
import { fechar } from "@/lib/rota";
import { Alternar, Campo, Chips, Recolhivel, Texto, estiloInput, useAviso } from "../ui";

export interface PropsForm {
  dados: Dados;
  /** Quando editando um lançamento existente */
  original?: Lancamento;
}

/** Contexto de cálculo sem o lançamento que está sendo editado (para não contar duas vezes). */
export function useCtx(dados: Dados, original?: Lancamento): Contexto {
  return useMemo(() => {
    if (!original) return dados.ctx;
    const resto = dados.lancamentos.filter((l) => l.id !== original.id);
    return { ...dados.ctx, estoque: calcularEstoque(resto) };
  }, [dados, original]);
}

export interface Extras {
  dia: string;
  campanha_id: string | null;
  confianca: Confianca;
  historico: boolean;
  observacao: string;
}

export function useExtras(dados: Dados, original?: Lancamento, padrao: Partial<Extras> = {}) {
  const [extras, setExtras] = useState<Extras>(() => ({
    dia: original ? diaBR(original.data) : diaBR(new Date()),
    campanha_id: original ? original.campanha_id : dados.campanhaAtiva?.id ?? null,
    confianca: original?.confianca ?? "confirmado",
    historico: original?.historico ?? false,
    observacao: original?.observacao ?? "",
    ...padrao,
  }));
  const mudar = (p: Partial<Extras>) => setExtras((e) => ({ ...e, ...p }));
  /** Campos prontos para os montadores */
  const campos = {
    ...(original ? { id: original.id, created_at: original.created_at, comprovante_url: original.comprovante_url } : {}),
    data: original && diaBR(original.data) === extras.dia ? original.data : dataParaISO(extras.dia),
    campanha_id: extras.campanha_id,
    confianca: extras.confianca,
    historico: extras.historico,
    observacao: extras.observacao.trim() || null,
  };
  return { extras, mudar, campos };
}

export function MaisOpcoes({
  dados,
  extras,
  mudar,
  semHistorico,
  children,
  abertoInicial,
}: {
  dados: Dados;
  extras: Extras;
  mudar: (p: Partial<Extras>) => void;
  semHistorico?: boolean;
  children?: ReactNode;
  abertoInicial?: boolean;
}) {
  const resumo = [
    extras.dia !== diaBR(new Date()) && extras.dia.split("-").reverse().join("/"),
    extras.campanha_id && dados.campanhas.find((c) => c.id === extras.campanha_id)?.nome,
    extras.confianca === "estimado" && "estimado",
    extras.historico && "antes do app",
  ].filter(Boolean);
  return (
    <Recolhivel
      abertoInicial={abertoInicial}
      titulo={
        <span>
          Mais detalhes {resumo.length > 0 && <span className="text-cinza font-normal">· {resumo.join(" · ")}</span>}
        </span>
      }
    >
      {children}
      <Campo rotulo="Data">
        <input type="date" value={extras.dia} max={diaBR(new Date())} onChange={(e) => e.target.value && mudar({ dia: e.target.value })} className={estiloInput} />
      </Campo>
      <Campo rotulo="Campanha">
        <select value={extras.campanha_id ?? ""} onChange={(e) => mudar({ campanha_id: e.target.value || null })} className={estiloInput}>
          <option value="">Nenhuma</option>
          {dados.campanhas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
              {c.ativa ? " (ativa)" : ""}
            </option>
          ))}
        </select>
      </Campo>
      <Alternar ligado={extras.confianca === "estimado"} aoMudar={(v) => mudar({ confianca: v ? "estimado" : "confirmado" })}>
        Valor estimado <span className="text-cinza text-sm block">Não tenho certeza do valor exato</span>
      </Alternar>
      {!semHistorico && (
        <Alternar ligado={extras.historico} aoMudar={(v) => mudar({ historico: v })}>
          Foi antes do app <span className="text-cinza text-sm block">Entra no lucro, mas não no caixa nem no estoque</span>
        </Alternar>
      )}
      <Campo rotulo="Observação">
        <Texto value={extras.observacao} onChange={(e) => mudar({ observacao: e.target.value })} placeholder="Opcional" />
      </Campo>
    </Recolhivel>
  );
}

/** Salva, fecha a tela e mostra "✓ salvo" com Desfazer (só para lançamentos novos). */
export function useSalvar() {
  const avisar = useAviso();
  return async (l: Lancamento, mensagem: string, opts: { novo: boolean; foto?: Blob | null; manterAberto?: boolean }) => {
    await salvarLancamento(l);
    if (opts.foto) await anexarComprovante(l.id, opts.foto);
    if (!opts.manterAberto) fechar();
    avisar(`${mensagem} ✓`, opts.novo ? () => void apagarLancamento(l.id) : undefined);
  };
}

/** Foto do comprovante (reduzida para não pesar). */
export function CampoFoto({ foto, aoMudar }: { foto: Blob | null; aoMudar: (b: Blob | null) => void }) {
  const url = useMemo(() => (foto ? URL.createObjectURL(foto) : null), [foto]);
  return (
    <Campo rotulo="Comprovante (opcional)">
      {url ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="comprovante" className="w-20 h-20 object-cover rounded-xl border-2 border-linha" />
          <button type="button" className="underline" onClick={() => aoMudar(null)}>
            Remover
          </button>
        </div>
      ) : (
        <label className="flex items-center justify-center gap-2 min-h-12 rounded-xl border-2 border-dashed border-linha text-cinza cursor-pointer">
          <span>Tirar foto ou escolher</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) aoMudar(await reduzirImagem(f, 1280, 0.7));
            }}
          />
        </label>
      )}
    </Campo>
  );
}

export async function reduzirImagem(arquivo: Blob, lado: number, qualidade: number): Promise<Blob> {
  const canvas = await desenhar(arquivo, lado);
  return new Promise((ok) => canvas.toBlob((b) => ok(b ?? arquivo), "image/jpeg", qualidade));
}

export async function imagemParaDataURL(arquivo: Blob, lado = 256): Promise<string> {
  const canvas = await desenhar(arquivo, lado);
  return canvas.toDataURL("image/jpeg", 0.75);
}

async function desenhar(arquivo: Blob, lado: number): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(arquivo);
  const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * escala);
  canvas.height = Math.round(bmp.height * escala);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Escolha do modelo da camisa (Tradicional / Baby look). Some se só houver um modelo. */
export function EscolhaModelo({ config, valor, aoMudar, rotulo = "Modelo" }: { config: Config; valor: string | null; aoMudar: (m: string | null) => void; rotulo?: string }) {
  const nomes = nomesModelos(config);
  if (nomes.length < 2) return null;
  return (
    <Campo rotulo={rotulo}>
      <Chips opcoes={nomes.map((n) => ({ valor: n, rotulo: n }))} valor={modeloNormal(valor) ?? MODELO_PADRAO} aoMudar={(n) => aoMudar(modeloNormal(n))} />
    </Campo>
  );
}
