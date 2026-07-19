// News reader server — serves the browser UI and the JSON/SSE API.
// Run with: node server.js   (optionally: PORT=3000 ANTHROPIC_API_KEY=sk-... node server.js)

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { getSection } from './lib/news.js';
import { lookupZip, reverseGeocode } from './lib/geo.js';
import { getWeather, geocodeCity } from './lib/weather.js';
import { extractArticle } from './lib/extract.js';
import { handleAsk } from './lib/ai.js';

// When packaged as a standalone executable (pkg), files live next to the exe.
const IS_PKG = typeof process.pkg !== 'undefined';
const BASE_DIR = IS_PKG
  ? path.dirname(process.execPath)
  : path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(BASE_DIR, 'public');

// Optional config file next to the app (used by the shareable distribution).
let fileConfig = {};
try {
  fileConfig = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'newsflow.config.json'), 'utf8'));
} catch { /* no config file — fine */ }

const PORT = Number(process.env.PORT) || Number(fileConfig.port) || 8360;
const SERVER_API_KEY = process.env.ANTHROPIC_API_KEY || fileConfig.anthropicApiKey || '';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname, searchParams: q } = url;

  try {
    if (req.method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, hasServerKey: Boolean(SERVER_API_KEY) });
    }

    if (req.method === 'GET' && pathname === '/api/geo') {
      if (q.get('zip')) return sendJson(res, 200, await lookupZip(q.get('zip')));
      if (q.get('lat') && q.get('lon')) {
        return sendJson(res, 200, await reverseGeocode(q.get('lat'), q.get('lon')));
      }
      return sendJson(res, 400, { error: 'Provide ?zip= or ?lat=&lon=' });
    }

    if (req.method === 'GET' && pathname === '/api/weather') {
      let lat = q.get('lat');
      let lon = q.get('lon');
      if ((!lat || !lon) && q.get('city')) {
        // Older saved locations have no coordinates — resolve them once.
        ({ lat, lon } = await geocodeCity(q.get('city'), q.get('state') || ''));
      }
      if (!lat || !lon) return sendJson(res, 400, { error: 'Provide ?lat=&lon= or ?city=&state=' });
      return sendJson(res, 200, await getWeather(lat, lon));
    }

    if (req.method === 'GET' && pathname === '/api/news') {
      const section = q.get('section') || 'world';
      const location = q.get('city') || q.get('state')
        ? {
            city: q.get('city') || '',
            state: q.get('state') || '',
            stateAbbr: q.get('stateAbbr') || '',
            zip: q.get('zip') || '',
          }
        : null;
      const exclude = new Set((q.get('exclude') || '').split('|').filter(Boolean));
      const data = await getSection(section, location, { fresh: q.get('fresh') === '1', exclude });
      return sendJson(res, 200, data);
    }

    if (req.method === 'GET' && pathname === '/api/article') {
      const target = q.get('url');
      if (!target) return sendJson(res, 400, { error: 'Missing ?url=' });
      try {
        return sendJson(res, 200, await extractArticle(target));
      } catch (err) {
        return sendJson(res, 200, { url: target, extracted: false, error: err.message, paragraphs: [] });
      }
    }

    if (req.method === 'POST' && pathname === '/api/ask') {
      const body = await readBody(req);
      const apiKey = req.headers['x-user-api-key'] || SERVER_API_KEY;
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      const sse = (data) => {
        if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
      };
      await handleAsk(body, apiKey, sse);
      res.end();
      return;
    }

    if (req.method === 'GET') return serveStatic(req, res, pathname);

    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    if (!res.headersSent) sendJson(res, 500, { error: err.message });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log('News reader running:');
  console.log(`  This computer:   http://localhost:${PORT}`);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) {
        console.log(`  On your network: http://${a.address}:${PORT}   (phones/tablets on the same Wi-Fi)`);
      }
    }
  }
  if (!SERVER_API_KEY) {
    console.log('Note: no Anthropic API key configured — the AI panel will prompt for a key in Settings.');
  }
  // Double-click launches (packaged exe / Start script) open the browser automatically.
  if (IS_PKG || process.env.NEWSFLOW_OPEN === '1') {
    const url = `http://localhost:${PORT}`;
    const [cmd, args] =
      process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin' ? ['open', [url]]
      : ['xdg-open', [url]];
    try { spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref(); } catch { /* best effort */ }
  }
});
