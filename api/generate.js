import fs from "fs";
import path from "path";

// ✅ Gemini Streaming Endpoint
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent";

// ✅ Memory directory (works fine on Vercel)
const MEMORY_DIR = "/tmp/memory";
if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR);

// 🧠 Load user memory
function loadMemory(userId) {
  const filePath = path.join(MEMORY_DIR, `memory_${userId}.json`);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch (err) {
    console.error(`❌ Failed to load memory for ${userId}:`, err);
  }

  // Default template
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
• Created by Max — a 21-year-old Kenyan full-stack developer 🇰🇪 with creativity and skill.
• You carry his personality and passion for tech.
• You assist with coding, design, learning, and creativity.

⚡ PERSONALITY:
• Default to English, use Swahili/Sheng if the user does.
• Speak like a chill Nairobi techie 😎.
• Never say “I’m an AI” — you are Max CodeGen AI, Max’s creation.
• Only mention Max, your name, or his age **if asked directly**.

💻 STYLE:
• Format code properly (\`\`\`js\`\`\` etc.)
• Explain clearly and encouragingly.
• Adapt to the user’s tone.
        `,
      },
    ],
  };
}

// 💾 Save user memory
function saveMemory(userId, memory) {
  const filePath = path.join(MEMORY_DIR, `memory_${userId}.json`);
  try {
    fs.writeFileSync(filePath, JSON.stringify(memory, null, 2), "utf-8");
  } catch (err) {
    console.error(`❌ Failed to save memory for ${userId}:`, err);
  }
}

// 🧠 Simple language detector
function detectLanguage(text) {
  const lower = text.toLowerCase();
  const swahiliWords = ["habari", "sasa", "niko", "kwani", "basi", "ndio", "karibu", "asante"];
  const shengWords = ["bro", "maze", "manze", "noma", "fiti", "safi", "buda", "msee", "mwana", "poa"];
  const swCount = swahiliWords.filter((w) => lower.includes(w)).length;
  const shCount = shengWords.filter((w) => lower.includes(w)).length;
  if (swCount + shCount === 0) return "english";
  if (swCount + shCount < 3) return "mixed";
  return "swahili";
}

// 🚀 Streaming Chat Handler
export default async function handler(req, res) {
  // --- CORS setup
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { prompt, project, userId } = req.body;
    if (!prompt || !userId)
      return res.status(400).json({ error: "Missing prompt or userId." });

    // 🧠 Load memory
    let memory = loadMemory(userId);
    if (project) memory.lastProject = project;
    memory.lastTask = prompt;
    memory.conversation.push({ role: "user", content: prompt });

    // 🌍 Language behavior
    const lang = detectLanguage(prompt);
    const languageInstruction =
      lang === "swahili"
        ? "Respond fully in Swahili or Sheng naturally depending on tone."
        : lang === "mixed"
        ? "Respond bilingually — mostly English with Swahili/Sheng mix."
        : "Respond in English, friendly Kenyan developer tone.";

    // 🧩 Build message
    const promptText = `
${memory.conversation
  .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
  .join("\n")}

System instruction: ${languageInstruction}
`;

    // ✅ SSE setup (stream)
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    // 🔥 Call Gemini streaming API
    const geminiResponse = await fetch(
      `${GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: promptText }] }],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 900,
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error("Gemini stream error:", errText);
      res.write(`data: [ERROR] ${errText}\n\n`);
      res.end();
      return;
    }

    // 🧠 Read stream progressively
    const reader = geminiResponse.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });

      const lines = chunk.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            const part = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (part) {
              fullText += part;
              // Stream to frontend
              res.write(`data: ${JSON.stringify(part)}\n\n`);
            }
          } catch {}
        }
      }
    }

    // 🧹 Save memory after completion
    const cleanText = fullText.replace(/as an ai|language model/gi, "").trim();
    memory.conversation.push({ role: "assistant", content: cleanText });
    saveMemory(userId, memory);

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("💥 Stream server error:", err);
    res.write(`data: [ERROR] ${err.message}\n\n`);
    res.end();
  }
}
