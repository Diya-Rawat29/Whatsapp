const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  botActive: { type: Boolean, default: true },
  aiSystemPrompt: { 
    type: String, 
    default: "You are a helpful, concise, and professional WhatsApp assistant. If someone asks for information you don't have, politely mention it."
  },
  simulateTyping: { type: Boolean, default: true },
  ignoredNumbers: { type: [String], default: [] },
  sleepModeEnabled: { type: Boolean, default: false },
  businessHoursStart: { type: String, default: "09:00" },
  businessHoursEnd: { type: String, default: "17:00" }
});

module.exports = mongoose.model('Settings', settingsSchema);
