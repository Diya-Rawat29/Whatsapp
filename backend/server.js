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
const Settings = require('./models/Settings'); // 🆕 New Settings Model

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }
});

app.use(cors());
app.use(express.json());

// ─── MongoDB Connection ───────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅ MongoDB Atlas connected');
    // Ensure default settings exist
    const settings = await Settings.findOne();
    if (!settings) {
      await Settings.create({});
      console.log('⚙️ Default settings initialized');
    }
  })
  .catch(err => console.error('❌ MongoDB error:', err));

// ─── Gemini AI Setup ──────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─── WhatsApp Client Setup ────────────────────────────────────────────────────
const whatsappClient = new Client({
  authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--disable-gpu'
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
  } catch (err) { console.error('QR Error:', err); }
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

// ─── Message Handler ───────────────────────────────────────────────────────────
whatsappClient.on('message', async (msg) => {
  // Ignore group messages and statuses
  if (msg.isGroupMsg || msg.from === 'status@broadcast') return;

  try {
    const settings = await Settings.findOne();
    if (!settings?.botActive) {
      console.log('💤 Bot is paused globally, ignoring message.');
      return;
    }

    // Check if sender is in ignore list
    const senderNumber = msg.from.split('@')[0];
    if (settings.ignoredNumbers.includes(senderNumber)) {
      console.log(`🚫 Ignored message from blacklisted number: ${senderNumber}`);
      return;
    }

    // Sleep mode check
    if (settings.sleepModeEnabled && settings.businessHoursStart && settings.businessHoursEnd) {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMin = now.getMinutes();
      const [startHour, startMin] = settings.businessHoursStart.split(':').map(Number);
      const [endHour, endMin] = settings.businessHoursEnd.split(':').map(Number);

      const currentTimeInMins = currentHour * 60 + currentMin;
      const startTimeInMins = startHour * 60 + startMin;
      const endTimeInMins = endHour * 60 + endMin;

      let isOutsideBusinessHours = false;
      if (startTimeInMins <= endTimeInMins) {
        if (currentTimeInMins < startTimeInMins || currentTimeInMins >= endTimeInMins) {
          isOutsideBusinessHours = true;
        }
      } else {
        // Crosses midnight, e.g. 21:00 to 09:00
        if (currentTimeInMins >= endTimeInMins && currentTimeInMins < startTimeInMins) {
          isOutsideBusinessHours = true;
        }
      }

      if (isOutsideBusinessHours) {
        console.log('🌙 Sleep mode active, outside business hours. Ignoring message.');
        return;
      }
    }

    let incomingText = (msg.body || '').toLowerCase().trim();
    const contact = await msg.getContact();
    const contactName = contact.pushname || contact.number || senderNumber;

    console.log(`📨 Received from ${contactName}: ${msg.body}`);
    const chat = await msg.getChat();

    let replyText = '';
    let replyType = 'none';

    let base64Media = null;
    let mimeType = null;
    if (msg.hasMedia) {
      try {
        const media = await msg.downloadMedia();
        if (media && media.mimetype.startsWith('image/')) {
          base64Media = media.data;
          mimeType = media.mimetype;
        }
      } catch (err) {
        console.error('Failed to download media for vision api:', err);
      }
    }

    // 1️⃣ Check MongoDB for keyword rules
    const rules = await Rule.find({ isActive: true });
    let matchedRule = null;
    for (const rule of rules) {
      if (!incomingText) continue;
      if (rule.matchType === 'exact' && incomingText === rule.keyword.toLowerCase()) {
        matchedRule = rule; break;
      } else if (rule.matchType === 'contains' && incomingText.includes(rule.keyword.toLowerCase())) {
        matchedRule = rule; break;
      }
    }

    if (matchedRule) {
      replyText = matchedRule.reply;
      replyType = 'keyword';
      await Rule.findByIdAndUpdate(matchedRule._id, { $inc: { hitCount: 1 } });
      console.log(`📌 Keyword match: "${matchedRule.keyword}" -> "${replyText}"`);
    } else {
      // 2️⃣ Use Gemini AI for smart reply
      console.log('🤖 Sending to Gemini AI...');
      
      // typing simulator logic
      if (settings.simulateTyping) {
        await chat.sendStateTyping();
        // Wait 2-3 seconds to fake human typing
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 1500));
      }

      const geminiModel = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
      const promptText = msg.body ? msg.body : (base64Media ? "Describe or respond to this image." : "");
      const prompt = `System Instruction: ${settings.aiSystemPrompt}\n\nUser Message: "${promptText}"\n\nProvide the direct response text naturally.`;
      
      let result;
      if (base64Media) {
        const imageParts = [{ inlineData: { data: base64Media, mimeType: mimeType } }];
        result = await geminiModel.generateContent([prompt, ...imageParts]);
      } else {
        result = await geminiModel.generateContent(prompt);
      }
      
      let rawAnswer = result.response.text().trim();
      
      // Convert standard Markdown to WhatsApp Markdown
      replyText = rawAnswer
        .replace(/\*\*(.*?)\*\*/g, '*$1*')
        .replace(/\n\s*\*\s/g, '\n- ') // Replace unordered bullet list * with -
        .replace(/### (.*?)\n/g, '*$1*\n')
        .replace(/## (.*?)\n/g, '*$1*\n')
        .replace(/# (.*?)\n/g, '*$1*\n');

      replyType = 'ai';
      console.log(`🤖 Gemini reply: ${replyText}`);
    }

    // Send the reply
    if (replyText) {
      // simulate typing for keyword matches too
      if (replyType === 'keyword' && settings.simulateTyping) {
        await chat.sendStateTyping();
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 500));
      }
      
      await msg.reply(replyText);
      console.log(`✅ Replied: ${replyText}`);
    }

    // Clear typing state
    await chat.clearState();

    // Save to MongoDB
    const savedMessage = await Message.create({
      from: msg.from, body: msg.body, reply: replyText, replyType, contact: contactName
    });

    // Emit to dashboard
    io.emit('new_message', {
      id: savedMessage._id, from: msg.from, contact: contactName,
      body: msg.body, reply: replyText, replyType, timestamp: savedMessage.timestamp
    });

  } catch (err) {
    console.error('❌ Message handling error:', err.message);
  }
});

