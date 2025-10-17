import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: "Missing prompt" });
  }

  try {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) {
      console.error("❌ SERPAPI_KEY is missing from environment");
      return res
        .status(500)
        .json({ error: "Missing SERPAPI_KEY in environment variables" });
    }

    const lower = prompt.toLowerCase();
    const endpoint = "https://serpapi.com/search.json";
    let params = { q: prompt, api_key: apiKey }; // Default params

    if (lower.includes("news") || lower.includes("latest")) {
      params.engine = "google_news";
    } else if (
      lower.includes("image") ||
      lower.includes("photo") ||
      lower.includes("picture") ||
      lower.includes("show me")
    ) {
      params.engine = "google_images";
    } else {
      params.engine = "google";
    }

    const url = `${endpoint}?${new URLSearchParams(params).toString()}`;
    console.log("🔍 Fetching from SerpAPI:", url);

    const response = await fetch(url);

    // Check for successful response
    if (!response.ok) {
      console.error("⚠️ SerpAPI error:", response.status, response.statusText);
      return res.status(500).json({
        error: `SerpAPI error: ${response.status} ${response.statusText}`,
      });
    }

    const text = await response.text();

    // Log the first few characters of response (for debugging)
    console.log("📦 Raw response snippet:", text.slice(0, 300));

    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      console.error("⚠️ Failed to parse JSON from SerpAPI:", err, err.message); // Include error message
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
      const textResult = data.news_results
        .slice(0, 5)
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
      
