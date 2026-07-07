# Sala de Reunião — Embrapii

## 1. Rodar localmente

```bash
cd sala-reuniao-backend
npm install
cp .env.example .env    # depois edite o .env com seus dados de SMTP (veja seção 3)
npm start
```

Abra **http://localhost:3000** no navegador. Pronto — é a mesma página, só que agora fala com o backend.

---

## 2. Estrutura do projeto

```
sala-reuniao-backend/
├── server.js          # API (Express)
├── package.json
├── .env.example       # copie para .env e preencha
├── data/db.json        # "banco de dados" em arquivo (criado automaticamente)
└── public/
    ├── index.html       # frontend (a mesma agenda, adaptada para chamar a API)
    └── assets/logo.png   # logo EMBRAPII Unidade Bioforest usado no cabeçalho
```

Não tem banco de dados externo para configurar — os dados ficam em `data/db.json`,
um arquivo simples no próprio servidor. Isso é ótimo para começar; se um dia a
sala virar várias salas/andares com muito volume de uso, dá para trocar esse
arquivo por um banco de verdade (Postgres, etc.) sem mudar o frontend.

---

## 3. Configurar o envio de email (SMTP)

Edite o arquivo `.env` (copiado de `.env.example`):

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seuemail@gmail.com
SMTP_PASS=sua_senha_de_app
SMTP_FROM="Sala de Reunião <seuemail@gmail.com>"
```

### Se for usar Gmail
O Gmail não aceita mais a senha normal da conta para isso. Você precisa de uma
**senha de app**:
1. Ative a verificação em duas etapas na conta Google.
2. Acesse https://myaccount.google.com/apppasswords
3. Gere uma senha de app para "Mail" / "Outro".
4. Use essa senha de 16 dígitos em `SMTP_PASS`.

### Alternativas mais simples para produção
Serviços como **Resend**, **SendGrid** ou **Mailgun** têm planos gratuitos e
também funcionam via SMTP — só trocar host/usuário/senha no `.env`, sem
mudar nada no código.

Se você não configurar SMTP, o sistema continua funcionando normalmente
(reserva é salva), só que a reserva fica sem o email de confirmação — o
pop-up avisa isso na hora.

---

## 4. Subir para a internet (deploy)

A forma mais simples é usar o **Render** (tem plano gratuito):

1. Crie um repositório no GitHub e suba esta pasta (`sala-reuniao-backend`).
2. Entre em https://render.com → **New +** → **Web Service**.
3. Conecte o repositório.
4. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Em **Environment**, adicione as mesmas variáveis do `.env` (`SMTP_HOST`,
   `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`).
6. Clique em **Create Web Service**. Em poucos minutos você recebe uma URL
   pública tipo `https://sala-reuniao.onrender.com` — é essa URL que você
   compartilha com quem for usar a agenda.

Outras opções igualmente simples: **Railway**, **Fly.io**, ou uma VPS
qualquer com `pm2` rodando `npm start`.

> ⚠️ No plano gratuito do Render o servidor "dorme" depois de um tempo sem
> uso e demora alguns segundos para acordar na próxima visita — normal para
> uso interno de uma sala de reunião, mas vale saber.

---

## 6. Conectar com uma planilha do Google Sheets (opcional)

Toda vez que alguém reserva ou cancela, o servidor pode gravar/atualizar automaticamente
uma linha em uma planilha do Google Sheets. Isso funciona com uma **Conta de Serviço do
Google** — não precisa de login manual nem de o dono da planilha ficar autorizando nada
toda hora.

### Passo 1 — Criar a planilha
Crie uma planilha nova no Google Sheets. Na primeira aba, coloque esse cabeçalho na
linha 1 (a ordem importa):

```
ID | Data | Início | Término | Reservado por | Email | Assunto | Status | Criado em | Cancelado em
```

Renomeie a aba para `Reservas` (ou o nome que preferir — só ajustar a variável
`GOOGLE_SHEETS_TAB` depois).

### Passo 2 — Criar a Conta de Serviço no Google Cloud
1. Acesse https://console.cloud.google.com/ e crie um projeto (ou use um existente).
2. No menu, vá em **APIs e Serviços** → **Biblioteca**, procure por **Google Sheets API**
   e clique em **Ativar**.
3. Vá em **APIs e Serviços** → **Credenciais** → **Criar credenciais** →
   **Conta de serviço**.
