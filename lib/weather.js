// Local weather via Open-Meteo (free, no API key).

const CACHE = new Map(); // "lat,lon" -> { at, data }
const TTL_MS = 15 * 60 * 1000;

// WMO weather interpretation codes → [label, emoji]
const WMO = {
  0: ['Clear', '☀️'], 1: ['Mostly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'], 48: ['Freezing fog', '🌫️'],
  51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Heavy drizzle', '🌦️'],
  56: ['Freezing drizzle', '🌧️'], 57: ['Freezing drizzle', '🌧️'],
  61: ['Light rain', '🌧️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'],
  66: ['Freezing rain', '🌧️'], 67: ['Freezing rain', '🌧️'],
  71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'], 77: ['Snow grains', '🌨️'],
  80: ['Rain showers', '🌦️'], 81: ['Rain showers', '🌦️'], 82: ['Violent rain showers', '⛈️'],
  85: ['Snow showers', '🌨️'], 86: ['Heavy snow showers', '❄️'],
  95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm w/ hail', '⛈️'], 99: ['Thunderstorm w/ hail', '⛈️'],
};

export function describeWmo(code) {
  return WMO[code] || ['Unknown', '🌡️'];
}

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// City/state → coordinates (for locations saved before we stored lat/lon).
export async function geocodeCity(city, state) {
  const data = await getJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=10&language=en&format=json`
  );
  const results = data.results || [];
  if (!results.length) throw new Error(`Could not find coordinates for ${city}`);
  const match =
    results.find((r) => r.country_code === 'US' && state && r.admin1 === state) ||
    results.find((r) => r.country_code === 'US') ||
    results[0];
  return { lat: match.latitude, lon: match.longitude };
}

export async function getWeather(lat, lon) {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) throw new Error('Invalid coordinates');

  const key = `${la.toFixed(2)},${lo.toFixed(2)}`;
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;

  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${la}&longitude=${lo}` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch' +
    '&forecast_days=6&timezone=auto';
  const raw = await getJson(url);

  const c = raw.current || {};
  const [label, emoji] = describeWmo(c.weather_code);
  const daily = (raw.daily?.time || []).map((date, i) => {
    const [dLabel, dEmoji] = describeWmo(raw.daily.weather_code?.[i]);
    return {
      date,
      label: dLabel,
      emoji: dEmoji,
      high: Math.round(raw.daily.temperature_2m_max?.[i]),
      low: Math.round(raw.daily.temperature_2m_min?.[i]),
      precip: raw.daily.precipitation_probability_max?.[i] ?? null,
    };
  });

  const data = {
    lat: la,
    lon: lo,
    fetchedAt: Date.now(),
    current: {
      temp: Math.round(c.temperature_2m),
      feelsLike: Math.round(c.apparent_temperature),
      humidity: c.relative_humidity_2m ?? null,
      wind: Math.round(c.wind_speed_10m ?? 0),
      gusts: Math.round(c.wind_gusts_10m ?? 0),
      label,
      emoji,
    },
    daily,
  };
  CACHE.set(key, { at: Date.now(), data });
  return data;
}
