# Agendamento da Sala de Reunião 

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

## 5. Endpoints da API (caso queira integrar com outra coisa)

- `GET /api/reservations?date=2026-07-06` — lista as reservas do dia
- `POST /api/reservations` — cria uma reserva
  ```json
  { "name": "Ana", "email": "ana@empresa.com", "purpose": "Reunião", "date": "2026-07-06", "start": "10:00", "end": "11:00" }
  ```
- `DELETE /api/reservations/:id` — cancela uma reserva
