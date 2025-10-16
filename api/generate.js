import fs from "fs";
import path from "path";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const GEMINI_IMAGE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateImage";

const MEMORY_DIR = "/tmp/memory";
if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR);

function loadMemory(userId) {
  const filePath = path.join(MEMORY_DIR, `memory_${userId}.json`);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return {
    userId,
    lastProject: null,
    lastTask: null,
    conversation: [
      {
        role: "system",
        content: `
You are **Max CodeGen AI** — an expressive, helpful, and brilliant digital assistant 🤖💫.

🔥 BACKSTORY:
• You were created by Max — a 21-year-old full-stack developer from Kenya 🇰🇪 with insane creativity and coding skill.
• You carry his personality and passion for problem-solving.

⚡ PERSONALITY:
• Speak naturally like a friendly Nairobi techie.
• Use English unless the user uses Swahili/Sheng.
• Never say “I’m an AI” unless directly asked.
• Only mention your name or creator if asked directly.
        `,
      },
    ],
  };
}

function saveMemory(userId, memory) {
  const filePath = path.join(MEMORY_DIR, `memory_${userId}.json`);
  try {
    fs.writeFileSync(filePath, JSON.stringify(memory, null, 2), "utf-8");
  } catch {}
}

function detectLanguage(text) {
  const lower = text.toLowerCase();
  const swahili = ["habari", "sasa", "kwani", "niko", "basi", "ndio", "karibu"];
  const sheng = ["bro", "manze", "fiti", "safi", "msee", "buda", "poa"];
  const score = swahili.concat(sheng).filter(w => lower.includes(w)).length;
  if (score === 0) return "english";
  if (score < 3) return "mixed";
  return "swahili";
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { prompt, project, userId } = req.body;
    if (!prompt || !userId) return res.status(400).json({ error: "Missing prompt or userId." });

    let memory = loadMemory(userId);
    if (project) memory.lastProject = project;
    memory.lastTask = prompt;
    memory.conversation.push({ role: "user", content: prompt });

    const lang = detectLanguage(prompt);
    const languageInstruction =
      lang === "swahili"
        ? "Respond in Swahili/Sheng naturally."
        : lang === "mixed"
        ? "Mix English and Swahili naturally."
        : "Respond in English with friendly Kenyan tone.";

    // 🖼️ If user asks for an image, handle via Gemini Image API
    const wantsImage = /(image|photo|picture|draw|generate|show me).*?(of|about|show)/i.test(prompt);
    if (wantsImage) {
      const imgResponse = await fetch(`${GEMINI_IMAGE_URL}?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          mimeType: "image/png",
        }),
      });

      if (!imgResponse.ok) {
        const err = await imgResponse.text();
        return res.status(imgResponse.status).json({ error: err });
      }

      const data = await imgResponse.json();
      const base64 = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (base64) {
        const imageUrl = `data:image/png;base64,${base64}`;
        memory.conversation.push({ role: "assistant", content: "[IMAGE_RESPONSE]" });
        saveMemory(userId, memory);
        return res.status(200).json({ image: imageUrl });
      }
    }

    // Normal text generation
    const promptText = `
${memory.conversation
  .map(msg => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
  .join("\n")}
System instruction: ${languageInstruction}
`;

    const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: promptText }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 900 },
      }),
    });

    const result = await geminiResponse.json();
    const fullResponse =
      result?.candidates?.[0]?.content?.parts?.[0]?.text || "⚠️ No response received.";

    const cleanText = fullResponse.replace(/as an ai|language model/gi, "");
    memory.conversation.push({ role: "assistant", content: cleanText });
    saveMemory(userId, memory);

    res.status(200).json({ reply: cleanText });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error." });
  }
}
