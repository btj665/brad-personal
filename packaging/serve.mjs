// The Tables — a tiny static server for the shareable package.
//
// It has no dependencies: it is plain Node, so anyone with Node installed can run
// the game by starting this file, and nothing needs to be fetched or built. It
// serves the `app/` folder sitting next to it (the built site) on the first free
// local port and opens a browser at it.
//
// The whole game runs in the browser — there is no back end — so this does one
// job: hand over files with the right content types, and fall back to index.html
// for any path that isn't a real file, since the app routes itself in memory.

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { join, normalize, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, 'app')

// Localhost by default — each person runs their own copy. Set HOST=0.0.0.0 to let
// others on the same network reach it, and PORT to pin a port.
const host = process.env.HOST || '127.0.0.1'
const wantedPort = process.env.PORT ? Number(process.env.PORT) : 8777

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

/** Resolve a URL path to a file inside `app/`, or null if it escapes the folder
 *  (a `..` traversal) — the one thing a file server must never allow. */
function resolveInApp(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]).replace(/\/+$/, '') || '/'
  const target = normalize(join(root, clean))
  if (target !== root && !target.startsWith(root + '/') && target !== root) return null
  return target
}

async function fileOr404(target) {
  try {
    const s = await stat(target)
    if (s.isFile()) return target
    if (s.isDirectory()) {
      const index = join(target, 'index.html')
      const is = await stat(index).catch(() => null)
      if (is?.isFile()) return index
    }
  } catch {
    /* falls through to the SPA fallback */
  }
  return null
}

const server = createServer(async (req, res) => {
  const target = resolveInApp(req.url || '/')
  if (!target) {
    res.writeHead(403).end('Forbidden')
    return
  }

  let file = await fileOr404(target)

  // A path that is not a real file and has no extension is an in-app route, so
  // hand back index.html and let the app take it from there. A missing *asset*
  // (something with an extension) is a genuine 404.
  if (!file) {
    if (extname(target) === '') file = join(root, 'index.html')
    else {
      res.writeHead(404).end('Not found')
      return
    }
  }

  const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream'
  // The built assets carry content-hashed names, so they can be cached hard;
  // index.html must not be, or an update never reaches anyone.
  const cache = file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable'
  res.writeHead(200, { 'content-type': type, 'cache-control': cache })
  createReadStream(file).pipe(res)
})

/** True if something is already listening on `port`. */
function inUse(port) {
  return new Promise((resolve) => {
    const probe = createConnection({ host, port })
    probe.once('connect', () => {
      probe.destroy()
      resolve(true)
    })
    probe.once('error', () => resolve(false))
  })
}

async function firstFreePort(start) {
  for (let p = start; p < start + 50; p++) {
    if (!(await inUse(p))) return p
  }
  return start
}

/** Open the default browser, best-effort — a launcher may also do this, and a
 *  double-open is harmless; a missing opener must not crash the server. */
function openBrowser(url) {
  const cmd =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]]
  try {
    spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref()
  } catch {
    /* no browser opener on this machine; the printed URL still works */
  }
}

const port = await firstFreePort(wantedPort)

// Fail readably rather than with a stack trace if the port can't be taken.
server.on('error', (err) => {
  console.error(`\nCould not start the server: ${err.message}`)
  console.error('Is another copy already running? Close it and try again.\n')
  process.exit(1)
})

server.listen(port, host, () => {
  const url = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/`
  console.log('')
  console.log('  The Tables is running.')
  console.log('')
  console.log(`     ${url}`)
  console.log('')
  if (host === '0.0.0.0') console.log('  Shared on your network — others can reach it at your IP on this port.')
  console.log('  Leave this window open while you play. Close it to stop.')
  console.log('')
  if (!process.env.NO_OPEN) openBrowser(url)
})