// Initialize WhatsApp client
whatsappClient.initialize();

// ─── Socket.IO ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  socket.emit('status', {
    status: whatsappStatus,
    message: whatsappStatus === 'connected' ? 'WhatsApp Connected!' : 
             whatsappStatus === 'qr' ? 'Scan QR Code' : 'Disconnected'
  });
  if (whatsappStatus === 'qr' && currentQR) socket.emit('qr', currentQR);
});

// ─── REST API Routes ──────────────────────────────────────────────────────────

// Status & Stats (Existing)
app.get('/api/status', (req, res) => res.json({ status: whatsappStatus, qr: currentQR }));

app.get('/api/stats', async (req, res) => {
  try {
    const totalMessages = await Message.countDocuments();
    const aiReplies = await Message.countDocuments({ replyType: 'ai' });
    const keywordReplies = await Message.countDocuments({ replyType: 'keyword' });
    const totalRules = await Rule.countDocuments();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayMessages = await Message.countDocuments({ timestamp: { $gte: today } });
    res.json({ totalMessages, aiReplies, keywordReplies, totalRules, todayMessages });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Messages and Rules (Existing)
app.get('/api/messages', async (req, res) => {
  try { res.json(await Message.find().sort({ timestamp: -1 }).limit(100)); } 
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/messages', async (req, res) => {
  try { await Message.deleteMany({}); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/rules', async (req, res) => {
  try { res.json(await Rule.find().sort({ createdAt: -1 })); } 
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/rules', async (req, res) => {
  try {
    const { keyword, reply, matchType } = req.body;
    res.json(await Rule.create({ keyword, reply, matchType: matchType || 'contains' }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/rules/:id', async (req, res) => {
  try { res.json(await Rule.findByIdAndUpdate(req.params.id, req.body, { new: true })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/rules/:id', async (req, res) => {
  try { await Rule.findByIdAndDelete(req.params.id); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Send manual
app.post('/api/send', async (req, res) => {
  try {
    if (whatsappStatus !== 'connected') return res.status(400).json({ error: 'WhatsApp not connected' });
    const chatId = req.body.to.includes('@c.us') ? req.body.to : `${req.body.to}@c.us`;
    await whatsappClient.sendMessage(chatId, req.body.message);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 🆕 Settings Routes
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await Settings.findOne() || await Settings.create({});
    res.json(settings);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/settings', async (req, res) => {
  try {
    const settings = await Settings.findOneAndUpdate({}, req.body, { new: true, upsert: true });
    res.json(settings);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📱 WhatsApp client initializing...`);
});
