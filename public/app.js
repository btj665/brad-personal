/* Newsflow — frontend app logic */
(() => {
  'use strict';

  // ---------- state ----------
  const state = {
    section: 'world',
    viewMode: localStorage.getItem('viewMode') || 'bubbles', // 'bubbles' | 'list'
    location: safeParse(localStorage.getItem('location')),
    excluded: new Set(safeParse(localStorage.getItem('excludedSources')) || []),
    sections: {},          // section -> {clusters, errors, fetchedAt}
    navStack: [],          // view descriptors for back navigation
    currentView: { kind: 'section' },
    currentArticle: null,  // extracted article when reading one
    aiHistory: [],
    aiBusy: false,
  };

  const $ = (sel) => document.querySelector(sel);
  const viewEl = $('#view');
  const statusBar = $('#status-bar');

  function safeParse(s) { try { return s ? JSON.parse(s) : null; } catch { return null; } }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  // Google News feed links are redirect pages the reader can't extract —
  // those open at the original source in a new tab instead.
  function isGoogleRedirect(link) {
    try { return new URL(link).hostname.endsWith('news.google.com'); } catch { return false; }
  }

  // Outlet favicon via source URL or article link (skips aggregator domains).
  function faviconFor(item) {
    try {
      const host = new URL(item.sourceUrl || item.link).hostname;
      if (!host || host.endsWith('news.google.com')) return '';
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
    } catch { return ''; }
  }
  function clusterFavicons(cluster, max = 3) {
    const seen = new Set();
    const icons = [];
    for (const it of cluster.items) {
      const url = faviconFor(it);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      icons.push(url);
      if (icons.length >= max) break;
    }
    return icons;
  }

  function timeAgo(ts) {
    if (!ts) return '';
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  }

  // ---------- section loading ----------
  async function loadSection(section, { fresh = false } = {}) {
    const cached = state.sections[section];
    if (cached && !fresh && Date.now() - cached.fetchedAt < 5 * 60 * 1000) return cached;

    setStatus(`Loading ${sectionLabel(section)} news…`);
    const params = new URLSearchParams({ section });
    if (fresh) params.set('fresh', '1');
    if (state.excluded.size) params.set('exclude', [...state.excluded].join('|'));
    const loc = state.location;
    if (loc) {
      if (loc.city) params.set('city', loc.city);
      if (loc.state) params.set('state', loc.state);
      if (loc.stateAbbr) params.set('stateAbbr', loc.stateAbbr);
      if (loc.zip) params.set('zip', loc.zip);
    }
    try {
      const res = await fetch(`/api/news?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      data.fetchedAt = Date.now();
      state.sections[section] = data;
      return data;
    } finally {
      setStatus('');
    }
  }

  function sectionLabel(s) {
    return { world: 'World', us: 'U.S.', regional: 'Regional', local: 'Local' }[s] || s;
  }

  function setStatus(text) {
    statusBar.textContent = text;
    statusBar.classList.toggle('hidden', !text);
  }

  // ---------- rendering: section (bubbles or list) ----------
  async function showSection(section, { fresh = false, push = false } = {}) {
    if (push) pushNav();
    state.section = section;
    state.currentView = { kind: 'section' };
    state.currentArticle = null;
    document.querySelectorAll('.tab').forEach((t) =>
      t.classList.toggle('active', t.dataset.section === section));

    if ((section === 'regional' || section === 'local') && !state.location) {
      renderNeedsLocation(section);
      updateAiContext();
      return;
    }

    viewEl.innerHTML = '<div class="empty-state"><div class="big">🗞️</div>Gathering the news…</div>';
    let data;
    try {
      data = await loadSection(section, { fresh });
    } catch (err) {
      viewEl.innerHTML = `<div class="empty-state"><div class="big">⚠️</div>Couldn't load news: ${esc(err.message)}</div>`;
      return;
    }
    if (state.section !== section || state.currentView.kind !== 'section') return; // user navigated away

    if (data.needsLocation) { renderNeedsLocation(section); return; }
    if (!data.clusters.length) {
      viewEl.innerHTML = `<div class="empty-state"><div class="big">🌫️</div>No stories found right now.${data.errors?.length ? `<p class="muted">${esc(data.errors.join(' · '))}</p>` : ''}</div>`;
      return;
    }

    if (state.viewMode === 'bubbles') renderBubbles(data);
    else renderList(data);
    updateAiContext();

    if (data.errors?.length) {
      setStatus(`Some feeds were unavailable: ${data.errors.join(' · ')}`);
      setTimeout(() => setStatus(''), 6000);
    }
  }

  function renderNeedsLocation(section) {
    viewEl.innerHTML = `
      <div class="empty-state">
        <div class="big">📍</div>
        <p>${sectionLabel(section)} news needs your location.</p>
        <button class="btn primary" id="set-location-cta">Set your location</button>
      </div>`;
    $('#set-location-cta').addEventListener('click', openLocationDialog);
  }

  // Spiral-packing bubble layout.
  function renderBubbles(data) {
    const clusters = data.clusters.slice(0, 24);
    viewEl.innerHTML = '<div id="bubble-field"></div>';
    const field = $('#bubble-field');
    const W = Math.max(field.clientWidth || viewEl.clientWidth, 320);

    const weights = clusters.map((c) => c.weight);
    const maxW = Math.max(...weights);
    const minW = Math.min(...weights);
    const minD = W < 600 ? 100 : 120;
    const maxD = W < 600 ? 170 : 230;
    const size = (w) =>
      maxW === minW ? (minD + maxD) / 2 : minD + ((w - minW) / (maxW - minW)) * (maxD - minD);

    const placed = [];
    const cx = W / 2;
    let fieldH = 600;

    clusters.forEach((c, i) => {
      const d = size(c.weight);
      const r = d / 2;
      // walk an Archimedean spiral until no overlap
      let x = cx, y = 300, angle = i * 2.4, step = 0;
      while (step < 3000) {
        const rad = 6 + step * 1.6;
        x = cx + rad * Math.cos(angle);
        y = 300 + rad * 0.72 * Math.sin(angle);
        const fits =
          x - r >= 8 && x + r <= W - 8 && y - r >= 8 &&
          placed.every((p) => Math.hypot(p.x - x, p.y - y) >= p.r + r + 10);
        if (fits) break;
        angle += 0.35;
        step++;
      }
      placed.push({ x, y, r });
      fieldH = Math.max(fieldH, y + r + 40);

      // curated hue palette: indigo / periwinkle / teal / plum / slate blue
      const HUES = [222, 258, 195, 286, 240, 205, 270, 182];
      const hue = HUES[i % HUES.length];
      const coverage = Math.min(c.sourceCount / 6, 1);

      const wrap = document.createElement('div');
      wrap.className = 'bubble-wrap';
      wrap.style.cssText = `left:${x - r}px; top:${y - r}px; width:${d}px; height:${d}px;` +
        `--h:${hue}; --cov:${coverage.toFixed(3)};` +
        `--pop-delay:${Math.min(i * 55, 900)}ms;` +
        `--drift-dur:${10 + (i % 5) * 1.7}s; --drift-delay:${(i % 7) * -1.4}s;`;

      const el = document.createElement('div');
      el.className = `bubble${c.image ? ' has-img' : ''}`;
      el.style.cssText = `padding:${Math.round(d * 0.15)}px;` +
        `font-size:${Math.max(11.5, d / 12.5)}px;` +
        (c.image ? `--img:url("${encodeURI(c.image)}");` : '');
      const icons = clusterFavicons(c);
      el.innerHTML = `
        ${i === 0 ? '<span class="b-kicker">Top story</span>' : ''}
        <span class="b-title" style="-webkit-line-clamp:${d > 175 ? 5 : 4}">${esc(c.title)}</span>
        <span class="b-meta">${c.sourceCount} source${c.sourceCount === 1 ? '' : 's'} · ${timeAgo(c.latest)}</span>
        ${icons.length ? `<span class="b-sources">${icons.map((u) =>
          `<img src="${esc(u)}" alt="" loading="lazy" onerror="this.remove()">`).join('')}${
          c.sourceCount > icons.length ? `<i>+${c.sourceCount - icons.length}</i>` : ''}</span>` : ''}`;
      el.title = c.title;
      el.addEventListener('click', () => showStory(c));
      wrap.appendChild(el);
      field.appendChild(wrap);
    });
    field.style.minHeight = `${fieldH}px`;
  }

  function renderList(data) {
    viewEl.innerHTML = `<div class="view-pad">${data.clusters.map((c, i) => `
      <div class="story-card" data-i="${i}">
        ${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
        <div class="card-body">
          <p class="card-title">${esc(c.title)}</p>
          <div class="card-meta">
            <span class="badge">${c.items.length} article${c.items.length === 1 ? '' : 's'}</span>
            ${esc(c.sources.slice(0, 3).join(' · '))} · ${timeAgo(c.latest)}
          </div>
        </div>
      </div>`).join('')}
    </div>`;
    viewEl.querySelectorAll('.story-card').forEach((el) =>
      el.addEventListener('click', () => showStory(data.clusters[Number(el.dataset.i)])));
  }

  // ---------- story view ----------
  function showStory(cluster) {
    pushNav();
    state.currentView = { kind: 'story', cluster };
    state.currentArticle = null;
    viewEl.innerHTML = `
      <div class="view-pad">
        <button class="back-btn" id="back-btn">← Back</button>
        <h2 style="line-height:1.3">${esc(cluster.title)}</h2>
        <p class="muted">${cluster.items.length} article${cluster.items.length === 1 ? '' : 's'} from
          ${esc(cluster.sources.join(', ') || 'various sources')}</p>
        ${cluster.items.map((a, i) => `
          <div class="article-row" data-i="${i}" title="${isGoogleRedirect(a.link) ? 'Opens at the original source in a new tab' : ''}">
            ${a.image ? `<img src="${esc(a.image)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
            <div class="card-body">
              <p class="card-title">${esc(a.title)}${isGoogleRedirect(a.link) ? ' <span class="ext-mark">↗</span>' : ''}</p>
              <div class="card-meta">${(() => { const f = faviconFor(a); return f ? `<img class="src-ico" src="${esc(f)}" alt="" onerror="this.remove()">` : ''; })()}${esc(a.sourceName || '')} ${a.timestamp ? `· ${timeAgo(a.timestamp)}` : ''}</div>
              ${a.description ? `<p class="card-desc">${esc(a.description)}</p>` : ''}
            </div>
          </div>`).join('')}
      </div>`;
    $('#back-btn').addEventListener('click', goBack);
    viewEl.querySelectorAll('.article-row').forEach((el) =>
      el.addEventListener('click', () => {
        const item = cluster.items[Number(el.dataset.i)];
        if (isGoogleRedirect(item.link)) window.open(item.link, '_blank', 'noopener');
        else showArticle(item);
      }));
    updateAiContext();
    viewEl.parentElement.scrollTop = 0;
  }

  // ---------- article view ----------
  async function showArticle(item) {
    pushNav();
    state.currentView = { kind: 'article', item };
    viewEl.innerHTML = `
      <div class="view-pad article-view">
        <button class="back-btn" id="back-btn">← Back</button>
        <div class="card-meta">${esc(item.sourceName || '')} ${item.timestamp ? `· ${timeAgo(item.timestamp)}` : ''}</div>
        <h1>${esc(item.title)}</h1>
        <p class="muted">Loading article…</p>
      </div>`;
    $('#back-btn').addEventListener('click', goBack);
    viewEl.parentElement.scrollTop = 0;

    let art = null;
    try {
      const res = await fetch(`/api/article?url=${encodeURIComponent(item.link)}`);
      art = await res.json();
    } catch { /* fall through to link-out view */ }
    if (state.currentView.kind !== 'article' || state.currentView.item !== item) return;

    state.currentArticle = {
      title: art?.title || item.title,
      url: art?.url || item.link,
      siteName: art?.siteName || item.sourceName,
      published: art?.published || '',
      image: art?.image || item.image || '',
      paragraphs: art?.extracted ? art.paragraphs : [],
      description: item.description || '',
    };
    const a = state.currentArticle;

    viewEl.innerHTML = `
      <div class="view-pad article-view">
        <button class="back-btn" id="back-btn">← Back</button>
        <div class="card-meta">${esc(a.siteName || '')} ${item.timestamp ? `· ${timeAgo(item.timestamp)}` : ''}</div>
        <h1>${esc(item.title)}</h1>
        <div class="article-actions">
          <a class="btn" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">Open original ↗</a>
          <button class="btn primary" id="ask-article-btn">✦ Ask about this article</button>
        </div>
        ${a.image ? `<img class="lead-img" src="${esc(a.image)}" alt="" onerror="this.remove()">` : ''}
        ${a.paragraphs.length
          ? a.paragraphs.map((p) => `<p class="body-p">${esc(p)}</p>`).join('')
          : `<p class="body-p">${esc(a.description || '')}</p>
             <p class="muted">Full text couldn't be extracted from this site — use “Open original”
             to read it there. The AI panel can still answer questions and will search for
             coverage of this story if needed.</p>`}
      </div>`;
    $('#back-btn').addEventListener('click', goBack);
    $('#ask-article-btn').addEventListener('click', () => {
      openAiPanel();
      $('#ai-input').focus();
    });
    updateAiContext();
  }

  // ---------- navigation ----------
  function pushNav() {
    state.navStack.push({ view: state.currentView, article: state.currentArticle });
  }
  function goBack() {
    const prev = state.navStack.pop();
    if (!prev) return showSection(state.section);
    state.currentArticle = prev.article;
    const v = prev.view;
    if (v.kind === 'story') {
      // re-render without pushing nav again
      const stack = state.navStack;
      showStory(v.cluster);
      state.navStack = stack;
      state.currentView = v;
    } else {
      showSection(state.section);
    }
  }

  // ---------- location ----------
  const locDialog = $('#location-dialog');
  function openLocationDialog() {
    $('#location-error').classList.add('hidden');
    locDialog.showModal();
  }
  function setLocation(loc) {
    state.location = loc;
    localStorage.setItem('location', JSON.stringify(loc));
    $('#location-chip').textContent = `📍 ${loc.label}`;
    delete state.sections.regional;
    delete state.sections.local;
    locDialog.close();
    if (state.section === 'regional' || state.section === 'local') showSection(state.section);
  }
  function locError(msg) {
    const el = $('#location-error');
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  $('#location-chip').addEventListener('click', openLocationDialog);
  $('#location-cancel').addEventListener('click', () => locDialog.close());
  $('#use-geolocation').addEventListener('click', () => {
    if (!navigator.geolocation) return locError('Geolocation is not available in this browser — enter a ZIP instead.');
    $('#use-geolocation').textContent = 'Locating…';
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`/api/geo?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error || 'lookup failed');
          setLocation(data);
        } catch (err) {
          locError(`Couldn't resolve your location (${err.message}) — try a ZIP code.`);
        } finally {
          $('#use-geolocation').textContent = 'Use my current location';
        }
      },
      () => {
        $('#use-geolocation').textContent = 'Use my current location';
        locError('Location permission denied — enter a ZIP code instead.');
      },
      { timeout: 10000 }
    );
  });
  $('#zip-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const zip = $('#zip-input').value.trim();
    if (!/^\d{5}$/.test(zip)) return locError('Enter a 5-digit ZIP code.');
    try {
      const res = await fetch(`/api/geo?zip=${zip}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'lookup failed');
      setLocation(data);
    } catch (err) {
      locError(`ZIP lookup failed: ${err.message}`);
    }
  });

  // ---------- AI panel ----------
  const aiMessages = $('#ai-messages');
  const aiInput = $('#ai-input');
  const aiStatus = $('#ai-status');

  const aiPanel = $('#ai-panel');
  const aiBackdrop = $('#ai-backdrop');
  const isNarrow = () => window.matchMedia('(max-width: 900px)').matches;

  function setAiPanel(open) {
    aiPanel.classList.toggle('collapsed', !open);
    $('#ai-toggle').classList.toggle('active', open);
    aiBackdrop.classList.toggle('show', open && isNarrow());
  }
  function openAiPanel() { setAiPanel(true); }

  $('#ai-toggle').addEventListener('click', () =>
    setAiPanel(aiPanel.classList.contains('collapsed')));
  $('#ai-close').addEventListener('click', () => setAiPanel(false));
  aiBackdrop.addEventListener('click', () => setAiPanel(false));

  // Swipe right to dismiss on touch screens.
  let touch = null;
  aiPanel.addEventListener('touchstart', (e) => {
    if (!isNarrow() || e.touches.length !== 1) return;
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, active: false };
  }, { passive: true });
  aiPanel.addEventListener('touchmove', (e) => {
    if (!touch) return;
    const dx = e.touches[0].clientX - touch.x;
    const dy = e.touches[0].clientY - touch.y;
    if (!touch.active) {
      if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.4) return; // let scrolls through
      touch.active = true;
      aiPanel.classList.add('dragging');
    }
    touch.dx = Math.max(0, dx);
    aiPanel.style.transform = `translateX(${touch.dx}px)`;
  }, { passive: true });
  aiPanel.addEventListener('touchend', () => {
    if (!touch) return;
    aiPanel.classList.remove('dragging');
    aiPanel.style.transform = '';
    if (touch.active && touch.dx > 70) setAiPanel(false);
    touch = null;
  });
  $('#ai-clear').addEventListener('click', () => {
    state.aiHistory = [];
    aiMessages.innerHTML = '';
  });

  function updateAiContext() {
    const el = $('#ai-context');
    if (state.currentView.kind === 'article' && state.currentArticle) {
      el.textContent = `Context: 📄 ${state.currentArticle.title}`;
    } else if (state.currentView.kind === 'story') {
      el.textContent = `Context: 🧵 ${state.currentView.cluster.title}`;
    } else {
      el.textContent = `Context: 🗞️ ${sectionLabel(state.section)} headlines`;
    }
  }

  function currentContext() {
    if (state.currentView.kind === 'article' && state.currentArticle) {
      return { type: 'article', article: state.currentArticle };
    }
    if (state.currentView.kind === 'story') {
      const c = state.currentView.cluster;
      return {
        type: 'section',
        section: `story: ${c.title}`,
        headlines: c.items.map((a) => ({ title: a.title, sources: [a.sourceName] })),
      };
    }
    const data = state.sections[state.section];
    return {
      type: 'section',
      section: sectionLabel(state.section),
      headlines: (data?.clusters || []).map((c) => ({ title: c.title, sources: c.sources })),
    };
  }

  // Minimal markdown renderer (escapes first, then formats).
  function renderMarkdown(text) {
    const lines = esc(text).split('\n');
    const out = [];
    let inList = false;
    for (const line of lines) {
      const li = line.match(/^\s*[-*]\s+(.*)/);
      if (li) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push(`<li>${inline(li[1])}</li>`);
        continue;
      }
      if (inList) { out.push('</ul>'); inList = false; }
      const h = line.match(/^(#{1,3})\s+(.*)/);
      if (h) { out.push(`<h3>${inline(h[2])}</h3>`); continue; }
      if (line.trim()) out.push(`<p>${inline(line)}</p>`);
    }
    if (inList) out.push('</ul>');
    return out.join('');

    function inline(s) {
      return s
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
          '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    }
  }

  function addMessage(role, text, cls = '') {
    const el = document.createElement('div');
    el.className = `msg ${role} ${cls}`;
    if (role === 'assistant') el.innerHTML = renderMarkdown(text);
    else el.textContent = text;
    aiMessages.appendChild(el);
    aiMessages.scrollTop = aiMessages.scrollHeight;
    return el;
  }

  $('#ai-form').addEventListener('submit', (e) => { e.preventDefault(); sendQuestion(); });
  aiInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuestion(); }
  });

  async function sendQuestion() {
    const question = aiInput.value.trim();
    if (!question || state.aiBusy) return;
    aiInput.value = '';
    state.aiBusy = true;
    $('#ai-send').disabled = true;

    addMessage('user', question);
    state.aiHistory.push({ role: 'user', text: question });
    const answerEl = addMessage('assistant', '');
    let answer = '';

    const headers = { 'content-type': 'application/json' };
    const userKey = localStorage.getItem('apiKey');
    if (userKey) headers['x-user-api-key'] = userKey;

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          question,
          context: currentContext(),
          history: state.aiHistory.slice(0, -1),
        }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop();
        for (const evt of events) {
          const line = evt.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          const data = JSON.parse(line.slice(6));
          if (data.type === 'text') {
            answer += data.text;
            answerEl.innerHTML = renderMarkdown(answer);
            aiMessages.scrollTop = aiMessages.scrollHeight;
            aiStatus.classList.add('hidden');
          } else if (data.type === 'status') {
            aiStatus.textContent = data.text.replace(/…$/, '');
            aiStatus.classList.remove('hidden');
          } else if (data.type === 'error') {
            answerEl.classList.add('error');
            answerEl.textContent = data.text;
            answer = '';
          }
        }
      }
    } catch (err) {
      answerEl.classList.add('error');
      answerEl.textContent = `Request failed: ${err.message}`;
    } finally {
      aiStatus.classList.add('hidden');
      if (answer) state.aiHistory.push({ role: 'assistant', text: answer });
      else if (!answerEl.classList.contains('error')) answerEl.remove();
      state.aiBusy = false;
      $('#ai-send').disabled = false;
    }
  }

  // ---------- sources ----------
  const sourcesDialog = $('#sources-dialog');

  async function openSourcesDialog() {
    let data = state.sections[state.section];
    if (!data?.sources) {
      try { data = await loadSection(state.section); } catch { data = null; }
    }
    $('#sources-section-name').textContent = sectionLabel(state.section);
    const list = $('#sources-list');
    const sources = data?.sources || [];
    if (!sources.length) {
      list.innerHTML = '<p class="muted">No sources loaded yet — open a section with stories first.</p>';
    } else {
      list.innerHTML = sources.map((s, i) => `
        <label class="source-row">
          <input type="checkbox" data-name="${esc(s.name)}" ${state.excluded.has(s.name) ? '' : 'checked'}>
          <span class="source-name">${esc(s.name)}</span>
          <span class="source-count">${s.count}</span>
        </label>`).join('');
    }
    sourcesDialog.showModal();
  }

  $('#sources-btn').addEventListener('click', openSourcesDialog);
  $('#sources-all').addEventListener('click', () => {
    sourcesDialog.querySelectorAll('input[type=checkbox]').forEach((c) => { c.checked = true; });
  });
  $('#sources-none').addEventListener('click', () => {
    sourcesDialog.querySelectorAll('input[type=checkbox]').forEach((c) => { c.checked = false; });
  });
  $('#sources-cancel').addEventListener('click', () => sourcesDialog.close());
  $('#sources-apply').addEventListener('click', () => {
    sourcesDialog.querySelectorAll('input[type=checkbox]').forEach((c) => {
      const name = c.dataset.name;
      if (c.checked) state.excluded.delete(name);
      else state.excluded.add(name);
    });
    localStorage.setItem('excludedSources', JSON.stringify([...state.excluded]));
    state.sections = {}; // re-cluster every section with the new source set
    sourcesDialog.close();
    updateSourcesChip();
    state.navStack = [];
    showSection(state.section);
  });

  function updateSourcesChip() {
    $('#sources-btn').textContent = state.excluded.size
      ? `📡 Sources (${state.excluded.size} off)`
      : '📡 Sources';
  }

  // ---------- settings ----------
  const settingsDialog = $('#settings-dialog');
  $('#settings-btn').addEventListener('click', () => {
    $('#api-key-input').value = localStorage.getItem('apiKey') || '';
    settingsDialog.showModal();
  });
  $('#settings-save').addEventListener('click', () => {
    const key = $('#api-key-input').value.trim();
    if (key) localStorage.setItem('apiKey', key);
    else localStorage.removeItem('apiKey');
    settingsDialog.close();
  });
  $('#settings-cancel').addEventListener('click', () => settingsDialog.close());

  // ---------- top bar wiring ----------
  document.querySelectorAll('.tab').forEach((t) =>
    t.addEventListener('click', () => {
      state.navStack = [];
      showSection(t.dataset.section);
    }));

  $('#refresh-btn').addEventListener('click', async () => {
    const btn = $('#refresh-btn');
    btn.classList.add('spinning');
    state.navStack = [];
    try { await showSection(state.section, { fresh: true }); }
    finally { btn.classList.remove('spinning'); }
  });

  $('#view-toggle').addEventListener('click', () => {
    state.viewMode = state.viewMode === 'bubbles' ? 'list' : 'bubbles';
    localStorage.setItem('viewMode', state.viewMode);
    if (state.currentView.kind === 'section') showSection(state.section);
  });

  // ---------- init ----------
  if (state.location?.label) $('#location-chip').textContent = `📍 ${state.location.label}`;
  updateSourcesChip();
  if (isNarrow()) setAiPanel(false); // phones start with the panel closed
  updateAiContext();
  showSection('world');
})();
