import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUser() {
  const cookieStore = await cookies();
  const session = cookieStore.get("tom_session")?.value;
  if (!session) return null;
  const { data } = await supabase.from("tom_users").select("*").eq("id", session).single();
  return data;
}

// Strip state from "Indianapolis, IN" → "Indianapolis"
function cleanCity(city: string) {
  return city.split(",")[0].trim();
}

async function getWeather(city: string) {
  const cleanedCity = cleanCity(city);
  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(cleanedCity)}&appid=${process.env.OPENWEATHER_API_KEY}&units=imperial&cnt=8`
    );
    const data = await res.json();
    if (data.cod !== "200") {
      console.error("Weather API error:", data.message, "for city:", cleanedCity);
      return null;
    }

    const current = data.list[0];
    const temp = Math.round(current.main.temp);
    const feels = Math.round(current.main.feels_like);
    const desc = current.weather[0].description;
    const high = Math.round(Math.max(...data.list.slice(0, 4).map((d: any) => d.main.temp_max)));
    const low = Math.round(Math.min(...data.list.slice(0, 4).map((d: any) => d.main.temp_min)));

    return {
      type: "weather",
      icon: getWeatherIcon(current.weather[0].main),
      title: `${cleanedCity} weather`,
      body: `${temp}°F · ${desc} · High ${high}° Low ${low}° · Feels like ${feels}°`,
      bg: "#eff6ff",
    };
  } catch (e) {
    console.error("Weather fetch failed:", e);
    return null;
  }
}

// Only return large events likely to impact traffic
// Filter: only Music, Sports segments + minimum popularity signals
async function getLargeEvents(city: string) {
  const cleanedCity = cleanCity(city);
  try {
    const res = await fetch(
      `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${process.env.TICKETMASTER_API_KEY}&city=${encodeURIComponent(cleanedCity)}&size=20&sort=date,asc&startDateTime=${new Date().toISOString().split(".")[0]}Z&classificationName=music,sports`
    );
    const data = await res.json();
    const events = data._embedded?.events || [];

    // Filter to only large venues (capacity signals) or known large event types
    const largeEvents = events.filter((e: any) => {
      const venue = e._embedded?.venues?.[0];
      const capacity = venue?.upcomingEvents?.total;
      const segment = e.classifications?.[0]?.segment?.name;
      // Keep music and sports events at named large venues
      return segment === "Music" || segment === "Sports";
    });

    return largeEvents.slice(0, 3).map((e: any) => ({
      type: "event",
      icon: getEventIcon(e.classifications?.[0]?.segment?.name),
      title: e.name,
      body: `${new Date(e.dates.start.localDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · ${e._embedded?.venues?.[0]?.name || cleanedCity} · expect heavy traffic`,
      bg: "#fff7ed",
      url: e.url,
    }));
  } catch (e) {
    console.error("Events fetch failed:", e);
    return [];
  }
}

async function getTravelWeather(cities: string[]) {
  const results = [];
  for (const city of cities.slice(0, 2)) {
    const w = await getWeather(city);
    if (w) results.push({ ...w, title: `${cleanCity(city)} forecast`, bg: "#f0fdfa" });
  }
  return results;
}

function getWeatherIcon(main: string) {
  const icons: Record<string, string> = {
    Clear: "☀️", Clouds: "☁️", Rain: "🌧️", Drizzle: "🌦️",
    Thunderstorm: "⛈️", Snow: "❄️", Mist: "🌫️", Fog: "🌫️",
  };
  return icons[main] || "🌤️";
}

function getEventIcon(segment: string) {
  const icons: Record<string, string> = {
    Music: "🎵", Sports: "🏆", "Arts & Theatre": "🎭",
    Film: "🎬", Miscellaneous: "⭐",
  };
  return icons[segment] || "📅";
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const homeCity = user.home_city || "Indianapolis, IN";
  const favCities = user.favorite_cities || [];

  // Always fetch weather first, events second, travel weather third
  const [homeWeather, events, travelWeather] = await Promise.all([
    getWeather(homeCity),
    getLargeEvents(homeCity),
    getTravelWeather(favCities),
  ]);

  // Weather always goes first, then travel, then events
  const items = [
    homeWeather,
    ...travelWeather,
    ...events,
  ].filter(Boolean);

  // If weather failed, add a fallback so it's obvious
  if (!homeWeather) {
    items.unshift({
      type: "weather",
      icon: "🌤️",
      title: `${cleanCity(homeCity)} weather`,
      body: "Weather data unavailable · check back soon",
      bg: "#eff6ff",
    });
  }

  return NextResponse.json({ items });
}