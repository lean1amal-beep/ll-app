"use client";
import { useState, useSyncExternalStore } from "react";
import { salvarConfig, salvarProduto, type Dados } from "@/lib/dados";
import { formatarReais, pct } from "@/lib/dominio/dinheiro";
import { novoId } from "@/lib/dominio/lancar";
import { NOMES_PAGAMENTO, type Config, type FormaPagamento, type Produto, type TipoProduto } from "@/lib/dominio/tipos";
import { fechar, ir } from "@/lib/rota";
import { PUSH_DISPONIVEL, ativarLembrete, testarNotificacao } from "@/lib/push";
import { SUPABASE_ATIVO } from "@/lib/supabase";
import { estadoSync, ouvirSync, sincronizar } from "@/lib/sync";
import { exportarCSV } from "@/lib/exportar";
import { MiniProduto } from "../Produto";
import { Alternar, Botao, CampoDinheiro, Campo, Cartao, Chips, Folha, Linha, Texto, cx, useAviso } from "../ui";
import { imagemParaDataURL } from "../forms/comum";

export default function Ajustes({ dados, email, aoSair }: { dados: Dados; email: string | null; aoSair: () => void }) {
  const sync = useSyncExternalStore(ouvirSync, estadoSync, estadoSync);
  const avisar = useAviso();
  const c = dados.config;
  const salvar = (f: (c: Config) => Config) => void salvarConfig(f);

  return (
    <div className="space-y-8">
      {/* Conta */}
      <Secao titulo="Conta e backup">
        {SUPABASE_ATIVO ? (
          <>
            <Linha rotulo="E-mail" valor={<span className="font-sans">{email ?? "—"}</span>} />
            <Linha
              rotulo="Sincronização"
              valor={<span className="font-sans">{sync.sincronizando ? "sincronizando…" : sync.pendentes > 0 ? `${sync.pendentes} pendente(s)` : "em dia ✓"}</span>}
            />
            {sync.ultima && <Linha rotulo="Última" valor={new Date(sync.ultima).toLocaleString("pt-BR")} />}
            {sync.erro && <div className="text-alerta text-sm">{sync.erro}</div>}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Botao variante="secundario" onClick={() => void sincronizar()}>
                Sincronizar agora
              </Botao>
              <Botao variante="secundario" onClick={aoSair}>
                Sair
              </Botao>
            </div>
          </>
        ) : (
          <p className="text-sm">
            <b>Modo local:</b> os dados ficam só neste celular, sem backup. Quando o Supabase estiver configurado, eles sobem automaticamente depois do login.
          </p>
        )}
      </Secao>

      {/* Catálogo */}
      <Secao titulo="Catálogo">
        <div className="space-y-2">
          {dados.produtos.map((p) => (
            <button key={p.id} type="button" onClick={() => ir(`produto/${p.id}`)} className={cx("w-full flex items-center gap-3 text-left", !p.ativo && "opacity-40")}>
              <MiniProduto produto={p} className="w-12 h-12 shrink-0 text-base" />
              <span className="flex-1 font-medium leading-tight">{p.nome}</span>
              <span className="num text-sm">{formatarReais(p.preco_padrao_centavos)}</span>
            </button>
          ))}
        </div>
        <Botao className="w-full" onClick={() => ir("produto/novo")}>
          Novo produto
        </Botao>
        {dados.produtos.length === 0 && (
          <Botao
            variante="secundario"
            className="w-full"
            onClick={async () => {
              await carregarHalloween();
              avisar("Drop de Halloween carregado ✓");
            }}
          >
            Carregar drop de Halloween + boné
          </Botao>
        )}
      </Secao>

      {/* Regras */}
      <Secao titulo="Regras do dinheiro">
        <CampoReais rotulo="Colchão (reserva fixa)" valor={c.colchao_centavos} aoSalvar={(v) => salvar((x) => ({ ...x, colchao_centavos: v }))} dica="Sugestão: R$ 500 quando passar de 30 peças por mês." />
        <CampoNumero rotulo="% de cada venda para o pai" valor={c.pct_pai} aoSalvar={(v) => salvar((x) => ({ ...x, pct_pai: v }))} />
        <Campo rotulo="Taxas do Mercado Pago (%)" dica="Confira no app do Mercado Pago e corrija aqui.">
          <div className="grid grid-cols-3 gap-2">
            {(["debito", "credito", "link"] as FormaPagamento[]).map((f) => (
              <CampoNumero key={f} rotulo={NOMES_PAGAMENTO[f]} valor={c.taxas[f]} aoSalvar={(v) => salvar((x) => ({ ...x, taxas: { ...x.taxas, [f]: v } }))} decimal />
            ))}
          </div>
        </Campo>
        <Campo rotulo="Contas fixas do mês">
          {c.contas_fixas.map((f, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Texto
                defaultValue={f.nome}
                onBlur={(e) => salvar((x) => ({ ...x, contas_fixas: x.contas_fixas.map((y, j) => (j === i ? { ...y, nome: e.target.value.trim() || y.nome } : y)) }))}
                className="flex-1"
              />
              <div className="w-36">
                <CampoReais valor={f.valor_centavos} aoSalvar={(v) => salvar((x) => ({ ...x, contas_fixas: x.contas_fixas.map((y, j) => (j === i ? { ...y, valor_centavos: v } : y)) }))} />
              </div>
              <button type="button" className="w-10 h-12 text-xl" onClick={() => salvar((x) => ({ ...x, contas_fixas: x.contas_fixas.filter((_, j) => j !== i) }))} aria-label="remover">
                ×
              </button>
            </div>
          ))}
          <button type="button" className="underline text-sm" onClick={() => salvar((x) => ({ ...x, contas_fixas: [...x.contas_fixas, { nome: "Nova conta", valor_centavos: 0 }] }))}>
            + adicionar conta fixa
          </button>
        </Campo>
      </Secao>

      {/* Preço */}
      <Secao titulo="Preço e custos">
        <Botao variante="secundario" className="w-full" onClick={() => ir("calculadora")}>
          Calculadora de preço
        </Botao>
        <div className="grid grid-cols-3 gap-2">
          <CampoReais rotulo="Lisa" valor={c.custos_referencia.lisa_centavos} aoSalvar={(v) => salvar((x) => ({ ...x, custos_referencia: { ...x.custos_referencia, lisa_centavos: v } }))} />
          <CampoReais rotulo="DTF/estampa" valor={c.custos_referencia.dtf_centavos} aoSalvar={(v) => salvar((x) => ({ ...x, custos_referencia: { ...x.custos_referencia, dtf_centavos: v } }))} />
          <CampoReais rotulo="Embalagem" valor={c.custos_referencia.embalagem_centavos} aoSalvar={(v) => salvar((x) => ({ ...x, custos_referencia: { ...x.custos_referencia, embalagem_centavos: v } }))} />
        </div>
        <p className="text-sm text-cinza">Custos de referência: usados quando ainda não há compra lançada no estoque.</p>
      </Secao>

      {/* Cores e tamanhos */}
      <Secao titulo="Cores e tamanhos">
        <Campo rotulo="Cores (separe por vírgula)">
          <Texto defaultValue={c.cores.join(", ")} onBlur={(e) => salvar((x) => ({ ...x, cores: lista(e.target.value, x.cores) }))} />
        </Campo>
        <Campo rotulo="Tamanhos (separe por vírgula)">
          <Texto defaultValue={c.tamanhos.join(", ")} onBlur={(e) => salvar((x) => ({ ...x, tamanhos: lista(e.target.value, x.tamanhos) }))} />
        </Campo>
      </Secao>

      {/* Lembrete */}
      <Secao titulo="Lembrete de domingo (20h)">
        <Alternar
          ligado={c.lembrete_ativo}
          aoMudar={async (v) => {
            if (v) {
              const erro = await ativarLembrete();
              if (erro) return avisar(erro);
            }
            salvar((x) => ({ ...x, lembrete_ativo: v }));
            avisar(v ? "Lembrete ativado ✓" : "Lembrete desligado");
          }}
        >
          “Lançou tudo da semana?”
          <span className="text-cinza text-sm block">{PUSH_DISPONIVEL ? "Notificação no celular, domingo às 20h." : "Falta configurar as chaves no servidor (ver docs)."}</span>
        </Alternar>
        {c.lembrete_ativo && (
          <button type="button" className="underline text-sm" onClick={() => void testarNotificacao()}>
            Testar notificação
          </button>
        )}
      </Secao>

      {/* Dados */}
      <Secao titulo="Dados">
        <Botao variante="secundario" className="w-full" onClick={() => exportarCSV(dados)}>
          Exportar tudo (CSV)
        </Botao>
        <Botao variante="secundario" className="w-full" onClick={() => ir("importar")}>
          Importar extrato (CSV)
        </Botao>
        <Botao variante="secundario" className="w-full" onClick={() => ir("acerto")}>
          {c.acerto.concluido ? "Rever acerto inicial" : "Fazer acerto inicial"}
        </Botao>
      </Secao>

      <p className="text-center text-xs text-cinza pb-4">LL Caixa v1 · LL Original</p>
    </div>
  );
}

