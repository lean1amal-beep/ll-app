-- LL Caixa: estrutura do banco no Supabase.
-- Como usar: Supabase → SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.

-- Carimbo de sincronização (o app baixa o que mudou depois do último carimbo).
create or replace function public.carimbar_sync() returns trigger
language plpgsql as $$
begin
  new.sincronizado_em := clock_timestamp();
  return new;
end $$;

-- ─── Lançamentos ───────────────────────────────────────────────────────────
create table if not exists public.lancamentos (
  id uuid primary key,                       -- gerado no celular (idempotente)
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data timestamptz not null,
  tipo text not null check (tipo in ('venda','gasto','investimento','aporte','retirada_dinheiro',
    'retirada_produto','pagamento_pai','perda','prensagem','ajuste_saldo','ajuste_estoque')),
  valor_centavos bigint not null default 0,
  taxa_centavos bigint not null default 0,
  cpv_centavos bigint not null default 0,
  forma_pagamento text check (forma_pagamento in ('pix','credito','debito','link','dinheiro')),
  categoria text,
  produto_id uuid,
  descricao text,
  modelo text,                               -- modelo da camisa (Baby look...); vazio = Tradicional
  cor text,
  tamanho text,
  quantidade integer not null default 1,
  canal text,
  modo_venda text check (modo_venda in ('pronta','sob_demanda')),
  campanha_id uuid,
  pago_por text not null default 'marca' check (pago_por in ('marca','leandro','pai')),
  eh_presente boolean not null default false,
  historico boolean not null default false,
  confianca text not null default 'confirmado' check (confianca in ('confirmado','estimado')),
  conta_fixa text,
  observacao text,
  comprovante_url text,
  movimentos jsonb not null default '[]'::jsonb,  -- movimentos de estoque deste lançamento
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  sincronizado_em timestamptz not null default clock_timestamp()
);
-- Atualizações em bancos já criados (pode rodar de novo sem problema)
alter table public.lancamentos add column if not exists modelo text;

create index if not exists lancamentos_sync on public.lancamentos (user_id, sincronizado_em);

-- ─── Produtos (catálogo) ───────────────────────────────────────────────────
create table if not exists public.produtos (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  tipo text not null default 'camiseta' check (tipo in ('camiseta','bone','caneca','outro')),
  cor_padrao text,
  preco_padrao_centavos bigint not null default 0,
  custo_padrao_centavos bigint,
  imagem_url text,
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  sincronizado_em timestamptz not null default clock_timestamp()
);
create index if not exists produtos_sync on public.produtos (user_id, sincronizado_em);

-- ─── Campanhas ─────────────────────────────────────────────────────────────
create table if not exists public.campanhas (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  tipo text not null default 'drop' check (tipo in ('drop','evento')),
  inicio date not null,
  fim date,
  ativa boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  sincronizado_em timestamptz not null default clock_timestamp()
);
create index if not exists campanhas_sync on public.campanhas (user_id, sincronizado_em);

-- ─── Configurações (uma linha por usuário) ─────────────────────────────────
create table if not exists public.configuracoes (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  dados jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  sincronizado_em timestamptz not null default clock_timestamp()
);

-- ─── Inscrições de notificação (lembrete de domingo) ───────────────────────
create table if not exists public.push_inscricoes (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  chaves jsonb not null,
  created_at timestamptz not null default now()
);

-- Carimbos
do $$
declare t text;
begin
  foreach t in array array['lancamentos','produtos','campanhas','configuracoes'] loop
    execute format('drop trigger if exists %I_carimbo on public.%I', t, t);
    execute format('create trigger %I_carimbo before insert or update on public.%I
                    for each row execute function public.carimbar_sync()', t, t);
  end loop;
end $$;

-- ─── Segurança: cada um só vê o que é seu (RLS) ────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['lancamentos','produtos','campanhas','configuracoes','push_inscricoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "dono" on public.%I', t);
    execute format('create policy "dono" on public.%I for all to authenticated
                    using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- ─── Fotos de comprovante (Storage, privado) ───────────────────────────────
insert into storage.buckets (id, name, public)
values ('comprovantes', 'comprovantes', false)
on conflict (id) do nothing;

drop policy if exists "comprovantes do dono" on storage.objects;
create policy "comprovantes do dono" on storage.objects for all to authenticated
  using (bucket_id = 'comprovantes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'comprovantes' and (storage.foldername(name))[1] = auth.uid()::text);
