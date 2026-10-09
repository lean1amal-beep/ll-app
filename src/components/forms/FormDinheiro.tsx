"use client";
import { useState } from "react";
import { calcularCaixa, calcularDivida } from "@/lib/dominio/calculos";
import { formatarReais } from "@/lib/dominio/dinheiro";
import { montarAjusteSaldo, montarSimples } from "@/lib/dominio/lancar";
import type { PagoPor } from "@/lib/dominio/tipos";
import { fechar } from "@/lib/rota";
import { Botao, CampoDinheiro, Campo, Chips, Folha, Linha, Reais } from "../ui";
import { MaisOpcoes, useExtras, useSalvar, type PropsForm } from "./comum";

export function FormAporte({ dados, original }: PropsForm) {
  const salvar = useSalvar();
  const { extras, mudar, campos } = useExtras(dados, original);
  const [valor, setValor] = useState<number | null>(original?.valor_centavos ?? null);
  const [origem, setOrigem] = useState<string | null>(original?.descricao ?? "Nubank");
  const ok = valor != null && valor > 0;
  return (
    <Folha
      titulo={original ? "Editar aporte" : "Aporte"}
      aoFechar={fechar}
      rodape={
        <Botao className="w-full text-lg" disabled={!ok} onClick={() => ok && salvar(montarSimples("aporte", valor!, { ...campos, descricao: origem }), `Aporte ${formatarReais(valor!)}`, { novo: !original })}>
          Salvar aporte
        </Botao>
      }
    >
      <p className="text-cinza">Dinheiro seu que você colocou na conta da marca. Entra no caixa, mas não é lucro.</p>
      <Campo rotulo="Valor">
        <CampoDinheiro valor={valor} aoMudar={setValor} grande autoFocus />
      </Campo>
      <Campo rotulo="De onde veio">
        <Chips opcoes={["Nubank", "Dinheiro", "Outro"].map((o) => ({ valor: o, rotulo: o }))} valor={origem ?? undefined} aoMudar={setOrigem} />
      </Campo>
      <MaisOpcoes dados={dados} extras={extras} mudar={mudar} />
    </Folha>
  );
}

export function FormPagamentoPai({ dados, original }: PropsForm) {
  const salvar = useSalvar();
  const { extras, mudar, campos } = useExtras(dados, original);
  const divida = calcularDivida(dados.lancamentos.filter((l) => l.id !== original?.id), dados.config);
  const [valor, setValor] = useState<number | null>(original?.valor_centavos ?? (divida.reserva_pendente || null));
  const [pagoPor, setPagoPor] = useState<PagoPor>(original?.pago_por ?? "marca");
  const ok = valor != null && valor > 0;
  return (
    <Folha
      titulo="Paguei meu pai"
      aoFechar={fechar}
      rodape={
        <Botao
          className="w-full text-lg"
          disabled={!ok}
          onClick={() => ok && salvar(montarSimples("pagamento_pai", valor!, { ...campos, pago_por: pagoPor }), `Pagamento ao pai ${formatarReais(valor!)}`, { novo: !original })}
        >
          Salvar pagamento
        </Botao>
      }
    >
      <div>
        <Linha rotulo="Dívida (prensa)" valor={<Reais c={divida.total} />} />
        <Linha rotulo="Já pago" valor={<Reais c={divida.pago} />} />
        <Linha rotulo="Falta" valor={<Reais c={divida.falta} />} forte />
        <Linha rotulo="Separado das vendas (10%)" valor={<Reais c={divida.reserva_pendente} />} />
      </div>
      <Campo rotulo="Quanto pagou">
        <CampoDinheiro valor={valor} aoMudar={setValor} grande />
      </Campo>
      <Campo rotulo="Saiu de onde">
        <Chips
          opcoes={[
            { valor: "marca", rotulo: "Conta da marca" },
            { valor: "leandro", rotulo: "Meu bolso" },
          ]}
          valor={pagoPor}
          aoMudar={setPagoPor}
        />
      </Campo>
      <MaisOpcoes dados={dados} extras={extras} mudar={mudar} semHistorico />
    </Folha>
  );
}

export function FormAjusteSaldo({ dados, original }: PropsForm) {
  const salvar = useSalvar();
  const { extras, mudar, campos } = useExtras(dados, original);
  const caixa = calcularCaixa(dados.lancamentos.filter((l) => l.id !== original?.id));
  const [real, setReal] = useState<number | null>(original ? caixa + original.valor_centavos : null);
  const diferenca = real != null ? real - caixa : null;
  return (
    <Folha
      titulo="Ajuste de saldo"
      aoFechar={fechar}
      rodape={
        <Botao
          className="w-full text-lg"
          disabled={real == null || diferenca === 0}
          onClick={() => real != null && salvar(montarAjusteSaldo(real, caixa, campos), "Saldo ajustado", { novo: !original })}
        >
          {diferenca === 0 ? "Já está batendo" : "Ajustar"}
        </Botao>
      }
    >
      <p className="text-cinza">Abra o app do Mercado Pago, veja o saldo e digite aqui. O LL Caixa lança a diferença para bater.</p>
      <Linha rotulo="Caixa pelo app" valor={<Reais c={caixa} />} />
      <Campo rotulo="Saldo real no Mercado Pago">
        <CampoDinheiro valor={real} aoMudar={setReal} grande autoFocus />
      </Campo>
      {diferenca != null && diferenca !== 0 && (
        <Linha rotulo="Diferença" valor={<Reais c={diferenca} sinal />} forte />
      )}
      <MaisOpcoes dados={dados} extras={extras} mudar={mudar} semHistorico />
    </Folha>
  );
}
