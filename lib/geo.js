// Location resolution: ZIP code -> place (zippopotam.us) and
// lat/lon -> place (BigDataCloud free reverse-geocode endpoint, no API key).

const STATE_ABBR = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA',
  Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS',
  Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK',
  Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT',
  Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI',
  Wyoming: 'WY', 'District of Columbia': 'DC',
};

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

export async function lookupZip(zip) {
  if (!/^\d{5}$/.test(zip)) throw new Error('ZIP code must be 5 digits');
  const data = await getJson(`https://api.zippopotam.us/us/${zip}`);
  const place = data.places?.[0];
  if (!place) throw new Error('ZIP code not found');
  const state = place.state;
  return {
    zip,
    city: place['place name'],
    state,
    stateAbbr: place['state abbreviation'] || STATE_ABBR[state] || '',
    lat: Number(place.latitude) || null,
    lon: Number(place.longitude) || null,
    label: `${place['place name']}, ${place['state abbreviation'] || state}`,
  };
}

export async function reverseGeocode(lat, lon) {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) throw new Error('Invalid coordinates');
  const data = await getJson(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${la}&longitude=${lo}&localityLanguage=en`
  );
  const city = data.city || data.locality || '';
  const state = data.principalSubdivision || '';
  if (!city && !state) throw new Error('Could not determine location');
  const stateAbbr = STATE_ABBR[state] || '';
  return {
    zip: data.postcode || '',
    city,
    state,
    stateAbbr,
    lat: la,
    lon: lo,
    label: city && stateAbbr ? `${city}, ${stateAbbr}` : city || state,
  };
}
