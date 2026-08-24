// Outlet political-lean ratings, used to balance and label coverage — not to
// filter it. Ratings follow the rough consensus of media-bias raters
// (AllSides, Ad Fontes) for each outlet's NEWS desk, not its opinion pages.
// "center" here means wire-service-style/least-slanted, not "correct".

const PATTERNS = {
  left: [
    'the guardian', 'guardian', 'msnbc', 'huffpost', 'huffington', 'vox',
    'mother jones', 'the new yorker', 'slate', 'daily beast', 'salon',
    'the intercept', 'new republic',
  ],
  'lean-left': [
    'npr', 'new york times', 'nytimes', 'washington post', 'cnn', 'cbs news',
    'abc news', 'nbc news', 'politico', 'time', 'bloomberg', 'axios',
    'usa today', 'los angeles times', 'boston globe', 'the atlantic',
    'al jazeera', 'bbc',
  ],
  center: [
    'associated press', 'ap news', 'reuters', 'upi', 'united press',
    'pbs', 'newshour', 'christian science monitor', 'csmonitor', 'the hill',
    'newsweek', 'forbes', 'marketwatch', 'c-span', 'newsnation',
  ],
  'lean-right': [
    'wall street journal', 'wsj', 'washington examiner', 'new york post',
    'national review', 'the dispatch', 'reason',
  ],
  right: [
    'fox news', 'foxnews', 'washington times', 'daily wire', 'breitbart',
    'newsmax', 'daily caller', 'the federalist', 'epoch times', 'daily mail',
    'oan', 'one america',
  ],
};

// Simplified three-bucket view used by the UI.
const BUCKET = {
  left: 'left', 'lean-left': 'left',
  center: 'center',
  'lean-right': 'right', right: 'right',
};

export function leanOf(sourceName) {
  if (!sourceName) return 'unrated';
  const n = sourceName.toLowerCase();
  for (const [lean, names] of Object.entries(PATTERNS)) {
    if (names.some((p) => n.includes(p))) return lean;
  }
  return 'unrated';
}

export function leanBucket(sourceName) {
  return BUCKET[leanOf(sourceName)] || 'unrated';
}

export function balanceCounts(items) {
  const counts = { left: 0, center: 0, right: 0, unrated: 0 };
  const seen = new Set();
  for (const it of items) {
    const name = it.sourceName || '';
    if (seen.has(name)) continue; // count outlets, not articles
    seen.add(name);
    counts[leanBucket(name)]++;
  }
  return counts;
}
