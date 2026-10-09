# Colocar o LL Caixa no ar (passo a passo)

Leva uns 20 minutos. Você não precisa entender de código: é copiar e colar.
Se travar em qualquer tela, manda um print pro Claude.

> **Dá pra usar antes disso?** Dá. Sem o Supabase, o app roda em **modo local**: salva só no celular, sem backup.
> Quando você configurar, tudo o que já lançou sobe sozinho no primeiro login.

---

## 1. Supabase (o banco de dados, grátis)

1. Entre em **supabase.com** → **Start your project** → entre com o **GitHub**.
2. **New project**:
   - Name: `ll-caixa`
   - Database password: crie uma senha forte e **guarde** (no gerenciador de senhas do Google, por exemplo).
   - Region: **South America (São Paulo)**
   - Clique em **Create new project** e espere 1 ou 2 minutos.
3. No menu da esquerda, abra **SQL Editor** → **New query**.
4. Abra o arquivo `supabase/schema.sql` deste repositório, copie **tudo**, cole lá e clique em **Run**. Tem que aparecer "Success".
5. Menu **Authentication** → **Sign In / Providers** → **Email**: deixe ligado. Para não precisar confirmar e-mail, desligue **Confirm email** (é só você que usa).
6. Menu **Project Settings** → **API** (ou **Data API** / **API Keys**). Você vai precisar de 3 coisas:
   - **Project URL** (começa com `https://...supabase.co`)
   - **anon / publishable key**: pode ir no app
   - **service_role / secret key**: ⚠️ **secreta**. Nunca cole em chat nem no código. Vai só na Vercel.

## 2. Vercel (onde o app fica no ar, grátis)

1. Entre em **vercel.com** → **Add New… → Project** → importe o repositório **ll-app**.
2. Antes de clicar em Deploy, abra **Environment Variables** e adicione:

| Nome | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL do Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | (lembrete, ver passo 3) |
| `VAPID_PRIVATE_KEY` | (lembrete, ver passo 3) |
| `VAPID_SUBJECT` | `mailto:seu-email` |
| `CRON_SECRET` | uma frase aleatória longa (ex.: gere em 1password.com/password-generator) |

3. **Chaves do lembrete (VAPID):** o Claude gera para você. Peça: "gera as chaves VAPID". A pública pode ir no chat; a **privada** cole direto na Vercel.
4. Clique em **Deploy**. No fim aparece o endereço, tipo `ll-app.vercel.app`.

> Se mudar alguma variável depois, vá em **Deployments → ⋯ → Redeploy** para valer.

## 3. Instalar no celular (Android)

1. Abra o endereço no **Chrome** do celular.
2. Crie a conta (**Primeiro acesso? Criar conta**) com seu e-mail e senha.
3. Menu ⋮ do Chrome → **Adicionar à tela inicial** / **Instalar app**.
4. Abra pelo ícone **LL Caixa**.
5. **Teste offline:** ative o modo avião, abra o app, lance uma venda de teste, desative o modo avião e veja o "pendente" sumir. Depois apague a venda de teste no Histórico.
6. Em **Ajustes → Lembrete de domingo**, ligue e permita notificações.

## 4. Depois de instalar

1. **Ajustes → Catálogo**: "Carregar drop de Halloween + boné", depois ajuste nomes, preços e fotos (print da Nuvemshop serve).
2. **Início → Fazer o acerto inicial.**
3. **Campanhas → Nova campanha** "Campos 31/10" (evento, fim 31/10, ativa).
4. Antes do evento: **Estoque → Prensar** as peças que vai levar (com a campanha ativa elas contam como "levadas").
