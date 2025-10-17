import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  try {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) {
      console.error("❌ SERPAPI_KEY is missing from environment");
      return res.status(500).json({ error: "Missing SERPAPI_KEY in environment variables" });
    }

    const lower = prompt.toLowerCase();
    const endpoint = "https://serpapi.com/search.json";
    let params = {};

    if (lower.includes("news") || lower.includes("latest")) {
      params = { engine: "google_news", q: prompt, api_key: apiKey };
    } else if (
      lower.includes("image") ||
      lower.includes("photo") ||
      lower.includes("picture") ||
      lower.includes("show me")
    ) {
      params = { engine: "google_images", q: prompt, api_key: apiKey };
    } else {
      params = { engine: "google", q: prompt, api_key: apiKey };
    }

    const url = `${endpoint}?${new URLSearchParams(params).toString()}`;
    console.log("🔍 Fetching from SerpAPI:", url);

    const response = await fetch(url);
    const text = await response.text();

    // Log the first few characters of response (for debugging)
    console.log("📦 Raw response snippet:", text.slice(0, 300));

    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      console.error("⚠️ Failed to parse JSON from SerpAPI:", err);
      return res.status(500).json({
        error: "Invalid JSON from SerpAPI. Check API key or quota.",
        raw: text.slice(0, 300),
      });
    }

    if (data.error) {
      console.error("⚠️ SerpAPI returned an error:", data.error);
      return res.status(500).json({ error: data.error });
    }

    // 📰 NEWS
    if (data.news_results?.length) {
      const articles = data.news_results.slice(0, 5);
      const textResult = articles
        .map(
          (a, i) =>
            `${i + 1}. <a href="${a.link}" target="_blank">${a.title}</a> — ${
              a.source?.name || a.source || "Unknown Source"
            }`
        )
        .join("<br>");
      return res.json({ text: textResult });
    }

    // 🖼️ IMAGES
    if (data.images_results?.length) {
      const images = data.images_results.slice(0, 5).map((i) => i.original);
      return res.json({
        text: `Here are some images for <b>${prompt}</b>:`,
        images,
      });
    }

    // 🌐 GENERAL
    if (data.organic_results?.length) {
      const results = data.organic_results.slice(0, 4);
      const textResult = results
        .map(
          (r, i) =>
            `${i + 1}. <a href="${r.link}" target="_blank">${r.title}</a><br>${r.snippet || ""}`
        )
        .join("<br><br>");
      return res.json({ text: textResult });
    }

    console.log("⚠️ No results found in SerpAPI data structure");
    return res.json({ text: "No relevant search results found 🧐" });
  } catch (error) {
    console.error("💥 Uncaught server error:", error);
    res.status(500).json({ error: error.message });
  }
}
