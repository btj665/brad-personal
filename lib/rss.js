// Minimal RSS 2.0 / Atom feed fetcher + parser (no dependencies).
// Handles CDATA, HTML entities, media enclosures, and Google News quirks.

const FETCH_TIMEOUT_MS = 12000;
const MAX_ITEMS_PER_FEED = 40;

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
};

export function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITIES[name] ?? m);
}

export function stripHtml(str) {
  if (!str) return '';
  return decodeEntities(
    str
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function unwrapCdata(str) {
  if (!str) return '';
  const m = str.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return m ? m[1] : str;
}

// Extract inner text of the first <tag>...</tag> in a block. Tag may have
// attributes and a namespace prefix (pass the full prefixed name).
function field(block, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
  const m = block.match(re);
  return m ? unwrapCdata(m[1]).trim() : '';
}

function attr(block, tag, attribute) {
  const re = new RegExp(`<${tag}\\s[^>]*?${attribute}\\s*=\\s*"([^"]*)"`, 'i');
  const m = block.match(re);
  return m ? decodeEntities(m[1]) : '';
}

function findImage(block) {
  return (
    attr(block, 'media:content', 'url') ||
    attr(block, 'media:thumbnail', 'url') ||
    (/type\s*=\s*"image\//i.test(block) ? attr(block, 'enclosure', 'url') : '') ||
    ''
  );
}

function parseRssItems(xml) {
  const blocks = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || [];
  return blocks.map((b) => {
    const sourceName = stripHtml(field(b, 'source'));
    let title = stripHtml(field(b, 'title'));
    // Google News appends " - Source Name" to titles; strip when it matches.
    if (sourceName && title.endsWith(` - ${sourceName}`)) {
      title = title.slice(0, -(sourceName.length + 3)).trim();
    }
    return {
      title,
      link: decodeEntities(field(b, 'link')) || attr(b, 'link', 'href'),
      description: stripHtml(field(b, 'description')).slice(0, 600),
      pubDate: field(b, 'pubDate') || field(b, 'dc:date') || '',
      image: findImage(b),
      sourceName,
      sourceUrl: attr(b, 'source', 'url'),
      categories: (b.match(/<category(?:\s[^>]*)?>[\s\S]*?<\/category>/gi) || [])
        .map((c) => stripHtml(c)),
    };
  });
}

function parseAtomEntries(xml) {
  const blocks = xml.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) || [];
  return blocks.map((b) => ({
    title: stripHtml(field(b, 'title')),
    link: attr(b, 'link', 'href') || decodeEntities(field(b, 'link')),
    description: stripHtml(field(b, 'summary') || field(b, 'content')).slice(0, 600),
    pubDate: field(b, 'updated') || field(b, 'published') || '',
    image: findImage(b),
    sourceName: '',
    categories: [],
  }));
}

export function parseFeed(xml, feedName) {
  const items = /<entry[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml)
    ? parseAtomEntries(xml)
    : parseRssItems(xml);

  return items
    .filter((it) => it.title && it.link)
    .slice(0, MAX_ITEMS_PER_FEED)
    .map((it) => {
      const ts = Date.parse(it.pubDate);
      return {
        ...it,
        sourceName: it.sourceName || feedName || '',
        sourceUrl: it.sourceUrl || '',
        timestamp: Number.isFinite(ts) ? ts : null,
      };
    });
}

export async function fetchFeed(url, feedName) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; NewsReader/1.0)',
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return parseFeed(xml, feedName);
  } finally {
    clearTimeout(timer);
  }
}
