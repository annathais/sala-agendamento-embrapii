require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
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

  // manageToken só é devolvido aqui, na resposta de criação, para quem fez a reserva
  res.status(201).json({
    reservation: toPublic(reservation),
    manageToken: reservation.manageToken,
    email: emailResult
  });
});

// Cancela uma reserva: DELETE /api/reservations/:id
// Exige o "manageToken" — a chave secreta que só quem criou a reserva recebeu.
app.delete('/api/reservations/:id', (req, res) => {
  const { id } = req.params;
  const providedToken = req.get('x-manage-token') || (req.body && req.body.manageToken);

  const item = db.get('reservations').find({ id }).value();
  if (!item) return res.status(404).json({ error: 'Reserva não encontrada.' });

  if (!providedToken || providedToken !== item.manageToken) {
    return res.status(403).json({ error: 'Você não tem permissão para cancelar esta reserva. Apenas quem a criou pode cancelá-la.' });
  }

  db.get('reservations').remove({ id }).write();
  res.json({ deleted: true });
});

// ---------- Start ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(transporter ? 'Envio de email: configurado' : 'Envio de email: NÃO configurado (defina SMTP_* no .env)');
});
