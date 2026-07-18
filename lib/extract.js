// Best-effort readable-article extraction: fetch the page, prefer <article>,
// otherwise take the densest run of <p> tags. Also pulls the og:image.

import { stripHtml, decodeEntities } from './rss.js';

const MAX_BYTES = 2.5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15000;

export async function extractArticle(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL');
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('Only http/https URLs allowed');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let html;
  let finalUrl = url;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    finalUrl = res.url || url;
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    reader.cancel().catch(() => {});
    html = Buffer.concat(chunks).toString('utf8');
  } finally {
    clearTimeout(timer);
  }

  const meta = (name) => {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${name}["'][^>]*content\\s*=\\s*["']([^"']*)["']`, 'i'
    );
    const re2 = new RegExp(
      `<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${name}["']`, 'i'
    );
    const m = html.match(re) || html.match(re2);
    return m ? decodeEntities(m[1]) : '';
  };

  const title =
    meta('og:title') ||
    stripHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const image = meta('og:image') || '';
  const siteName = meta('og:site_name') || parsed.hostname.replace(/^www\./, '');
  const published = meta('article:published_time') || '';

  // Prefer <article> content; fall back to whole body.
  const articleMatch = html.match(/<article[\s\S]*?<\/article>/i);
  const scope = (articleMatch ? articleMatch[0] : html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(nav|aside|footer|header|form|figure|figcaption)[\s\S]*?<\/\1>/gi, '');

  const paragraphs = (scope.match(/<p(?:\s[^>]*)?>[\s\S]*?<\/p>/gi) || [])
    .map((p) => stripHtml(p))
    .filter((t) => t.length > 60 && !/cookie|javascript|subscribe to|sign up for/i.test(t.slice(0, 80)));

  return {
    url: finalUrl,
    title,
    siteName,
    published,
    image,
    paragraphs: paragraphs.slice(0, 80),
    extracted: paragraphs.length > 0,
  };
}
