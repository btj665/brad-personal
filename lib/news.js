// Section feed configuration, opinion filtering, and headline clustering.

import { fetchFeed } from './rss.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // ignore items older than 3 days
const feedCache = new Map(); // url -> { at, items }

const GN = 'hl=en-US&gl=US&ceid=US:en';

// Hard-news feeds only — top-level news sections from wire-style outlets,
// plus Google News topic feeds (which aggregate AP, Reuters, and others).
const SECTION_FEEDS = {
  world: [
    { name: 'Google News World', url: `https://news.google.com/rss/headlines/section/topic/WORLD?${GN}` },
    { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
    { name: 'NPR', url: 'https://feeds.npr.org/1004/rss.xml' },
    { name: 'The Guardian', url: 'https://www.theguardian.com/world/rss' },
    { name: 'PBS NewsHour', url: 'https://www.pbs.org/newshour/feeds/rss/world' },
  ],
  us: [
    { name: 'Google News U.S.', url: `https://news.google.com/rss/headlines/section/topic/NATION?${GN}` },
    { name: 'NPR', url: 'https://feeds.npr.org/1003/rss.xml' },
    { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml' },
    { name: 'The Guardian', url: 'https://www.theguardian.com/us-news/rss' },
    { name: 'PBS NewsHour', url: 'https://www.pbs.org/newshour/feeds/rss/nation' },
  ],
};

function regionalFeeds(loc) {
  const state = loc?.state;
  if (!state) return [];
  return [
    { name: `Google News — ${state}`, url: `https://news.google.com/rss/headlines/section/geo/${encodeURIComponent(state)}?${GN}` },
    { name: `Google News — ${state} search`, url: `https://news.google.com/rss/search?q=${encodeURIComponent(`"${state}" when:2d`)}&${GN}` },
  ];
}

function localFeeds(loc) {
  if (!loc?.city) return [];
  const place = loc.stateAbbr ? `${loc.city}, ${loc.stateAbbr}` : loc.city;
  const q = loc.stateAbbr ? `"${loc.city}" "${loc.stateAbbr}" when:3d` : `"${loc.city}" when:3d`;
  return [
    { name: `Google News — ${place}`, url: `https://news.google.com/rss/headlines/section/geo/${encodeURIComponent(place)}?${GN}` },
    { name: `Google News — ${loc.city} search`, url: `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${GN}` },
  ];
}

// --- Opinion / conjecture filter -------------------------------------------

const OPINION_RE = /\b(opinion|editorial|op-ed|oped|commentary|column(?:ist)?|viewpoint|perspective|analysis|explainer|essay|letters?\s+to\s+the\s+editor|review)\b/i;
const OPINION_URL_RE = /\/(opinion|opinions|editorial|editorials|commentary|comment|voices|analysis|columns?|blogs?|perspectives?|letters)\//i;
const OPINION_LEAD_RE = /^(opinion|editorial|analysis|comment|review)\s*[:|—-]/i;

export function isOpinion(item) {
  if (OPINION_URL_RE.test(item.link)) return true;
  if (OPINION_LEAD_RE.test(item.title)) return true;
  if (item.categories?.some((c) => OPINION_RE.test(c))) return true;
  return false;
}

// --- Clustering -------------------------------------------------------------

const STOPWORDS = new Set(
  ('a an the and or but of in on at to for from with by as is are was were be been ' +
   'has have had it its this that these those he she they them his her their you your ' +
   'we our us not no new news says said say after amid over more most than about into ' +
   'up down out off will would could should can may might just how what when where why ' +
   'who whom which while during before against between among across also live update ' +
   'updates breaking report reports reported latest today').split(/\s+/)
);

export function titleTokens(title) {
  return new Set(
    title
      .toLowerCase()
      .replace(/['’]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t))
  );
}

function overlap(a, b) {
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  const union = a.size + b.size - shared;
  return { shared, jaccard: union ? shared / union : 0 };
}

function normTitle(t) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function clusterItems(items) {
  // Dedup exact titles/links first.
  const seen = new Set();
  const deduped = [];
  for (const it of items) {
    const key = normTitle(it.title);
    if (seen.has(key) || seen.has(it.link)) continue;
    seen.add(key);
    seen.add(it.link);
    deduped.push(it);
  }

  deduped.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  const clusters = [];
  for (const it of deduped) {
    const tokens = titleTokens(it.title);
    let best = null;
    let bestScore = 0;
    for (const c of clusters) {
      const { shared, jaccard } = overlap(tokens, c.tokens);
      const score = shared >= 3 || (shared >= 2 && jaccard >= 0.22) ? shared + jaccard : 0;
      if (score > bestScore) { best = c; bestScore = score; }
    }
    if (best) {
      best.items.push(it);
      for (const t of tokens) best.tokens.add(t);
      best.sources.add(it.sourceName || 'unknown');
      if (!best.image && it.image) best.image = it.image;
      best.latest = Math.max(best.latest, it.timestamp || 0);
    } else {
      clusters.push({
        id: `c${clusters.length}_${Math.abs(hashCode(it.title))}`,
        title: it.title,
        tokens: new Set(tokens),
        items: [it],
        sources: new Set([it.sourceName || 'unknown']),
        image: it.image || '',
        latest: it.timestamp || 0,
      });
    }
  }

  return clusters
    .map((c) => ({
      id: c.id,
      title: c.title,
      image: c.image,
      latest: c.latest,
      sourceCount: c.sources.size,
      sources: [...c.sources].filter((s) => s !== 'unknown'),
      weight: c.sources.size * 2 + c.items.length,
      items: c.items.map(({ title, link, description, image, sourceName, sourceUrl, timestamp }) => ({
        title, link, description, image, sourceName, sourceUrl, timestamp,
      })),
    }))
    .sort((a, b) => b.weight - a.weight || b.latest - a.latest);
}

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

// --- Section assembly -------------------------------------------------------

async function loadFeed(feed, fresh) {
  const cached = feedCache.get(feed.url);
  if (!fresh && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.items;
  try {
    const items = await fetchFeed(feed.url, feed.name);
    feedCache.set(feed.url, { at: Date.now(), items });
    return items;
  } catch (err) {
    // Serve stale data on failure if we have any.
    if (cached) return cached.items;
    return { error: `${feed.name}: ${err.message}` };
  }
}

export async function getSection(section, location, { fresh = false, exclude = new Set() } = {}) {
  let feeds;
  if (section === 'world' || section === 'us') feeds = SECTION_FEEDS[section];
  else if (section === 'regional') feeds = regionalFeeds(location);
  else if (section === 'local') feeds = localFeeds(location);
  else throw new Error(`Unknown section: ${section}`);

  if (!feeds.length) {
    return { section, needsLocation: true, clusters: [], errors: [] };
  }

  const results = await Promise.all(feeds.map((f) => loadFeed(f, fresh)));
  const errors = [];
  const items = [];
  for (const r of results) {
    if (Array.isArray(r)) items.push(...r);
    else errors.push(r.error);
  }

  const cutoff = Date.now() - MAX_AGE_MS;
  const filtered = items.filter(
    (it) => !isOpinion(it) && (it.timestamp === null || it.timestamp >= cutoff)
  );

  // Full outlet list for this section (computed before exclusion, so toggled-off
  // outlets still appear in the sources panel and can be re-enabled).
  const counts = new Map();
  for (const it of filtered) {
    const name = it.sourceName || 'Unknown';
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  const sources = [...counts.entries()]
    .map(([name, count]) => ({ name, count, enabled: !exclude.has(name) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const included = exclude.size
    ? filtered.filter((it) => !exclude.has(it.sourceName || 'Unknown'))
    : filtered;

  return {
    section,
    location: location || null,
    fetchedAt: Date.now(),
    clusters: clusterItems(included).slice(0, 40),
    sources,
    errors,
  };
}
