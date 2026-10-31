# Deploy

O frontend pode ser publicado na Vercel ou Netlify. O backend Express deve ser
publicado como serviço Node (a configuração incluída usa Render), e o PostgreSQL
pode continuar na Neon.

## 1. Backend no Render

Crie um Blueprint no Render apontando para este repositório e selecione o
`render.yaml` na raiz. Alternativamente, crie um Web Service
com:

- Instance Type: `Free` (o serviço pode dormir após 15 minutos sem tráfego e
  levar cerca de um minuto para voltar a responder).
- Root Directory: `.`
- Build Command: `cd "Lamb Store System Design (1)/back" && npm ci`
- Start Command: `cd "Lamb Store System Design (1)/back" && npm start`
- Health Check Path: `/api/health`

Configure estas variáveis no Render, sem colocá-las no Git:

- `DATABASE_URL`: URL de conexão PostgreSQL da Neon.
- `INITIAL_ADMIN_EMAIL`: e-mail para a conta criada quando a tabela de usuários estiver vazia.
- `INITIAL_ADMIN_PASSWORD`: senha forte com pelo menos 12 caracteres.
- `AUTH_TOKEN_SECRET`: segredo aleatório com pelo menos 32 caracteres.
- `CORS_ORIGINS`: origem HTTPS do frontend (ou origens separadas por vírgula), sem caminho ou curinga.

Para gerar um segredo, use `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
no seu computador. Não compartilhe o resultado nem o inclua no repositório.

O backend cria e atualiza as tabelas ao iniciar. Em produção ele exige PostgreSQL,
não usa o fallback em arquivo JSON e protege as rotas da API com token após o login.

## 2. Frontend na Vercel

Importe o mesmo repositório na Vercel e defina como Root Directory
`Lamb Store System Design (1)/front`. Use `npm run build` como comando de build e
`dist` como diretório de saída. Cadastre a variável:

- `VITE_API_URL`: URL pública do backend Render, por exemplo `https://seu-backend.onrender.com`.

O arquivo `vercel.json` já configura o fallback da aplicação.

## Alternativa: Netlify

Crie um site a partir do mesmo repositório e configure Base directory como
`Lamb Store System Design (1)/front`. O `netlify.toml` define o build e o
fallback de rotas. Cadastre `VITE_API_URL` nas variáveis de ambiente do site.

## 3. CORS e credenciais existentes

Depois de conhecer o domínio público do frontend, configure `CORS_ORIGINS` no
Render com esse domínio; inclua também o domínio personalizado se houver. Cada
alteração de variável deve disparar um novo deploy do backend.

`INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD` só são usados para criar a
primeira conta quando não há usuários. Se a Neon já contém usuários, altere a
senha da conta existente pela área de administração antes de publicar.

Não configure `DATABASE_URL`, `AUTH_TOKEN_SECRET` ou a senha de banco como
variáveis `VITE_*`: variáveis Vite são incorporadas ao JavaScript público.
Para envio de relatórios por e-mail, configure também `RESEND_API_KEY`,
`REPORT_EMAIL_FROM` e `REPORT_EMAIL_TO` no Render.
