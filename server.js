require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

// ---------- Banco de dados em arquivo (data/db.json) ----------
const adapter = new FileSync(path.join(__dirname, 'data', 'db.json'));
const db = low(adapter);
db.defaults({ reservations: [] }).write();

// ---------- Configuração do app ----------
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const OPEN_HOUR = 8;
const CLOSE_HOUR = 19;

function toMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// Nunca expor o manageToken (chave de cancelamento) para quem não é o dono da reserva
function toPublic(reservation) {
  const { manageToken, ...publicFields } = reservation;
  return publicFields;
}

// ---------- Envio de email ----------
let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true', // true para porta 465
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendConfirmationEmail(reservation) {
  if (!transporter) {
    return { sent: false, reason: 'SMTP não configurado no servidor (.env)' };
  }
  if (!reservation.email) {
    return { sent: false, reason: 'Reserva sem e-mail informado' };
  }
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: reservation.email,
      subject: `Reserva confirmada — Sala de Reunião (${reservation.date})`,
      text:
        `Olá ${reservation.name},\n\n` +
        `Sua reserva foi confirmada:\n` +
        `Data: ${reservation.date}\n` +
        `Horário: ${reservation.start} - ${reservation.end}\n` +
        `Assunto: ${reservation.purpose || '-'}\n\n` +
        `Atenciosamente,\nSistema de Agendamento`,
      html:
        `<p>Olá <strong>${reservation.name}</strong>,</p>` +
        `<p>Sua reserva foi confirmada:</p>` +
        `<ul>` +
        `<li><strong>Data:</strong> ${reservation.date}</li>` +
        `<li><strong>Horário:</strong> ${reservation.start} – ${reservation.end}</li>` +
        `<li><strong>Assunto:</strong> ${reservation.purpose || '-'}</li>` +
        `</ul>` +
        `<p>Atenciosamente,<br>Sistema de Agendamento</p>`
    });
    return { sent: true };
  } catch (err) {
    console.error('Erro ao enviar email:', err.message);
    return { sent: false, reason: err.message };
  }
}

async function sendCancellationEmail(reservation) {
  if (!transporter) {
    return { sent: false, reason: 'SMTP não configurado no servidor (.env)' };
  }
  if (!reservation.email) {
    return { sent: false, reason: 'Reserva sem e-mail informado' };
  }
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: reservation.email,
      subject: `Reserva cancelada — Sala de Reunião (${reservation.date})`,
      text:
        `Olá ${reservation.name},\n\n` +
        `Sua reserva abaixo foi cancelada:\n` +
        `Data: ${reservation.date}\n` +
        `Horário: ${reservation.start} - ${reservation.end}\n` +
        `Assunto: ${reservation.purpose || '-'}\n\n` +
        `Se você não pediu esse cancelamento, entre em contato com a administração da sala.\n\n` +
        `Atenciosamente,\nSistema de Agendamento - Embrapii`,
      html:
        `<p>Olá <strong>${reservation.name}</strong>,</p>` +
        `<p>Sua reserva abaixo foi <strong>cancelada</strong>:</p>` +
        `<ul>` +
        `<li><strong>Data:</strong> ${reservation.date}</li>` +
        `<li><strong>Horário:</strong> ${reservation.start} – ${reservation.end}</li>` +
        `<li><strong>Assunto:</strong> ${reservation.purpose || '-'}</li>` +
        `</ul>` +
        `<p>Se você não pediu esse cancelamento, entre em contato com a administração da sala.</p>` +
        `<p>Atenciosamente,<br>Sistema de Agendamento - Embrapii</p>`
    });
    return { sent: true };
  } catch (err) {
    console.error('Erro ao enviar email de cancelamento:', err.message);
    return { sent: false, reason: err.message };
  }
}

// ---------- Integração com Google Sheets (opcional) ----------
// Usa uma Conta de Serviço do Google — veja o README para o passo a passo de configuração.
const SHEET_ID = process.env.GOOGLE_SHEETS_ID;
const SHEET_TAB = process.env.GOOGLE_SHEETS_TAB || 'Reservas';
let sheetsApi = null;

function loadGoogleCredentials() {
  // Opção A (recomendada): arquivo .json direto no disco — evita erros de copiar/colar.
  const filePath = process.env.GOOGLE_SERVICE_ACCOUNT_FILE || path.join(__dirname, 'google-service-account.json');
  const fs = require('fs');
  console.log(`Google Sheets: procurando arquivo de credenciais em ${filePath} ...`);
  if (fs.existsSync(filePath)) {
    console.log('Google Sheets: arquivo encontrado, tentando ler...');
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      console.error(`Erro ao ler ${filePath}:`, err.message);
      return null;
    }
  }
  console.log('Google Sheets: arquivo não encontrado nesse caminho.');

  // Opção B: conteúdo em base64 numa variável de ambiente (útil quando não dá para subir arquivo, ex: certos PaaS).
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64) {
    console.log('Google Sheets: tentando GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 do .env...');
    try {
      const decoded = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.trim(), 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch (err) {
      console.error('Erro ao decodificar GOOGLE_SERVICE_ACCOUNT_JSON_BASE64:', err.message);
    }
  }

  return null;
}