4. Dê um nome (ex: `sala-reuniao-bot`) e conclua a criação. Não precisa atribuir papéis
   de projeto.
5. Clique na conta de serviço criada → aba **Chaves** → **Adicionar chave** →
   **Criar nova chave** → formato **JSON**. Um arquivo `.json` será baixado no seu
   computador — guarde-o, ele não pode ser baixado de novo depois.

### Passo 3 — Compartilhar a planilha com a conta de serviço
1. Abra o arquivo `.json` baixado e copie o valor do campo `"client_email"`
   (algo como `sala-reuniao-bot@seu-projeto.iam.gserviceaccount.com`).
2. Na sua planilha do Google Sheets, clique em **Compartilhar** e adicione esse email
   como **Editor**.

### Passo 4 — Configurar as credenciais no servidor

Há duas formas de fazer o servidor "enxergar" o arquivo `.json` da conta de serviço.
**A opção A é a recomendada** — evita os erros de "JSON inválido" que acontecem quando
o texto em base64 quebra em várias linhas ao copiar/colar no terminal do Windows.

#### Opção A — Arquivo direto no disco (recomendado)

1. Renomeie o arquivo `.json` baixado para `google-service-account.json`.
2. Coloque esse arquivo na **raiz do projeto**, do lado do `server.js`
   (ele já está no `.gitignore`, então não corre risco de subir para o GitHub por
   engano).
3. Só isso — o servidor detecta o arquivo automaticamente. Não precisa mexer no `.env`
   para essa parte.

No **Render**, use o recurso **Secret Files** (em Environment → Secret Files):
- **Filename:** `google-service-account.json`
- **Contents:** cole o conteúdo inteiro do `.json` (abra o arquivo num editor de texto
  e copie tudo).

O Render coloca esse arquivo automaticamente na raiz do projeto quando o serviço sobe.

#### Opção B — Variável de ambiente em base64 (alternativa)

Se por algum motivo você não puder usar um arquivo (ex: outra plataforma sem suporte a
"secret files"), ainda é possível usar a variável `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`
no `.env`. Gere o valor assim, evitando copiar do console (o que costuma quebrar a
linha e corromper o valor):

```powershell
# Windows (PowerShell) — gera e já copia para a área de transferência:
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\caminho\para\seu-arquivo.json")) | Set-Clipboard
```
```bash
# Mac/Linux:
base64 -i caminho/para/seu-arquivo.json | tr -d '\n' | pbcopy   # Mac
base64 -w0 caminho/para/seu-arquivo.json                          # Linux (copie a saída manualmente)
```

Depois é só colar (Ctrl+V) direto no `.env`, numa única linha, sem aspas:
```
GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=cole_aqui_tudo_em_uma_linha_so
```

Você também precisa das outras duas variáveis em qualquer uma das opções:
```
GOOGLE_SHEETS_ID=1AbCdEfGhIjKlMnOpQrStUvWxYz...
GOOGLE_SHEETS_TAB=Reservas
```

- `GOOGLE_SHEETS_ID` é o trecho da URL da planilha entre `/d/` e `/edit`:
  `https://docs.google.com/spreadsheets/d/`**`ESTE_TRECHO`**`/edit`
- `GOOGLE_SHEETS_TAB` é o nome da aba (padrão: `Reservas`).

No Render, adicione essas variáveis em **Environment** e faça o deploy novamente.

### Como funciona
- **Nova reserva** → adiciona uma linha nova na planilha com status `Confirmada`.
- **Cancelamento** → encontra a linha pelo ID e muda o status para `Cancelada`,
  preenchendo a data de cancelamento — a linha não é apagada, então a planilha vira um
  histórico completo de tudo que já aconteceu.
- Se as variáveis do Google não estiverem configuradas, o sistema continua funcionando
  normalmente, só sem sincronizar com a planilha (isso nunca trava uma reserva).

---

## 7. Endpoints da API (caso queira integrar com outra coisa)

- `GET /api/reservations?date=2026-07-06` — lista as reservas do dia
- `POST /api/reservations` — cria uma reserva
  ```json
  { "name": "Ana", "email": "ana@empresa.com", "purpose": "Reunião", "date": "2026-07-06", "start": "10:00", "end": "11:00" }
  ```
- `DELETE /api/reservations/:id` — cancela uma reserva
