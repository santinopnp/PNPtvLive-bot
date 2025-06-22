require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cron = require('node-cron');
const fs = require('fs').promises;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const WEBEX_ACCESS_TOKEN = process.env.WEBEX_ACCESS_TOKEN || 'TU_ACCESS_TOKEN_AQUI';
const WEBEX_API_BASE = 'https://webexapis.com/v1';

const getHeaders = () => ({
  'Authorization': `Bearer ${WEBEX_ACCESS_TOKEN}`,
  'Content-Type': 'application/json'
});

let botConfig = {
  messages: [],
  meetings: new Map(),
  autoAdmitEnabled: false,
  botPersonId: null
};

const CONFIG_FILE = 'bot_config.json';

async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    const savedConfig = JSON.parse(data);
    botConfig.messages = savedConfig.messages || [];
    botConfig.autoAdmitEnabled = savedConfig.autoAdmitEnabled || false;
    console.log('✅ Configuración cargada exitosamente');
  } catch {
    console.log('ℹ️ No se encontró configuración previa, usando valores por defecto');
  }
}

async function saveConfig() {
  try {
    await fs.writeFile(CONFIG_FILE, JSON.stringify({
      messages: botConfig.messages,
      autoAdmitEnabled: botConfig.autoAdmitEnabled
    }, null, 2));
    console.log('✅ Configuración guardada exitosamente');
  } catch (error) {
    console.error('❌ Error guardando configuración:', error);
  }
}

async function getBotInfo() {
  try {
    const response = await axios.get(`${WEBEX_API_BASE}/people/me`, {
      headers: getHeaders()
    });
    botConfig.botPersonId = response.data.id;
    console.log('🤖 Bot inicializado:', response.data.displayName);
  } catch (error) {
    console.error('❌ Error obteniendo información del bot:', error.response?.data || error.message);
    throw error;
  }
}

function getMeeting(meetingId) {
  if (!botConfig.meetings.has(meetingId)) {
    botConfig.meetings.set(meetingId, {
      participants: new Map(),
      warningsSent: new Map(),
      lobbyParticipants: new Map(),
      isActive: true
    });
  }
  return botConfig.meetings.get(meetingId);
}

async function getLobbyParticipants(meetingId) {
  try {
    const response = await axios.get(`${WEBEX_API_BASE}/meetings/${meetingId}/participants`, {
      headers: getHeaders(),
      params: { hostEmail: 'all', max: 100 }
    });
    return response.data.items.filter(p => p.state === 'lobby' || p.state === 'waiting');
  } catch (error) {
    console.error('❌ Error obteniendo participantes en lobby:', error.response?.data || error.message);
    return [];
  }
}

async function admitParticipant(meetingId, participantId) {
  try {
    await axios.patch(`${WEBEX_API_BASE}/meetings/${meetingId}/participants/${participantId}`, {
      admit: true
    }, { headers: getHeaders() });
    console.log('✅ Participante admitido:', participantId);
  } catch (error) {
    console.error('❌ Error admitiendo participante:', error.response?.data || error.message);
    throw error;
  }
}

async function admitAllFromLobby(meetingId) {
  const lobbyParticipants = await getLobbyParticipants(meetingId);
  let admitted = 0;
  for (const participant of lobbyParticipants) {
    try {
      await admitParticipant(meetingId, participant.id);
      admitted++;
      await new Promise(r => setTimeout(r, 500));
    } catch {
      // ignore
    }
  }
  console.log(`🎉 Total admitidos: ${admitted}/${lobbyParticipants.length}`);
  return { admitted, total: lobbyParticipants.length };
}

async function autoAdmitFromLobby(meetingId) {
  if (!botConfig.autoAdmitEnabled) return;
  const meeting = getMeeting(meetingId);
  const lobbyParticipants = await getLobbyParticipants(meetingId);
  for (const participant of lobbyParticipants) {
    const lastProcessed = meeting.lobbyParticipants.get(participant.id);
    const now = Date.now();
    if (lastProcessed && now - lastProcessed < 30000) continue;
    try {
      await admitParticipant(meetingId, participant.id);
      meeting.lobbyParticipants.set(participant.id, now);
    } catch {
      // ignore errors
    }
  }
}

async function getMeetingParticipants(roomId) {
  try {
    const response = await axios.get(`${WEBEX_API_BASE}/memberships`, {
      headers: getHeaders(),
      params: { roomId, max: 100 }
    });
    return response.data.items;
  } catch (error) {
    console.error('❌ Error obteniendo participantes:', error.response?.data || error.message);
    return [];
  }
}

async function sendMessage(roomId, text, toPersonId = null) {
  try {
    const payload = { text };
    if (toPersonId) payload.toPersonId = toPersonId; else payload.roomId = roomId;
    await axios.post(`${WEBEX_API_BASE}/messages`, payload, { headers: getHeaders() });
  } catch (error) {
    console.error('❌ Error enviando mensaje:', error.response?.data || error.message);
    throw error;
  }
}

async function checkCameraStatus(roomId) {
  const participants = await getMeetingParticipants(roomId);
  const meeting = getMeeting(roomId);
  for (const participant of participants) {
    if (participant.personId === botConfig.botPersonId) continue;
    const hasCameraOff = Math.random() < 0.3;
    if (hasCameraOff) {
      await sendCameraWarning(participant);
      meeting.warningsSent.set(participant.personId, Date.now());
      setTimeout(() => checkAndRemoveParticipant(roomId, participant), 120000);
    }
  }
}

async function sendCameraWarning(participant) {
  const message = `Hola ${participant.personDisplayName}, por favor enciende tu cámara para continuar en la reunión. Tienes 2 minutos para hacerlo.`;
  await sendMessage(null, message, participant.personId);
}