if (SHEET_ID) {
  const creds = loadGoogleCredentials();
  if (creds && creds.client_email && creds.private_key) {
    try {
      const auth = new google.auth.JWT(
        creds.client_email,
        null,
        creds.private_key,
        ['https://www.googleapis.com/auth/spreadsheets']
      );
      sheetsApi = google.sheets({ version: 'v4', auth });
    } catch (err) {
      console.error('Erro ao configurar Google Sheets:', err.message);
      sheetsApi = null;
    }
  }
}

// Adiciona uma linha na planilha para uma nova reserva
async function appendReservationToSheet(reservation) {
  if (!sheetsApi) return { synced: false, reason: 'Google Sheets não configurado no servidor (.env)' };
  try {
    await sheetsApi.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_TAB}!A:J`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[
          reservation.id,
          reservation.date,
          reservation.start,
          reservation.end,
          reservation.name,
          reservation.email || '',
          reservation.purpose || '',
          'Confirmada',
          reservation.createdAt,
          ''
        ]]
      }
    });
    return { synced: true };
  } catch (err) {
    console.error('Erro ao gravar na planilha:', err.message);
    return { synced: false, reason: err.message };
  }
}

// Marca a linha correspondente como "Cancelada" (mantém histórico em vez de apagar a linha)
async function markReservationCancelledInSheet(reservationId) {
  if (!sheetsApi) return { synced: false, reason: 'Google Sheets não configurado no servidor (.env)' };
  try {
    const idsRes = await sheetsApi.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_TAB}!A:A`
    });
    const ids = (idsRes.data.values || []).map(row => row[0]);
    const rowIndex = ids.indexOf(reservationId); // 0-based; linha 0 é o cabeçalho
    if (rowIndex < 1) return { synced: false, reason: 'Linha não encontrada na planilha' };

    const rowNumber = rowIndex + 1; // 1-based para o range do Sheets
    await sheetsApi.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: `${SHEET_TAB}!H${rowNumber}`, values: [['Cancelada']] },
          { range: `${SHEET_TAB}!J${rowNumber}`, values: [[new Date().toISOString()]] }
        ]
      }
    });
    return { synced: true };
  } catch (err) {
    console.error('Erro ao atualizar planilha (cancelamento):', err.message);
    return { synced: false, reason: err.message };
  }
}

// ---------- Rotas da API ----------

// Lista reservas de um dia: GET /api/reservations?date=2026-07-06
app.get('/api/reservations', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Parâmetro "date" é obrigatório (YYYY-MM-DD).' });

  const list = db.get('reservations')
    .filter({ date })
    .sortBy(r => toMinutes(r.start))
    .value();

  res.json(list.map(toPublic));
});

// Cria uma reserva: POST /api/reservations
app.post('/api/reservations', async (req, res) => {
  const { name, email, purpose, date, start, end } = req.body || {};

  if (!name || !date || !start || !end) {
    return res.status(400).json({ error: 'Preencha nome, data, início e término.' });
  }

  const sMin = toMinutes(start);
  const eMin = toMinutes(end);

  if (eMin <= sMin) {
    return res.status(400).json({ error: 'O horário de término deve ser depois do início.' });
  }
  if (sMin < OPEN_HOUR * 60 || eMin > CLOSE_HOUR * 60) {
    return res.status(400).json({ error: `A sala funciona das ${OPEN_HOUR}:00 às ${CLOSE_HOUR}:00.` });
  }

  const existing = db.get('reservations').filter({ date }).value();
  const conflict = existing.some(r => {
    const rs = toMinutes(r.start);
    const re = toMinutes(r.end);
    return sMin < re && eMin > rs;
  });

  if (conflict) {
    return res.status(409).json({ error: 'Esse horário já está reservado. Escolha outro.' });
  }

  const reservation = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    manageToken: crypto.randomBytes(20).toString('hex'), // chave secreta de cancelamento, só o criador recebe
    name,
    email: email || null,
    purpose: purpose || '',
    date,
    start,
    end,
    createdAt: new Date().toISOString()
  };

  db.get('reservations').push(reservation).write();

  const emailResult = await sendConfirmationEmail(reservation);
  const sheetResult = await appendReservationToSheet(reservation);

  // manageToken só é devolvido aqui, na resposta de criação, para quem fez a reserva
  res.status(201).json({
    reservation: toPublic(reservation),
    manageToken: reservation.manageToken,
    email: emailResult,
    sheet: sheetResult
  });
});

// Cancela uma reserva: DELETE /api/reservations/:id
// Exige o "manageToken" — a chave secreta que só quem criou a reserva recebeu.
app.delete('/api/reservations/:id', async (req, res) => {
  const { id } = req.params;
  const providedToken = req.get('x-manage-token') || (req.body && req.body.manageToken);

  const item = db.get('reservations').find({ id }).value();
  if (!item) return res.status(404).json({ error: 'Reserva não encontrada.' });

  if (!providedToken || providedToken !== item.manageToken) {
    return res.status(403).json({ error: 'Você não tem permissão para cancelar esta reserva. Apenas quem a criou pode cancelá-la.' });
  }

  db.get('reservations').remove({ id }).write();

  const emailResult = await sendCancellationEmail(item);
  await markReservationCancelledInSheet(id);

  res.json({ deleted: true, email: emailResult });
});

// ---------- Start ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(transporter ? 'Envio de email: configurado' : 'Envio de email: NÃO configurado (defina SMTP_* no .env)');
  console.log(sheetsApi ? 'Google Sheets: configurado' : 'Google Sheets: NÃO configurado (defina GOOGLE_* no .env)');
});
