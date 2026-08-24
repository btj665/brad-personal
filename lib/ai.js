// Server-side proxy to the Anthropic Messages API for the news Q&A panel.
// Streams answers back to the browser as Server-Sent Events.

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-4-8';
const MAX_CONTINUATIONS = 5;

const SYSTEM_PROMPT = `You are the assistant inside a personal news reader. The user reads \
hard news (no opinion or editorial content) and asks you questions about a specific article, \
a news section's current headlines, or the news in general.

Guidelines:
- Be strictly factual and politically neutral. The user wants to form their own opinions: \
report what happened, who said what, and what is verified — never editorialize, never \
signal approval or disapproval, and never tell the user how to feel about events.
- Clearly separate reported facts from claims, allegations, and anything unverified. \
Attribute every contested claim to who made it ("the White House said…", "the campaign \
claims…"). Never present speculation or framing as fact.
- Avoid loaded or emotive language (e.g. "slammed", "extremist", "controversial", \
"chaos", "landmark") unless quoting a source — and mark quotes as quotes.
- On politically contested topics, present the substantive positions of each side in \
comparable depth and neutral wording, and note where major outlets frame the story \
differently. Do not adjudicate which side is right on matters of values or policy; do \
state plainly what the documented, verifiable facts are.
- When the user asks about current events beyond the provided context (e.g. "what's going \
on with X"), use web search to find current reporting — prefer wire services and primary \
sources (official statements, court filings, data releases), draw from outlets across the \
political spectrum, and cite the sources you used.
- When article text or headlines are provided in the context, ground your answer in them \
first; search only if the question goes beyond that material. If the article itself uses \
slanted framing, summarize the underlying facts neutrally rather than echoing its tone.
- Summaries should lead with what happened, then who/where/when, then why it matters — \
"why it matters" in practical terms, not in partisan terms.
- Keep answers readable and reasonably concise. Use short paragraphs and bullet lists \
where they help.`;

function buildContextBlock(context) {
  if (!context) return '';
  if (context.type === 'article' && context.article) {
    const a = context.article;
    const body = (a.paragraphs || []).join('\n\n').slice(0, 24000);
    return `<context>\nThe user is reading this article:\nTitle: ${a.title || ''}\nSource: ${a.siteName || a.sourceName || ''}\nPublished: ${a.published || ''}\nURL: ${a.url || ''}\n\n${body || a.description || '(full text unavailable — use the title/description, or search if needed)'}\n</context>`;
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

export async function handleAsk(body, apiKey, sse) {
  const { question, context, history } = body;
  if (!question || typeof question !== 'string') {
    sse({ type: 'error', text: 'No question provided.' });
    return;
  }
  if (!apiKey) {
    sse({
      type: 'error',
      text: 'No Anthropic API key configured. Set ANTHROPIC_API_KEY when starting the server, or add a key in Settings (gear icon).',
    });
    return;
  }

  const client = new Anthropic({ apiKey });

  const messages = [];
  for (const m of Array.isArray(history) ? history.slice(-8) : []) {
    if ((m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim()) {
      messages.push({ role: m.role, content: m.text });
    }
  }
  const contextBlock = buildContextBlock(context);
  messages.push({
    role: 'user',
    content: contextBlock ? `${contextBlock}\n\n${question}` : question,
  });

  const params = {
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT,
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }],
    messages,
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
