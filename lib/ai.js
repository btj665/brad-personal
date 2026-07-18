// Server-side proxy for the news Q&A panel. Two providers:
//  - 'anthropic'  → Anthropic Messages API (Claude + web search), via the official SDK
//  - 'github'     → GitHub Models (works with your GitHub account / Copilot plan),
//                   OpenAI-compatible chat completions, no web search
// Both stream answers back to the browser as Server-Sent Events.

import Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_MODEL = 'claude-opus-4-8';
const GITHUB_MODEL = process.env.GITHUB_MODEL || 'openai/gpt-4o';
const GITHUB_ENDPOINT = 'https://models.github.ai/inference/chat/completions';
const MAX_CONTINUATIONS = 5;

const BASE_PROMPT = `You are the assistant inside a personal news reader. The user reads \
hard news (no opinion or editorial content) and asks you questions about a specific article, \
a news section's current headlines, or the news in general.

Guidelines:
- Be factual and neutral. Clearly separate reported facts from claims, allegations, and \
anything unverified. Never present speculation as fact.
- When article text or headlines are provided in the context, ground your answer in them first.
- Summaries should lead with what happened, then who/where/when, then why it matters.
- Keep answers readable and reasonably concise. Use short paragraphs and bullet lists \
where they help.`;

const ANTHROPIC_PROMPT = `${BASE_PROMPT}
- When the user asks about current events beyond the provided context (e.g. "what's going \
on with X"), use web search to find current reporting from credible outlets, and cite the \
sources you used.`;

const GITHUB_PROMPT = `${BASE_PROMPT}
- You cannot browse the web. If a question goes beyond the provided context and your \
knowledge, say so plainly and suggest the user open the relevant section or article so its \
content becomes available to you. Never invent recent events.`;

function buildContextBlock(context) {
  if (!context) return '';
  if (context.type === 'article' && context.article) {
    const a = context.article;
    const body = (a.paragraphs || []).join('\n\n').slice(0, 24000);
    return `<context>\nThe user is reading this article:\nTitle: ${a.title || ''}\nSource: ${a.siteName || a.sourceName || ''}\nPublished: ${a.published || ''}\nURL: ${a.url || ''}\n\n${body || a.description || '(full text unavailable — answer from the title/description)'}\n</context>`;
  }
  if (context.type === 'section' && context.headlines?.length) {
    const lines = context.headlines
      .slice(0, 40)
      .map((h) => `- ${h.title}${h.sources?.length ? ` (${h.sources.slice(0, 3).join(', ')})` : ''}`)
      .join('\n');
    return `<context>\nCurrent "${context.section}" section headlines in the user's news reader:\n${lines}\n</context>`;
  }
  return '';
}

function buildMessages(body) {
  const messages = [];
  for (const m of Array.isArray(body.history) ? body.history.slice(-8) : []) {
    if ((m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim()) {
      messages.push({ role: m.role, content: m.text });
    }
  }
  const contextBlock = buildContextBlock(body.context);
  messages.push({
    role: 'user',
    content: contextBlock ? `${contextBlock}\n\n${body.question}` : body.question,
  });
  return messages;
}

export async function handleAsk(body, auth, sse) {
  const { question } = body;
  if (!question || typeof question !== 'string') {
    sse({ type: 'error', text: 'No question provided.' });
    return;
  }
  if (!auth.apiKey) {
    sse({
      type: 'error',
      text: auth.provider === 'github'
        ? 'No GitHub token configured. Add a fine-grained personal access token (with "Models" read permission) in Settings (gear icon), or start the server with GITHUB_TOKEN set.'
        : 'No Anthropic API key configured. Set ANTHROPIC_API_KEY when starting the server, or add a key in Settings (gear icon).',
    });
    return;
  }

  if (auth.provider === 'github') return askGitHub(body, auth.apiKey, sse);
  return askAnthropic(body, auth.apiKey, sse);
}

// --- Anthropic (Claude + web search) ---------------------------------------

async function askAnthropic(body, apiKey, sse) {
  const client = new Anthropic({ apiKey });

  const params = {
    model: ANTHROPIC_MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: ANTHROPIC_PROMPT,
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }],
    messages: buildMessages(body),
  };

  try {
    for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
      const stream = client.messages.stream(params);

      stream.on('text', (delta) => sse({ type: 'text', text: delta }));
      stream.on('streamEvent', (event) => {
        if (
          event.type === 'content_block_start' &&
          event.content_block?.type === 'server_tool_use'
        ) {
          sse({ type: 'status', text: 'Searching the web…' });
        }
      });

      const message = await stream.finalMessage();

      // Server-side tool loop hit its iteration limit — resume automatically.
      if (message.stop_reason === 'pause_turn' && turn < MAX_CONTINUATIONS) {
        params.messages = [...params.messages, { role: 'assistant', content: message.content }];
        continue;
      }
      if (message.stop_reason === 'refusal') {
        sse({ type: 'text', text: '\n\n_I can’t help with that request._' });
      }
      sse({ type: 'done' });
      return;
    }
    sse({ type: 'done' });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      sse({ type: 'error', text: 'Invalid Anthropic API key. Check the key in Settings or your ANTHROPIC_API_KEY.' });
    } else if (err instanceof Anthropic.RateLimitError) {
      sse({ type: 'error', text: 'Rate limited by the Anthropic API — wait a moment and try again.' });
    } else if (err instanceof Anthropic.APIConnectionError) {
      sse({ type: 'error', text: 'Could not reach the Anthropic API. Check your network connection.' });
    } else if (err instanceof Anthropic.APIError) {
      sse({ type: 'error', text: `Anthropic API error (${err.status}): ${err.message}` });
    } else {
      sse({ type: 'error', text: `Unexpected error: ${err.message}` });
    }
  }
}

// --- GitHub Models (OpenAI-compatible, streams SSE chunks) ------------------

async function askGitHub(body, token, sse) {
  let res;
  try {
    res = await fetch(GITHUB_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: GITHUB_MODEL,
        stream: true,
        max_tokens: 4000,
        messages: [{ role: 'system', content: GITHUB_PROMPT }, ...buildMessages(body)],
      }),
    });
  } catch (err) {
    sse({ type: 'error', text: `Could not reach GitHub Models: ${err.message}` });
    return;
  }

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch { /* ignore */ }
    const msg =
      res.status === 401 ? 'GitHub token rejected. Create a fine-grained personal access token at github.com/settings/personal-access-tokens with the "Models" read permission, and paste it in Settings.'
      : res.status === 403 ? `GitHub Models refused the request (403)${detail ? `: ${detail}` : ''}. Make sure the token has the "Models" permission.`
      : res.status === 429 ? 'GitHub Models rate limit reached — the free tier allows a limited number of requests per day (higher with a Copilot plan). Try again later.'
      : res.status === 404 ? `Model "${GITHUB_MODEL}" not found on GitHub Models — set GITHUB_MODEL to an available model id.`
      : `GitHub Models error (HTTP ${res.status})${detail ? `: ${detail}` : ''}`;
    sse({ type: 'error', text: msg });
    return;
  }

  try {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const chunk = JSON.parse(payload);
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) sse({ type: 'text', text: delta });
        } catch { /* skip malformed keep-alive lines */ }
      }
    }
    sse({ type: 'done' });
  } catch (err) {
    sse({ type: 'error', text: `Stream interrupted: ${err.message}` });
  }
}
