# Newsflow 🗞️

A personal news reader that runs in your browser. It pulls **hard news** (no opinion,
editorial, or commentary) from credible feed sources, clusters related headlines into
stories, and displays them as floating **thought bubbles** — sized by how widely each
story is being covered. Click a bubble to see the coverage, open articles with their
media, and ask an AI panel questions about the article you're reading or the news in
general.

## Features

- **Four sections** — World, U.S., Regional, and Local. Regional/local news is gathered
  for your area from your browser location or a ZIP code.
- **Credible, hard-news sources** — BBC, NPR, The Guardian, PBS NewsHour, and Google
  News topic feeds (which aggregate AP, Reuters, and other wire coverage). Opinion,
  editorial, commentary, analysis, and column pieces are filtered out.
- **Thought-bubble view** — related headlines from different outlets are clustered into
  one story; bubble size reflects how many sources are covering it. A list view is
  available too (☰ toggle).
- **Article reader** — opens articles in a clean reader view with images, with a link
  out to the original. Back navigation and per-section refresh (⟳) included.
- **AI panel** — ask questions about the current article ("summarize this for me"),
  the current headlines, or the news at large ("what's going on with the US and Iran?",
  "what happened in Oklahoma City today?"). Powered by Claude with web search, streamed
  live into the panel.

## Setup

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
ANTHROPIC_API_KEY=sk-ant-... npm start
```

Then open **http://localhost:8360** in your browser.

- The `ANTHROPIC_API_KEY` (get one at https://platform.claude.com) powers the AI panel.
  If you don't set it on the server, you can paste a key into **Settings (⚙)** in the
  app instead — it's stored only in your browser and sent only to your own server.
- News reading works without any API key; only the AI panel needs one.
- Optional: `PORT=3000 npm start` to change the port.

## Use it from your phone / tablet / other devices

The server listens on your whole local network, not just this computer. When it starts
it prints the address to use, e.g.:

```
News reader running:
  This computer:   http://localhost:8360
  On your network: http://192.168.1.42:8360   (phones/tablets on the same Wi-Fi)
```

1. **Allow it through the Windows firewall** — the first time you run `npm start`,
   Windows shows a "Windows Defender Firewall has blocked some features" prompt for
   Node.js. Check **Private networks** and click **Allow access**. (If you missed the
   prompt, run this once in an *administrator* PowerShell:
   `New-NetFirewallRule -DisplayName "Newsflow" -Direction Inbound -Protocol TCP -LocalPort 8360 -Action Allow`)
2. On your phone/tablet (same Wi-Fi), open the `http://192.168.x.x:8360` address the
   server printed.
3. Optional: use your browser's **Add to Home Screen** to install it like an app.

Notes:
- The PC running the server must stay on. `PORT=...` changes the port.
- Start the server with `ANTHROPIC_API_KEY` set so every device gets the AI panel
  without pasting the key on each one (keys entered in Settings are per-device).
- Browsers only allow the "Use my current location" button on `localhost` or HTTPS,
  so on other devices set your location by ZIP code instead (one time — it's saved).

## How it works

- `server.js` — small zero-framework Node server: static UI + JSON API.
- `lib/rss.js` — dependency-free RSS 2.0 / Atom parser.
- `lib/news.js` — section feed config, opinion filtering, and headline clustering
  (token-overlap grouping across outlets).
- `lib/geo.js` — ZIP lookup (zippopotam.us) and reverse geocoding (BigDataCloud), no
  API keys needed.
- `lib/extract.js` — best-effort readable-article extraction for the reader view.
- `lib/ai.js` — proxies the AI panel to the Anthropic Messages API (Claude Opus 4.8,
  adaptive thinking, web search tool), streaming answers back as server-sent events.
- `public/` — the browser app (vanilla HTML/CSS/JS, no build step).

Feed responses are cached in memory for 5 minutes; the ⟳ button forces a fresh pull.

## Tests

```bash
npm test
```

Runs the parser, opinion-filter, and clustering unit tests.
