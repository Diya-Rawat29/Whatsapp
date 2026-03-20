require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function test() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
    const result = await model.generateContent("Test");
    console.log("RESPONSE:", result.response.text());
  } catch (err) {
    console.error("ERROR:", err.message);
  }
}
test();
