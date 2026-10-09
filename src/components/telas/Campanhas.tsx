"use client";
import { useMemo, useState } from "react";
import { salvarCampanha, type Dados } from "@/lib/dados";
import { relatorioCampanha } from "@/lib/dominio/calculos";
import { hojeBR } from "@/lib/dominio/datas";
import { formatarReais } from "@/lib/dominio/dinheiro";
import { novoId } from "@/lib/dominio/lancar";
import type { Campanha } from "@/lib/dominio/tipos";
import { fechar, ir, substituir } from "@/lib/rota";
import { Alternar, Botao, Campo, Cartao, Chips, Folha, Linha, Reais, Texto, Vazio, estiloInput, useAviso } from "../ui";

export default function Campanhas({ dados }: { dados: Dados }) {
  return (
    <div className="space-y-4">
      <p className="text-cinza text-sm">Drop ou evento. Com uma campanha ativa, tudo que você lança fica marcado nela automaticamente.</p>
      <Botao className="w-full" onClick={() => ir("campanha/nova")}>
        Nova campanha
      </Botao>
      {dados.campanhas.length === 0 && <Vazio>Nenhuma campanha ainda. Crie “Halloween” e “Campos 31/10”.</Vazio>}
      {dados.campanhas.map((c) => {
        const r = relatorioCampanha(dados.lancamentos, c.id);
        return (
          <Cartao key={c.id} escuro={c.ativa} onClick={() => ir(`campanha/${c.id}`)}>
            <div className="flex justify-between items-baseline">
              <div className="font-bold text-lg">{c.nome}</div>
              <div className="text-xs uppercase tracking-wider opacity-70">{c.ativa ? "ativa" : c.tipo}</div>
            </div>
            <div className="text-sm opacity-70">
              {r.vendido} vendidas{r.levado > 0 && ` de ${r.levado} levadas`} · {formatarReais(r.receita)} · lucro {formatarReais(r.lucro)}
            </div>
          </Cartao>
        );
      })}
    </div>
  );
}

export function TelaCampanha({ dados, id }: { dados: Dados; id: string }) {
  const original = dados.campanhas.find((c) => c.id === id);
  const [editando, setEditando] = useState(!original);
  if (!original || editando) return <FormCampanha original={original} aoSalvar={() => (original ? setEditando(false) : fechar())} />;
  return <RelatorioCampanha dados={dados} c={original} aoEditar={() => setEditando(true)} />;
}

function FormCampanha({ original, aoSalvar }: { original?: Campanha; aoSalvar: () => void }) {
  const avisar = useAviso();
  const [nome, setNome] = useState(original?.nome ?? "");
  const [tipo, setTipo] = useState<Campanha["tipo"]>(original?.tipo ?? "evento");
  const [inicio, setInicio] = useState(original?.inicio ?? hojeBR());
  const [fim, setFim] = useState(original?.fim ?? "");
  const [ativa, setAtiva] = useState(original?.ativa ?? true);
  return (
    <Folha
      titulo={original ? "Editar campanha" : "Nova campanha"}
      aoFechar={original ? aoSalvar : fechar}
      rodape={
        <Botao
          className="w-full text-lg"
          disabled={!nome.trim()}
          onClick={async () => {
            const agora = new Date().toISOString();
            await salvarCampanha({
              id: original?.id ?? novoId(),
              nome: nome.trim(),
              tipo,
              inicio,
              fim: fim || null,
              ativa,
              created_at: original?.created_at ?? agora,
              updated_at: agora,
              deleted_at: null,
            });
            avisar(ativa ? `${nome.trim()} ativa ✓` : "Campanha salva ✓");
            aoSalvar();
          }}
        >
          Salvar
        </Botao>
      }
    >
      <Campo rotulo="Nome">
        <Texto value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Campos 31/10" autoFocus={!original} />
      </Campo>
      <Campo rotulo="Tipo">
        <Chips
          opcoes={[
            { valor: "evento", rotulo: "Evento / show" },
            { valor: "drop", rotulo: "Drop" },
          ]}
          valor={tipo}
          aoMudar={setTipo}
        />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Início">
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={estiloInput} />
        </Campo>
        <Campo rotulo="Fim (opcional)">
          <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className={estiloInput} />
        </Campo>
      </div>
      <Alternar ligado={ativa} aoMudar={setAtiva}>
        Ativa agora <span className="text-cinza text-sm block">Marca automaticamente tudo que você lançar (só uma ativa por vez)</span>
      </Alternar>
      {tipo === "evento" && <p className="text-sm text-cinza">Com data de fim, você recebe um lembrete na manhã seguinte para fechar as contas do evento.</p>}
    </Folha>
  );
}

function RelatorioCampanha({ dados, c, aoEditar }: { dados: Dados; c: Campanha; aoEditar: () => void }) {
  const avisar = useAviso();
  const r = useMemo(() => relatorioCampanha(dados.lancamentos, c.id), [dados.lancamentos, c.id]);
  return (
    <Folha
      titulo={c.nome}
      aoFechar={fechar}
      extra={
        <button type="button" className="underline px-3" onClick={aoEditar}>
          Editar
        </button>
      }
      rodape={
        <Botao
          variante={c.ativa ? "secundario" : "primario"}
          className="w-full"
          onClick={async () => {
            await salvarCampanha({ ...c, ativa: !c.ativa });
            avisar(c.ativa ? "Campanha desativada" : `${c.nome} ativa ✓`);
          }}
        >
          {c.ativa ? "Desativar campanha" : "Ativar campanha"}
        </Botao>
      }
    >
      <div className="grid grid-cols-3 gap-2 text-center">
        <Grande rotulo="Levadas" n={r.levado} />
        <Grande rotulo="Vendidas" n={r.vendido} />
        <Grande rotulo="Sobraram" n={r.sobra} />
      </div>
      <div>
        <Linha rotulo="Receita" valor={formatarReais(r.receita)} />
        <Linha rotulo="Taxas" valor={formatarReais(r.taxas)} />
        <Linha rotulo="Custo das peças (+ perdas)" valor={formatarReais(r.cpv)} />
        <Linha rotulo="Gastos da campanha" valor={formatarReais(r.gastos)} />
        <Linha rotulo="Lucro" valor={<Reais c={r.lucro} />} forte />
      </div>
      {r.por_produto.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider text-cinza font-medium mb-2">Por estampa</div>
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-2 text-sm">
            <span className="text-cinza">Estampa</span>
            <span className="text-cinza">Lev.</span>
            <span className="text-cinza">Vend.</span>
            <span className="text-cinza">Sobra</span>
            {r.por_produto.map((p) => (
              <Fragmento key={p.produto_id ?? "avulsa"}>
                <span className="truncate">{dados.produtos.find((x) => x.id === p.produto_id)?.nome ?? "Avulsa"}</span>
                <span className="num text-right">{p.levado}</span>
                <span className="num text-right">{p.vendido}</span>
                <span className="num text-right">{p.sobra}</span>
              </Fragmento>
            ))}
          </div>
        </div>
      )}
      <Botao variante="secundario" className="w-full" onClick={() => substituir("historico")}>
        Ver lançamentos no histórico
      </Botao>
    </Folha>
  );
}

function Fragmento({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Grande({ rotulo, n }: { rotulo: string; n: number }) {
  return (
    <div className="rounded-2xl border-2 border-linha py-3">
      <div className="num text-3xl font-medium">{n}</div>
      <div className="text-xs text-cinza">{rotulo}</div>
    </div>
  );
}
