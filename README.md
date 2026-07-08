# Sala de Reunião — versão Google Apps Script


## Passo 1 — Criar a planilha e colar o backend

1. Crie uma planilha nova em https://sheets.google.com
2. Vá em **Extensões → Apps Script**. Uma aba nova vai abrir com um editor
   de código.
3. Apague todo o conteúdo do arquivo `Código.gs` (ou `Code.gs`) que aparece
   por padrão.
4. Cole o conteúdo do arquivo **`Code.gs`** deste pacote.
5. Clique no ícone de disquete (💾) para salvar. Dê um nome ao projeto, tipo
   "Sala de Reunião - Backend".

> Não precisa criar a aba "Reservas" manualmente — o script cria sozinho na
> primeira reserva.

---

## Passo 2 — Publicar como Aplicativo da Web

1. No editor do Apps Script, clique em **Implantar** (canto superior
   direito) → **Nova implantação**.
2. Clique no ícone de engrenagem ao lado de "Selecionar tipo" → escolha
   **Aplicativo da Web**.
3. Preencha:
   - **Descrição:** (opcional) "v1"
   - **Executar como:** **Eu** (sua conta)
   - **Quem pode acessar:** **Qualquer pessoa**
4. Clique em **Implantar**.
5. Na primeira vez, o Google vai pedir autorização (aparece uma tela de
   aviso "O Google não verificou este app" — isso é normal, é o **seu
   próprio script**, não de terceiros):
   - Clique em **Avançado**
   - Clique em **Acessar [nome do projeto] (não seguro)**
   - Revise as permissões (acesso à planilha e envio de email) e confirme.
6. Copie a **URL do app da Web** que aparece — algo como:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

---

## Passo 3 — Configurar o frontend

1. Abra o arquivo **`index.html`** deste pacote em um editor de texto.
2. Procure a linha (perto do início do `<script>`):
   ```js
   var API_BASE = 'COLE_AQUI_A_URL_DO_SEU_APPS_SCRIPT/exec';
   ```
3. Substitua pela URL que você copiou no passo anterior, mantendo o `/exec`
   no final:
   ```js
   var API_BASE = 'https://script.google.com/macros/s/AKfycb.../exec';
   ```
4. Salve o arquivo.

---

## Passo 4 — Hospedar o `index.html`

Qualquer opção gratuita funciona, porque agora é só um arquivo estático.

### Opção A — GitHub Pages
1. Crie um repositório no GitHub e suba os arquivos `index.html` e a pasta
   `assets/` (com o logo).
2. Vá em **Settings → Pages** do repositório → escolha a branch `main` e a
   pasta raiz (`/`) → **Save**.
3. Em alguns minutos, o GitHub te dá uma URL tipo
   `https://seu-usuario.github.io/nome-do-repo/`.

### Opção B — Abrir localmente
Também dá para simplesmente abrir o `index.html` direto no navegador
(duplo clique) — funciona porque toda a comunicação é feita via `fetch`
para a URL do Apps Script, sem depender de servidor local.

---

## Como funciona por trás

- **Nova reserva** → o Apps Script adiciona uma linha na aba "Reservas" da
  planilha com status `Confirmada`, gera um `ManageToken` (chave secreta de
  cancelamento) e envia o email de confirmação via `MailApp` — a mesma
  função que o Google usa internamente, sem precisar configurar nada.
- **Cancelamento** → o script confere se o token enviado bate com o da
  linha; se bater, muda o status para `Cancelada`, registra a data do
  cancelamento e envia o email de cancelamento. Se não bater, recusa.
- **Conflito de horário** → antes de criar, o script varre todas as linhas
  com status `Confirmada` na mesma data e verifica sobreposição de horário.
- A aba "Reservas" funciona como planilha de consulta normal — você pode
  abrir, filtrar, fazer gráficos, exportar, etc., é uma planilha do Google
  Sheets de verdade.

---

## Limitações a saber

- **Cota de email:** contas Gmail pessoais podem enviar até ~100 emails por
  dia; contas do Google Workspace (institucionais) costumam ter ~1.500/dia.
  Mais que suficiente para uma sala de reunião.
- **A URL é feia** (`script.google.com/macros/s/...`). Se quiser uma URL
  bonita tipo `sala.embrapii.org`, isso se resolve na hospedagem do
  `index.html` (GitHub Pages permite domínio próprio), não no Apps Script.
- **Sempre que editar o `Code.gs`**, é preciso ir em **Implantar →
  Gerenciar implantações** → clique no ícone de lápis (editar) da
  implantação existente → em "Versão", escolha **Nova versão** → **Implantar**.
  Só salvar o arquivo não atualiza a URL publicada.
- **Os emails saem em nome da conta Google que publicou o script.** Se for
  uma conta institucional (ex: `sala@embrapii.org`), é essa conta que
  aparece como remetente.
