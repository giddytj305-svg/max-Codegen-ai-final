import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  try {
    // 🔑 Ensure your SERPAPI_KEY is set
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey)
      return res
        .status(500)
        .json({ error: "Missing SERPAPI_KEY in environment variables" });

    // Detect if it's news, image, or normal search
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
    console.log("🔍 Fetching SerpAPI:", url);

    const response = await fetch(url);
    const rawText = await response.text();

    // Handle HTML or invalid JSON responses safely
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      console.error("⚠️ Invalid JSON returned by SerpAPI:", rawText);
      return res
        .status(500)
        .json({ error: "Invalid response from SerpAPI. Check your key or query." });
    }

    // 📰 NEWS
    if (data.news_results?.length) {
      const articles = data.news_results.slice(0, 5);
      const text = articles
        .map(
          (a, i) =>
            `${i + 1}. <a href="${a.link}" target="_blank">${a.title}</a> — ${
              a.source?.name || a.source || "Unknown Source"
            }`
        )
        .join("<br>");
      return res.json({ text });
    }

    // 🖼️ IMAGES
    if (data.images_results?.length) {
      const images = data.images_results.slice(0, 5).map((i) => i.original);
      return res.json({
        text: `Here are some images for <b>${prompt}</b>:`,
        images,
      });
    }

    // 🌐 WEB RESULTS
    if (data.organic_results?.length) {
      const results = data.organic_results.slice(0, 4);
      const text = results
        .map(
          (r, i) =>
            `${i + 1}. <a href="${r.link}" target="_blank">${r.title}</a><br>${r.snippet || ""}`
        )
        .join("<br><br>");
      return res.json({ text });
    }

    // ❌ No results
    return res.json({ text: "No relevant search results found 🧐" });
  } catch (error) {
    console.error("💥 SerpAPI error:", error);
    res.status(500).json({ error: "Search failed internally" });
  }
}