function lista(s: string, padrao: string[]) {
  const l = s.split(",").map((x) => x.trim()).filter(Boolean);
  return l.length ? [...new Set(l)] : padrao;
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs uppercase tracking-wider text-cinza font-medium border-b border-linha pb-2">{titulo}</h2>
      {children}
    </section>
  );
}

/** Campo de reais que salva ao sair do campo. */
function CampoReais({ rotulo, valor, aoSalvar, dica }: { rotulo?: string; valor: number; aoSalvar: (v: number) => void; dica?: string }) {
  const [v, setV] = useState<number | null>(valor);
  return (
    <Campo rotulo={rotulo} dica={dica}>
      <div onBlur={() => v != null && v !== valor && aoSalvar(v)}>
        <CampoDinheiro valor={v} aoMudar={setV} />
      </div>
    </Campo>
  );
}

function CampoNumero({ rotulo, valor, aoSalvar, decimal }: { rotulo: string; valor: number; aoSalvar: (v: number) => void; decimal?: boolean }) {
  const [t, setT] = useState(String(valor).replace(".", ","));
  return (
    <Campo rotulo={rotulo}>
      <Texto
        inputMode="decimal"
        value={t}
        onChange={(e) => setT(e.target.value.replace(/[^\d,.]/g, ""))}
        onBlur={() => {
          const n = parseFloat(t.replace(",", "."));
          if (!isNaN(n) && n !== valor) aoSalvar(decimal ? Math.round(n * 100) / 100 : Math.round(n));
        }}
      />
    </Campo>
  );
}

