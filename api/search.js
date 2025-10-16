import fetch from "node-fetch";

export const config = {
  runtime: "edge", // ⚡ Fast on Vercel Edge
};

export default async function handler(req) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: "Missing prompt" }), { status: 400 });
    }

    // 🔑 Your SerpAPI key (set this in Vercel dashboard)
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing SERPAPI_KEY" }), { status: 500 });
    }

    const lower = prompt.toLowerCase();
    let searchType = "news";
    if (lower.includes("image") || lower.includes("photo") || lower.includes("picture")) {
      searchType = "image";
    }

    let apiURL = "";
    if (searchType === "image") {
      // 🖼️ Google Images
      apiURL = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(
        prompt
      )}&api_key=${apiKey}`;
    } else {
      // 📰 News / general
      apiURL = `https://serpapi.com/search.json?engine=google_news&q=${encodeURIComponent(
        prompt
      )}&api_key=${apiKey}`;
    }

    const res = await fetch(apiURL);
    const data = await res.json();

    if (searchType === "image") {
      const images =
        data.images_results?.slice(0, 8).map(img => ({
          url: img.original || img.thumbnail,
          title: img.title || "",
        })) || [];
      return new Response(JSON.stringify({ images }), {
        headers: { "Content-Type": "application/json" },
      });
    } else {
      const results =
        data.news_results?.slice(0, 6).map(n => ({
          title: n.title,
          link: n.link,
          snippet: n.snippet || n.source || "",
        })) || [];
      return new Response(JSON.stringify({ results }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: "Server error", details: err.message }),
      { status: 500 }
    );
  }
}
