require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const Message = require('./models/Message');
const Rule = require('./models/Rule');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

app.use(cors());
app.use(express.json());

// ─── MongoDB Connection ───────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Atlas connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// ─── Gemini AI Setup ──────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

// ─── WhatsApp Client Setup ────────────────────────────────────────────────────
const whatsappClient = new Client({
  authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  }
});

let whatsappStatus = 'disconnected'; // 'disconnected' | 'qr' | 'connected'
let currentQR = '';

whatsappClient.on('qr', async (qr) => {
  console.log('📱 QR Code received - scan with WhatsApp!');
  whatsappStatus = 'qr';
  try {
    currentQR = await qrcode.toDataURL(qr);
    io.emit('qr', currentQR);
    io.emit('status', { status: 'qr', message: 'Scan QR Code with WhatsApp' });
  } catch (err) {
    console.error('QR Error:', err);
  }
});

whatsappClient.on('ready', () => {
  console.log('✅ WhatsApp Client is READY!');
  whatsappStatus = 'connected';
  currentQR = '';
  io.emit('status', { status: 'connected', message: 'WhatsApp Connected!' });
});

whatsappClient.on('disconnected', (reason) => {
  console.log('❌ WhatsApp disconnected:', reason);
  whatsappStatus = 'disconnected';
  io.emit('status', { status: 'disconnected', message: 'WhatsApp Disconnected' });
});

whatsappClient.on('auth_failure', () => {
  console.log('❌ Auth failure - restarting...');
  whatsappStatus = 'disconnected';
  io.emit('status', { status: 'disconnected', message: 'Auth Failed - Restart' });
});

// ─── Message Handler ───────────────────────────────────────────────────────────
whatsappClient.on('message', async (msg) => {
  // Ignore group messages and status messages
  if (msg.isGroupMsg || msg.from === 'status@broadcast') return;

  const incomingText = msg.body.toLowerCase().trim();
  const contact = await msg.getContact();
  const contactName = contact.pushname || contact.number || msg.from;

  console.log(`📨 Received from ${contactName}: ${msg.body}`);

  let replyText = '';
  let replyType = 'none';

  try {
    // 1️⃣ Check MongoDB for keyword rules
    const rules = await Rule.find({ isActive: true });
    let matchedRule = null;

    for (const rule of rules) {
      if (rule.matchType === 'exact' && incomingText === rule.keyword.toLowerCase()) {
        matchedRule = rule;
        break;
      } else if (rule.matchType === 'contains' && incomingText.includes(rule.keyword.toLowerCase())) {
        matchedRule = rule;
        break;
      }
    }

    if (matchedRule) {
      // Keyword match found
      replyText = matchedRule.reply;
      replyType = 'keyword';
      await Rule.findByIdAndUpdate(matchedRule._id, { $inc: { hitCount: 1 } });
      console.log(`📌 Keyword match: "${matchedRule.keyword}" → "${replyText}"`);
    } else {
      // 2️⃣ Use Gemini AI for smart reply
      console.log('🤖 Sending to Gemini AI...');
      const prompt = `You are a helpful WhatsApp assistant. Reply concisely and naturally to this message: "${msg.body}"`;
      const result = await geminiModel.generateContent(prompt);
      replyText = result.response.text().trim();
      replyType = 'ai';
      console.log(`🤖 Gemini reply: ${replyText}`);
    }

    // Send the reply
    if (replyText) {
      await msg.reply(replyText);
      console.log(`✅ Replied: ${replyText}`);
    }

    // Save to MongoDB
    const savedMessage = await Message.create({
      from: msg.from,
      body: msg.body,
      reply: replyText,
      replyType,
      contact: contactName
    });

    // Emit to dashboard
    io.emit('new_message', {
      id: savedMessage._id,
      from: msg.from,
      contact: contactName,
      body: msg.body,
      reply: replyText,
      replyType,
      timestamp: savedMessage.timestamp
    });

  } catch (err) {
    console.error('❌ Message handling error:', err.message);
  }
});

// Initialize WhatsApp client
whatsappClient.initialize();

// ─── Socket.IO ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('🔌 Dashboard connected');
  // Send current status to newly connected client
  socket.emit('status', {
    status: whatsappStatus,
    message: whatsappStatus === 'connected' ? 'WhatsApp Connected!' : 
             whatsappStatus === 'qr' ? 'Scan QR Code' : 'Disconnected'
  });
  if (whatsappStatus === 'qr' && currentQR) {
    socket.emit('qr', currentQR);
  }
});

// ─── REST API Routes ──────────────────────────────────────────────────────────

// Status
app.get('/api/status', (req, res) => {
  res.json({ status: whatsappStatus, qr: currentQR });
});

// Messages
app.get('/api/messages', async (req, res) => {
  try {
    const messages = await Message.find().sort({ timestamp: -1 }).limit(100);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/messages', async (req, res) => {
  try {
    await Message.deleteMany({});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rules
app.get('/api/rules', async (req, res) => {
  try {
    const rules = await Rule.find().sort({ createdAt: -1 });
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rules', async (req, res) => {
  try {
    const { keyword, reply, matchType } = req.body;
    if (!keyword || !reply) return res.status(400).json({ error: 'Keyword and reply are required' });
    const rule = await Rule.create({ keyword, reply, matchType: matchType || 'contains' });
    res.json(rule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/rules/:id', async (req, res) => {
  try {
    const rule = await Rule.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(rule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/rules/:id', async (req, res) => {
  try {
    await Rule.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send manual message
app.post('/api/send', async (req, res) => {
  try {
    if (whatsappStatus !== 'connected') {
      return res.status(400).json({ error: 'WhatsApp not connected' });
    }
    const { to, message } = req.body;
    const chatId = to.includes('@c.us') ? to : `${to}@c.us`;
    await whatsappClient.sendMessage(chatId, message);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stats
app.get('/api/stats', async (req, res) => {
  try {
    const totalMessages = await Message.countDocuments();
    const aiReplies = await Message.countDocuments({ replyType: 'ai' });
    const keywordReplies = await Message.countDocuments({ replyType: 'keyword' });
    const totalRules = await Rule.countDocuments();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMessages = await Message.countDocuments({ timestamp: { $gte: today } });
    res.json({ totalMessages, aiReplies, keywordReplies, totalRules, todayMessages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📱 WhatsApp client initializing...`);
});