async function checkAndRemoveParticipant(roomId, participant) {
  await sendMessage(null, 'Has sido removido de la reunión por no encender la cámara cuando se solicitó.', participant.personId);
  const meeting = getMeeting(roomId);
  meeting.warningsSent.delete(participant.personId);
}

async function sendScheduledMessage(roomId) {
  if (!roomId || botConfig.messages.length === 0) return;
  const activeMessages = botConfig.messages.filter(m => m.enabled);
  if (activeMessages.length === 0) return;
  const randomMessage = activeMessages[Math.floor(Math.random() * activeMessages.length)];
  await sendMessage(roomId, randomMessage.text);
}

function scheduleMessages() {
  cron.schedule('*/30 * * * *', () => {
    for (const id of botConfig.meetings.keys()) {
      sendScheduledMessage(id);
    }
  });
}

function scheduleLobbyChecks() {
  cron.schedule('*/30 * * * * *', () => {
    for (const id of botConfig.meetings.keys()) {
      autoAdmitFromLobby(id);
    }
  });
}

function scheduleCameraChecks() {
  cron.schedule('*/5 * * * *', () => {
    for (const id of botConfig.meetings.keys()) {
      checkCameraStatus(id);
    }
  });
}

app.post('/webhooks/webex', async (req, res) => {
  const event = req.body;
  console.log('📨 Webhook recibido:', event.resource, event.event);
  switch (event.resource) {
    case 'meetings':
      if (event.event === 'started') {
        getMeeting(event.data.id);
        console.log('🎥 Reunión iniciada:', event.data.id);
      } else if (event.event === 'ended') {
        botConfig.meetings.delete(event.data.id);
        console.log('🛑 Reunión terminada:', event.data.id);
      }
      break;
    case 'membership':
      if (event.event === 'created') {
        setTimeout(() => {
          checkCameraStatus(event.data.roomId);
        }, 30000);
      }
      break;
  }
  res.status(200).send('OK');
});

app.get('/api/config', (req, res) => {
  res.json({
    messages: botConfig.messages,
    meetings: Array.from(botConfig.meetings.keys()),
    autoAdmitEnabled: botConfig.autoAdmitEnabled
  });
});

app.post('/api/set-meeting', async (req, res) => {
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ error: 'Room ID requerido' });
  getMeeting(roomId);
  botConfig.currentMeeting = roomId;
  res.json({ success: true, meetingId: roomId });
});

app.post('/api/messages', async (req, res) => {
  const { text, enabled = true } = req.body;
  if (!text || text.trim() === '') return res.status(400).json({ error: 'Mensaje vacío' });
  const newMessage = { id: Date.now().toString(), text: text.trim(), enabled, createdAt: new Date().toISOString() };
  botConfig.messages.push(newMessage);
  await saveConfig();
  res.json(newMessage);
});

app.put('/api/messages/:id', async (req, res) => {
  const { id } = req.params;
  const { text, enabled } = req.body;
  const idx = botConfig.messages.findIndex(m => m.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Mensaje no encontrado' });
  botConfig.messages[idx] = { ...botConfig.messages[idx], text: text || botConfig.messages[idx].text, enabled: enabled !== undefined ? enabled : botConfig.messages[idx].enabled };
  await saveConfig();
  res.json(botConfig.messages[idx]);
});

app.delete('/api/messages/:id', async (req, res) => {
  const { id } = req.params;
  const idx = botConfig.messages.findIndex(m => m.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Mensaje no encontrado' });
  botConfig.messages.splice(idx, 1);
  await saveConfig();
  res.json({ success: true });
});

app.post('/api/controls/toggle-auto-admit', async (req, res) => {
  botConfig.autoAdmitEnabled = !botConfig.autoAdmitEnabled;
  await saveConfig();
  res.json({ success: true, autoAdmitEnabled: botConfig.autoAdmitEnabled });
});

app.post('/api/controls/admit-all-lobby', async (req, res) => {
  const meetingId = req.body.meetingId || botConfig.currentMeeting;
  if (!meetingId) return res.status(400).json({ error: 'No hay reunión activa' });
  const result = await admitAllFromLobby(meetingId);
  res.json({ success: true, ...result });
});

app.get('/api/lobby/participants', async (req, res) => {
  const meetingId = req.query.meetingId || botConfig.currentMeeting;
  if (!meetingId) return res.status(400).json({ error: 'No hay reunión activa' });
  const participants = await getLobbyParticipants(meetingId);
  res.json({ participants });
});

app.post('/api/controls/check-cameras', async (req, res) => {
  const meetingId = req.body.meetingId || botConfig.currentMeeting;
  if (!meetingId) return res.status(400).json({ error: 'No hay reunión activa' });
  await checkCameraStatus(meetingId);
  res.json({ success: true });
});

app.post('/api/controls/test-message', async (req, res) => {
  const meetingId = req.body.meetingId || botConfig.currentMeeting;
  if (!meetingId) return res.status(400).json({ error: 'No hay reunión activa' });
  const { message } = req.body;
  await sendMessage(meetingId, message || 'Mensaje de prueba del bot');
  res.json({ success: true });
});

app.get('/api/rooms', async (req, res) => {
  try {
    const response = await axios.get(`${WEBEX_API_BASE}/rooms`, { headers: getHeaders(), params: { max: 100 } });
    res.json(response.data.items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function initializeApp() {
  try {
    await loadConfig();
    await getBotInfo();
    scheduleMessages();
    scheduleCameraChecks();
    scheduleLobbyChecks();
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🚀 Multi-meeting bot en puerto ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Error inicializando aplicación:', error);
    process.exit(1);
  }
}

initializeApp();
