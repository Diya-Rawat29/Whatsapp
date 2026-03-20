require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  try {
    const models = await genAI.listModels();
    for (const m of models.models) {
      console.log(m.name);
    }
  } catch (err) {
    console.error("ERROR:", err.message);
  }
}
listModels();
