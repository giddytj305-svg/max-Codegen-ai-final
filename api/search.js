// /api/search.js

import fetch from "node-fetch";

const SERPAPI_URL = "https://serpapi.com/search.json";

export default async function handler(req, res) {
  // --- ✅ CORS setup
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { query } = req.body;
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Missing search query." });
    }

    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing SERPAPI_KEY in environment." });
    }

    // --- 🧠 Detect intent: image or text search
    const wantsImages =
      /photo|image|picture|pic|poster|wallpaper|logo|design|screenshot/i.test(query);

    const params = new URLSearchParams({
      q: query,
      api_key: apiKey,
      engine: wantsImages ? "google_images" : "google",
      location: "Nairobi, Kenya", // optional region relevance
      hl: "en",
      gl: "ke",
    });

    // --- 🌐 Perform the search
    const response = await fetch(`${SERPAPI_URL}?${params.toString()}`);
    const data = await response.json();

    // --- 🖼️ Extract results based on intent
    let results = [];

    if (wantsImages && data.images_results) {
      results = data.images_results.slice(0, 5).map((img) => ({
        title: img.title || "Image",
        thumbnail: img.thumbnail,
        source: img.source,
        link: img.link,
      }));
    } else if (data.organic_results) {
      results = data.organic_results.slice(0, 5).map((r) => ({
        title: r.title,
        snippet: r.snippet,
        link: r.link,
      }));
    }

    // --- ✅ Return clean JSON
    res.status(200).json({
      type: wantsImages ? "image" : "text",
      query,
      results,
      source: "SerpAPI",
    });
  } catch (err) {
    console.error("❌ Search error:", err);
    res.status(500).json({
      error: "Search failed",
      details: err.message,
    });
  }
}
