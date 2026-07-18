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

### Alternative: use your GitHub / Copilot account instead

The AI panel can also run on **GitHub Models**, which works with a regular GitHub
account (free tier included; higher rate limits if you have a GitHub Copilot plan):

1. Create a fine-grained personal access token at
   https://github.com/settings/personal-access-tokens with the **Models: read**
   account permission.
2. In the app, open **Settings (⚙)**, switch the provider to **GitHub Models**, and
   paste the token (or start the server with `GITHUB_TOKEN` set).
3. Optional: set `GITHUB_MODEL` to pick a model (default `openai/gpt-4o`).

Trade-off: GitHub Models has no live web search, so broad questions like "what's
going on with X right now" are answered only from the headlines/article on screen.
The Anthropic provider searches the web for current reporting.

> Note: Microsoft 365 Copilot / Copilot Pro subscriptions don't expose an API that
> third-party apps can use, so they can't be plugged in directly — GitHub Models is
> the supported way to use a Microsoft/GitHub account here.

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
