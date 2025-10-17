import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  try {
    // 🔑 Ensure your SERPAPI_KEY is set in Vercel
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey)
      return res.status(500).json({ error: "Missing SERPAPI_KEY in env" });

    // Detect if user wants news or images
    const lower = prompt.toLowerCase();
    let endpoint = "https://serpapi.com/search.json";
    let params = {};

    if (lower.includes("news") || lower.includes("latest")) {
      params = { engine: "google_news", q: prompt, api_key: apiKey };
    } else if (
      lower.includes("image") ||
      lower.includes("photo") ||
      lower.includes("pictures") ||
      lower.includes("show")
    ) {
      params = { engine: "google_images", q: prompt, api_key: apiKey };
    } else {
      params = { engine: "google", q: prompt, api_key: apiKey };
    }

    const url = `${endpoint}?${new URLSearchParams(params).toString()}`;
    const response = await fetch(url);
    const data = await response.json();

    // 📰 Handle News Results
    if (data.news_results) {
      const articles = data.news_results.slice(0, 5);
      const text = articles
        .map(
          (a, i) =>
            `${i + 1}. <a href="${a.link}" target="_blank">${a.title}</a> — ${
              a.source || "Source"
            }`
        )
        .join("<br>");
      return res.json({ text });
    }

    // 🖼️ Handle Image Results
    if (data.images_results) {
      const images = data.images_results.slice(0, 5).map(i => i.original);
      return res.json({
        text: `Here are some images for <b>${prompt}</b>:`,
        images,
      });
    }

    // 🌐 Handle General Web Results
    if (data.organic_results) {
      const results = data.organic_results.slice(0, 4);
      const text = results
        .map(
          (r, i) =>
            `${i + 1}. <a href="${r.link}" target="_blank">${r.title}</a><br>${r.snippet || ""}`
        )
        .join("<br><br>");
      return res.json({ text });
    }

    // Default fallback
    return res.json({
      text: "I couldn’t find relevant results for that search 🧐",
    });
  } catch (error) {
    console.error("SerpAPI error:", error);
    res.status(500).json({ error: "Search failed" });
  }
}
