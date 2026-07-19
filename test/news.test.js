import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseFeed, stripHtml, decodeEntities } from '../lib/rss.js';
import { isOpinion, clusterItems, titleTokens } from '../lib/news.js';

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
  <title>Test Feed</title>
  <item>
    <title><![CDATA[Wildfire forces evacuations in northern California]]></title>
    <link>https://example.com/news/wildfire-california</link>
    <description><![CDATA[<p>Thousands were told to <b>evacuate</b> as the fire spread.</p>]]></description>
    <pubDate>${new Date(Date.now() - 3600e3).toUTCString()}</pubDate>
    <media:content url="https://example.com/img/fire.jpg" type="image/jpeg"/>
    <category>US News</category>
  </item>
  <item>
    <title>California wildfire spreads, evacuations ordered - Example Wire</title>
    <link>https://example.com/news/ca-fire-2</link>
    <pubDate>${new Date(Date.now() - 7200e3).toUTCString()}</pubDate>
    <source url="https://wire.example.com">Example Wire</source>
  </item>
  <item>
    <title>Markets rally after rate decision</title>
    <link>https://example.com/business/markets-rally</link>
    <pubDate>${new Date(Date.now() - 1800e3).toUTCString()}</pubDate>
    <enclosure url="https://example.com/img/markets.png" type="image/png"/>
  </item>
  <item>
    <title>Opinion: Why the rate decision was wrong</title>
    <link>https://example.com/opinion/rates-wrong</link>
    <pubDate>${new Date().toUTCString()}</pubDate>
  </item>
  <item>
    <title>Old story from last month</title>
    <link>https://example.com/news/old</link>
    <pubDate>${new Date(Date.now() - 30 * 86400e3).toUTCString()}</pubDate>
  </item>
</channel>
</rss>`;

const ATOM_FIXTURE = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Test</title>
  <entry>
    <title>Storm system moves across the plains</title>
    <link href="https://example.org/storm"/>
    <summary>A strong storm system brought hail.</summary>
    <updated>2026-07-18T10:00:00Z</updated>
  </entry>
</feed>`;

test('parseFeed handles RSS 2.0 with CDATA, media, and Google-News-style source suffix', () => {
  const items = parseFeed(RSS_FIXTURE, 'Test Feed');
  assert.equal(items.length, 5);

  const [fire, fire2, markets] = items;
  assert.equal(fire.title, 'Wildfire forces evacuations in northern California');
  assert.equal(fire.image, 'https://example.com/img/fire.jpg');
  assert.match(fire.description, /Thousands were told to evacuate/);
  assert.equal(fire.sourceName, 'Test Feed');
  assert.ok(fire.timestamp > 0);

  // " - Example Wire" suffix stripped because it matches <source>
  assert.equal(fire2.title, 'California wildfire spreads, evacuations ordered');
  assert.equal(fire2.sourceName, 'Example Wire');
  assert.equal(fire2.sourceUrl, 'https://wire.example.com');

  assert.equal(markets.image, 'https://example.com/img/markets.png');
});

test('parseFeed handles Atom feeds', () => {
  const items = parseFeed(ATOM_FIXTURE, 'Atom Test');
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Storm system moves across the plains');
  assert.equal(items[0].link, 'https://example.org/storm');
  assert.ok(items[0].timestamp > 0);
});

test('opinion filter catches opinion URLs, title prefixes, and categories', () => {
  assert.ok(isOpinion({ title: 'Opinion: Why X is wrong', link: 'https://x.com/a', categories: [] }));
  assert.ok(isOpinion({ title: 'Normal title', link: 'https://x.com/opinion/piece', categories: [] }));
  assert.ok(isOpinion({ title: 'Normal title', link: 'https://x.com/a', categories: ['Editorial'] }));
  assert.ok(isOpinion({ title: 'Analysis: what it means', link: 'https://x.com/a', categories: [] }));
  assert.ok(!isOpinion({ title: 'Wildfire forces evacuations', link: 'https://x.com/news/fire', categories: ['US'] }));
});

test('clustering groups related headlines and keeps unrelated ones apart', () => {
  const now = Date.now();
  const items = [
    { title: 'Wildfire forces evacuations in northern California', link: 'a', sourceName: 'A', timestamp: now, description: '', image: '', categories: [] },
    { title: 'California wildfire spreads, evacuations ordered', link: 'b', sourceName: 'B', timestamp: now - 1000, description: '', image: 'img.jpg', categories: [] },
    { title: 'Northern California wildfire grows overnight', link: 'c', sourceName: 'C', timestamp: now - 2000, description: '', image: '', categories: [] },
    { title: 'Markets rally after rate decision', link: 'd', sourceName: 'A', timestamp: now, description: '', image: '', categories: [] },
  ];
  const clusters = clusterItems(items);
  assert.equal(clusters.length, 2);
  const fire = clusters.find((c) => /wildfire/i.test(c.title));
  assert.equal(fire.items.length, 3);
  assert.equal(fire.sourceCount, 3);
  assert.equal(fire.image, 'img.jpg');
  const markets = clusters.find((c) => /markets/i.test(c.title));
  assert.equal(markets.items.length, 1);
});

test('clustering dedups identical headlines', () => {
  const now = Date.now();
  const items = [
    { title: 'Same headline here', link: 'a', sourceName: 'A', timestamp: now, description: '', image: '', categories: [] },
    { title: 'Same headline here', link: 'b', sourceName: 'B', timestamp: now, description: '', image: '', categories: [] },
  ];
  const clusters = clusterItems(items);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].items.length, 1);
});

test('titleTokens drops stopwords and short tokens', () => {
  const t = titleTokens('The wildfire is spreading in the north of California');
  assert.ok(t.has('wildfire'));
  assert.ok(t.has('california'));
  assert.ok(!t.has('the'));
  assert.ok(!t.has('of'));
});

test('entity decoding and html stripping', () => {
  assert.equal(decodeEntities('a &amp; b &#39;quoted&#x27; &mdash; ok'), "a & b 'quoted' — ok");
  assert.equal(stripHtml('<p>Hello <b>world</b></p> <script>x()</script>'), 'Hello world');
});

test('WMO weather codes map to labels', async () => {
  const { describeWmo } = await import('../lib/weather.js');
  assert.deepEqual(describeWmo(0), ['Clear', '☀️']);
  assert.deepEqual(describeWmo(95), ['Thunderstorm', '⛈️']);
  assert.equal(describeWmo(9999)[0], 'Unknown');
});