// ─── Produto ─────────────────────────────────────────────────────────────────

export function FormProduto({ dados, id }: { dados: Dados; id: string }) {
  const avisar = useAviso();
  const original = dados.produtos.find((p) => p.id === id);
  const [nome, setNome] = useState(original?.nome ?? "");
  const [tipo, setTipo] = useState<TipoProduto>(original?.tipo ?? "camiseta");
  const [cor, setCor] = useState<string | null>(original?.cor_padrao ?? null);
  const [preco, setPreco] = useState<number | null>(original?.preco_padrao_centavos ?? 9990);
  const [custo, setCusto] = useState<number | null>(original?.custo_padrao_centavos ?? null);
  const [imagem, setImagem] = useState<string | null>(original?.imagem_url ?? null);
  const [ativo, setAtivo] = useState(original?.ativo ?? true);

  const gravar = async (extra: Partial<Produto> = {}) => {
    const agora = new Date().toISOString();
    await salvarProduto({
      id: original?.id ?? novoId(),
      nome: nome.trim(),
      tipo,
      cor_padrao: cor,
      preco_padrao_centavos: preco ?? 0,
      custo_padrao_centavos: tipo === "camiseta" ? null : custo,
      imagem_url: imagem,
      ativo,
      ordem: original?.ordem ?? dados.produtos.length,
      created_at: original?.created_at ?? agora,
      updated_at: agora,
      deleted_at: null,
      ...extra,
    });
  };

  return (
    <Folha
      titulo={original ? "Editar produto" : "Novo produto"}
      aoFechar={fechar}
      rodape={
        <Botao
          className="w-full text-lg"
          disabled={!nome.trim() || preco == null}
          onClick={async () => {
            await gravar();
            avisar("Produto salvo ✓");
            fechar();
          }}
        >
          Salvar
        </Botao>
      }
    >
      <div className="flex gap-4 items-center">
        <label className="cursor-pointer">
          <MiniProduto produto={{ nome: nome || "LL", imagem_url: imagem, cor_padrao: cor }} className="w-24 h-24" />
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setImagem(await imagemParaDataURL(f));
            }}
          />
        </label>
        <div className="text-sm text-cinza">
          Toque na imagem para pôr uma foto (print da Nuvemshop serve).
          {imagem && (
            <button type="button" className="underline block mt-1" onClick={() => setImagem(null)}>
              Remover foto
            </button>
          )}
        </div>
      </div>
      <Campo rotulo="Nome">
        <Texto value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: The Devil In I" />
      </Campo>
      <Campo rotulo="Tipo">
        <Chips
          opcoes={[
            { valor: "camiseta", rotulo: "Camiseta" },
            { valor: "bone", rotulo: "Boné" },
            { valor: "caneca", rotulo: "Caneca" },
            { valor: "outro", rotulo: "Outro" },
          ]}
          valor={tipo}
          aoMudar={setTipo}
        />
      </Campo>
      {tipo === "camiseta" && (
        <Campo rotulo="Cor da camisa">
          <Chips permitirVazio opcoes={dados.config.cores.map((x) => ({ valor: x, rotulo: x }))} valor={cor ?? undefined} aoMudar={setCor} />
        </Campo>
      )}
      <Campo rotulo="Preço padrão">
        <CampoDinheiro valor={preco} aoMudar={setPreco} grande />
      </Campo>
      {tipo !== "camiseta" && (
        <Campo rotulo="Custo da peça" dica="Quanto você paga em cada uma (ex.: boné R$ 30).">
          <CampoDinheiro valor={custo} aoMudar={setCusto} />
        </Campo>
      )}
      <Alternar ligado={ativo} aoMudar={setAtivo}>
        Ativo <span className="text-cinza text-sm block">Desligado: some da tela de venda, mas fica no histórico</span>
      </Alternar>
      {original && (
        <Botao
          variante="perigo"
          className="w-full"
          onClick={async () => {
            await gravar({ deleted_at: new Date().toISOString(), ativo: false });
            avisar("Produto removido");
            fechar();
          }}
        >
          Remover do catálogo
        </Botao>
      )}
    </Folha>
  );
}

