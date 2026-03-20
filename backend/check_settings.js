require('dotenv').config();
const mongoose = require('mongoose');
const Settings = require('./models/Settings');

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    const settings = await Settings.findOne();
    console.log('SETTINGS:', JSON.stringify(settings, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}
check();
