import fetch from "node-fetch";

const SERP_API_KEY = process.env.SERP_API_KEY; // 🔑 SerpAPI key
const WEATHER_API_KEY = process.env.OPENWEATHER_API_KEY; // 🔑 OpenWeatherMap key

export default async function handler(req, res) {
  // --- CORS setup ---
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { topic, location } = req.body || {};
  let userLocation = location;

  try {
    // 🌍 1️⃣ Auto-detect location if not provided
    if (!userLocation) {
      try {
        // Get user’s IP (works on Vercel)
        const ip =
          req.headers["x-forwarded-for"]?.split(",")[0] ||
          req.connection?.remoteAddress ||
          null;

        if (ip) {
          const geoRes = await fetch(`https://ipapi.co/${ip}/json/`);
          const geoData = await geoRes.json();

          if (geoData && geoData.city) {
            userLocation = `${geoData.city}, ${geoData.country_name}`;
          }
        }
      } catch (geoErr) {
        console.warn("🌐 Could not detect location:", geoErr);
      }
    }

    // 🔍 2️⃣ Fetch news from SerpAPI
    const searchQuery = topic ? `${topic} news` : "world news today";
    const serpUrl = `https://serpapi.com/search.json?engine=google_news&q=${encodeURIComponent(
      searchQuery
    )}&api_key=${SERP_API_KEY}`;

    const serpResponse = await fetch(serpUrl);
    const serpData = await serpResponse.json();

    const newsResults = (serpData.news_results || []).slice(0, 6);
    const news = newsResults.map((n) => ({
      title: n.title,
      link: n.link,
      snippet: n.snippet,
      date: n.date,
      source: n.source,
      image: n.thumbnail || n.image || null,
    }));

    // ☁️ 3️⃣ Get weather info (auto or manual)
    let weather = null;
    if (userLocation) {
      const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
        userLocation
      )}&appid=${WEATHER_API_KEY}&units=metric`;

      const weatherResponse = await fetch(weatherUrl);
      const weatherData = await weatherResponse.json();

      if (weatherData.cod === 200) {
        weather = {
          location: weatherData.name,
          condition: weatherData.weather[0].description,
          temp: weatherData.main.temp,
          feels_like: weatherData.main.feels_like,
          humidity: weatherData.main.humidity,
          wind_speed: weatherData.wind.speed,
        };
      } else {
        weather = { error: "Location not found." };
      }
    }

    // 💬 4️⃣ Build natural conversational summary
    let summary = "";
    if (news.length > 0) {
      summary += `🗞️ Here are the latest ${topic || "world"} headlines:\n\n`;
      news.forEach((n, i) => {
        summary += `${i + 1}. *${n.title}* — ${n.source || "Unknown source"}\n`;
        if (n.snippet) summary += `   ${n.snippet}\n`;
        if (n.image) summary += `   🖼️ [Image Preview](${n.image})\n`;
        summary += `   👉 ${n.link}\n\n`;
      });
    } else {
      summary += `Hmm, I couldn’t find any recent ${topic || "world"} news right now 😕.`;
    }

    if (weather && !weather.error) {
      summary += `\n🌦️ Meanwhile, the weather in *${weather.location}* is **${weather.condition}**, around ${weather.temp}°C (feels like ${weather.feels_like}°C). 💨 Wind: ${weather.wind_speed} m/s, Humidity: ${weather.humidity}%.`;
    } else if (weather && weather.error) {
      summary += `\n⚠️ ${weather.error}`;
    }

    // ✅ 5️⃣ Respond cleanly
    res.status(200).json({
      success: true,
      topic: topic || "world",
      location: userLocation || "Unknown",
      news,
      weather,
      summary,
    });
  } catch (err) {
    console.error("💥 Error fetching news/weather:", err);
    res.status(500).json({ error: "Failed to fetch news/weather" });
  }
}