export async function carregarHalloween() {
  const agora = new Date().toISOString();
  const base = (nome: string, cor: string, ordem: number): Produto => ({
    id: novoId(),
    nome,
    tipo: "camiseta",
    cor_padrao: cor,
    preco_padrao_centavos: 9990,
    custo_padrao_centavos: null,
    imagem_url: null,
    ativo: true,
    ordem,
    created_at: agora,
    updated_at: agora,
    deleted_at: null,
  });
  const lista: Produto[] = [
    base("Prisão Domiciliar", "Branca", 0),
    base("The Lovers", "Preta", 1),
    base("The Devil In I", "Preta", 2),
    base("Linha do Tempo (MJ)", "Branca", 3),
    base("My Music Gives Life", "Preta", 4),
    { ...base("Boné LL", "Preta", 5), tipo: "bone", cor_padrao: null, preco_padrao_centavos: 4000, custo_padrao_centavos: 3000 },
  ];
  for (const p of lista) await salvarProduto(p);
}

// ─── Calculadora de preço ────────────────────────────────────────────────────

export function Calculadora({ dados }: { dados: Dados }) {
  const c = dados.config;
  const r = c.custos_referencia;
  const [preco, setPreco] = useState<number | null>(r.preco_referencia_centavos);
  const [forma, setForma] = useState<FormaPagamento>("credito");
  const [pecasMes, setPecasMes] = useState(r.pecas_mes);
  const [incluirFixos, setIncluirFixos] = useState(false);
  const custo = r.lisa_centavos + r.dtf_centavos + r.embalagem_centavos;
  const taxa = pct(preco ?? 0, c.taxas[forma]);
  const reservaPai = pct(preco ?? 0, c.pct_pai);
  const fixosMes = r.aluguel_centavos + r.luz_centavos + r.internet_centavos;
  const fixosPeca = incluirFixos && pecasMes > 0 ? Math.round(fixosMes / pecasMes) : 0;
  const lucro = (preco ?? 0) - taxa - custo - fixosPeca;
  const margem = preco ? lucro / preco : 0;
  return (
    <Folha titulo="Calculadora de preço" aoFechar={fechar}>
      <Campo rotulo="Preço de venda">
        <CampoDinheiro valor={preco} aoMudar={setPreco} grande />
      </Campo>
      <Campo rotulo="Pagamento">
        <Chips opcoes={(["pix", "debito", "credito", "link"] as FormaPagamento[]).map((f) => ({ valor: f, rotulo: NOMES_PAGAMENTO[f] }))} valor={forma} aoMudar={setForma} />
      </Campo>
      <Cartao>
        <Linha rotulo="Preço" valor={formatarReais(preco ?? 0)} />
        <Linha rotulo={`Taxa (${c.taxas[forma]}%)`} valor={`− ${formatarReais(taxa)}`} />
        <Linha rotulo="Lisa + DTF + embalagem" valor={`− ${formatarReais(custo)}`} />
        {incluirFixos && <Linha rotulo="Fixos fictícios por peça" valor={`− ${formatarReais(fixosPeca)}`} />}
        <Linha rotulo="Lucro por peça" valor={formatarReais(lucro)} forte />
        <Linha rotulo="Margem" valor={`${Math.round(margem * 100)}%`} />
        <Linha rotulo={`Vai pro pai (${c.pct_pai}%)`} valor={formatarReais(reservaPai)} />
      </Cartao>
      <Alternar ligado={incluirFixos} aoMudar={setIncluirFixos}>
        Incluir fixos fictícios <span className="text-cinza text-sm block">Aluguel, luz e internet de referência. Só para pensar preço, nunca entram no resultado.</span>
      </Alternar>
      {incluirFixos && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <CampoReais rotulo="Aluguel" valor={r.aluguel_centavos} aoSalvar={(v) => void salvarConfig((x) => ({ ...x, custos_referencia: { ...x.custos_referencia, aluguel_centavos: v } }))} />
            <CampoReais rotulo="Luz" valor={r.luz_centavos} aoSalvar={(v) => void salvarConfig((x) => ({ ...x, custos_referencia: { ...x.custos_referencia, luz_centavos: v } }))} />
            <CampoReais rotulo="Internet" valor={r.internet_centavos} aoSalvar={(v) => void salvarConfig((x) => ({ ...x, custos_referencia: { ...x.custos_referencia, internet_centavos: v } }))} />
          </div>
          <Campo rotulo="Peças por mês (para dividir os fixos)">
            <Texto inputMode="numeric" value={String(pecasMes)} onChange={(e) => setPecasMes(parseInt(e.target.value.replace(/\D/g, "") || "0", 10))} />
          </Campo>
        </>
      )}
      <Campo rotulo="Tabela de personalizadas (por peça)">
        <Cartao>
          {c.tabela_personalizada.map((f, i) => {
            const de = i === 0 ? 1 : (c.tabela_personalizada[i - 1].ate ?? 0) + 1;
            return <Linha key={i} rotulo={f.ate ? `${de} a ${f.ate} un.` : `${de}+ un.`} valor={formatarReais(f.preco_centavos)} />;
          })}
          <div className="text-sm text-cinza pt-2">Personalizada: 50% adiantado, 50% na entrega.</div>
        </Cartao>
      </Campo>
    </Folha>
  );
}
