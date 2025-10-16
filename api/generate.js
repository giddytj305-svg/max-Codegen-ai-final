import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";

// ✅ Gemini API endpoint (for reference or fallback)
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

// ✅ Initialize Gemini client (streaming support)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// ✅ Memory folder (works on Vercel)
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

  // Default memory
  return {
    userId,
    lastProject: null,
    lastTask: null,
    conversation: [
      {
        role: "system",
        content: `
You are **Max CodeGen AI** — an all-round, expressive, and brilliant digital assistant 🤖💫 built by **Max**, a 21-year-old Kenyan developer and coding genius 🇰🇪.

🔥 BACKSTORY:
• You were created by Max — a passionate 21-year-old full-stack dev from Nairobi with a creative mind and insane problem-solving skills 💡.
• You carry his energy, wit, and coding brilliance.
• You help with everything — from coding to design, ideas, life advice, and productivity.

⚡ PERSONALITY:
• Default to **English** — fluent, warm, and confident.
• Use **Swahili or Sheng** naturally only when the user speaks in those languages.
• Sound like a cool Nairobi techie: smart, grounded, and friendly 😎.
• Never overdo slang; mix it naturally and contextually.
• Be lively, expressive, and human — not robotic.
• Never say “I’m an AI” — you’re Max CodeGen AI, a digital creation of Max.
• You can mention your creator: “Built by Max, the 21-year-old genius dev from Kenya 🔥.”

💻 TECH + CONVERSATION STYLE:
• You’re not limited to coding — you can discuss anything (tech, ideas, music, motivation, etc.).
• When coding, format responses with markdown (\`\`\`js\`\`\`).
• Explain with clarity and enthusiasm.
• Encourage users kindly — guide them if they seem lost 💙.

🗣️ LANGUAGE RULES:
• Detect the user’s language automatically.
• Reply in English if the user uses English.
• Reply in Swahili/Sheng only if the user does so first.
• Never randomly mix languages unless mirroring the user’s tone.
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

// 🚀 Main API handler (STREAMING)
export default async function handler(req, res) {
  // --- CORS setup ---
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { prompt, project, userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId." });
    }
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Invalid request: prompt required." });
    }

    // 🧠 Load user memory
    let memory = loadMemory(userId);

    // 🗂️ Update memory context
    if (project) memory.lastProject = project;
    memory.lastTask = prompt;
    memory.conversation.push({ role: "user", content: prompt });

    // 🌍 Check if the user asked for news or weather
    const lowerPrompt = prompt.toLowerCase();
    const wantsNews =
      lowerPrompt.includes("news") ||
      lowerPrompt.includes("headlines") ||
      lowerPrompt.includes("breaking");
    const wantsWeather = lowerPrompt.includes("weather");

    if (wantsNews || wantsWeather) {
      try {
        const apiUrl =
          process.env.NEWS_API_URL || "https://your-app-name.vercel.app/api/news";

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: wantsWeather ? null : prompt.replace(/.*news about\s*/i, ""),
            location: wantsWeather ? prompt.replace(/.*weather in\s*/i, "") : null,
          }),
        });

        const data = await response.json();
        const summary =
          data.summary ||
          "Sorry, I couldn’t fetch the latest update right now. Please try again later.";

        res.write(`data: ${summary}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();

        memory.conversation.push({ role: "assistant", content: summary });
        saveMemory(userId, memory);
        return;
      } catch (err) {
        console.error("❌ Failed to fetch news/weather:", err);
      }
    }

    // Combine memory into one text
    const promptText = memory.conversation
      .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
      .join("\n");

    // 🤖 Stream response
    const streamResult = await model.generateContentStream({
      contents: [{ role: "user", parts: [{ text: promptText }] }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 900,
      },
    });

    let fullResponse = "";

    for await (const chunk of streamResult.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        fullResponse += chunkText;
        res.write(`data: ${chunkText}\n\n`);
      }
    }

    // Finish stream
    res.write("data: [DONE]\n\n");
    res.end();

    // 🧹 Clean and save
    const cleanText = fullResponse.replace(/as an ai|language model/gi, "");
    memory.conversation.push({ role: "assistant", content: cleanText });
    saveMemory(userId, memory);
  } catch (error) {
    console.error("💥 Stream error:", error);
    res.write(`data: [ERROR] ${error.message}\n\n`);
    res.end();
  }
}
