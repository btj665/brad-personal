// Builds a shareable Newsflow distribution in dist/.
//
//   npm run dist        → dist/Newsflow.zip   portable app (recipients need Node,
//                                             the Start script auto-installs it via winget)
//   npm run dist:exe    → dist/Newsflow.zip   standalone Windows .exe (no Node needed) —
//                                             run this on a machine with internet access
//                                             (pkg downloads a Node base binary once)

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const STAGE = path.join(DIST, 'Newsflow');
const EXE = process.argv.includes('--exe');

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  const r = spawnSync(cmd, { shell: true, stdio: 'inherit', cwd: ROOT, ...opts });
  if (r.status !== 0) {
    console.error(`Command failed: ${cmd}`);
    process.exit(1);
  }
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });

const CONFIG_SAMPLE = `{
  "anthropicApiKey": "",
  "port": 8360
}
`;

if (EXE) {
  // 1. Bundle the ESM server + deps into one CommonJS file.
  fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
  run(
    'npx esbuild server.js --bundle --platform=node --format=cjs ' +
    '--outfile=build/newsflow.cjs ' +
    '--banner:js="const __importMetaUrl = require(\'url\').pathToFileURL(__filename).href;" ' +
    '--define:import.meta.url=__importMetaUrl'
  );
  // 2. Wrap it in a standalone Windows executable.
  run('npx pkg build/newsflow.cjs --targets node22-win-x64 --output "' +
    path.join(STAGE, 'Newsflow.exe') + '"');
  // 3. Static UI ships next to the exe so it stays editable.
  fs.cpSync(path.join(ROOT, 'public'), path.join(STAGE, 'public'), { recursive: true });
  fs.writeFileSync(path.join(STAGE, 'newsflow.config.sample.json'), CONFIG_SAMPLE);
  fs.writeFileSync(path.join(STAGE, 'README-FIRST.txt'),
`NEWSFLOW — personal news reader
================================

TO START:  double-click Newsflow.exe
Your browser opens automatically at http://localhost:8360.
Keep the black console window open — that's the server. Close it to quit.

(Windows may show a "Windows protected your PC" SmartScreen warning the first
time because the app isn't code-signed. Click "More info" → "Run anyway".
Also click "Allow access" if the Windows Firewall prompt appears — needed for
phone/tablet access.)

AI PANEL (optional):
Ask questions about the news using Claude. Either click the gear icon (⚙) in
the app and paste an Anthropic API key (platform.claude.com), or rename
newsflow.config.sample.json to newsflow.config.json and put the key in it.
News reading works fine without a key.

PHONES / TABLETS:
The console window shows an "On your network" address — open it on any device
on the same Wi-Fi. Use "Add to Home Screen" to install it like an app.
`);
} else {
  // Portable app: server + prod dependencies + start scripts.
  fs.cpSync(path.join(ROOT, 'server.js'), path.join(STAGE, 'server.js'));
  fs.cpSync(path.join(ROOT, 'package.json'), path.join(STAGE, 'package.json'));
  fs.cpSync(path.join(ROOT, 'lib'), path.join(STAGE, 'lib'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'public'), path.join(STAGE, 'public'), { recursive: true });

  // Copy only production dependencies (resolved via npm so transitives come along).
  const ls = spawnSync('npm ls --omit=dev --all --parseable', { shell: true, cwd: ROOT, encoding: 'utf8' });
  const depPaths = (ls.stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.includes(`node_modules${path.sep}`));
  if (!depPaths.length) {
    console.error('Could not resolve production dependencies — did you run npm install?');
    process.exit(1);
  }
  for (const p of depPaths) {
    const rel = path.relative(path.join(ROOT, 'node_modules'), p);
    fs.cpSync(p, path.join(STAGE, 'node_modules', rel), { recursive: true });
    console.log(`  packed dependency: ${rel}`);
  }

  fs.writeFileSync(path.join(STAGE, 'newsflow.config.sample.json'), CONFIG_SAMPLE);
  fs.writeFileSync(path.join(STAGE, 'Start Newsflow.bat'),
`@echo off\r
title Newsflow\r
cd /d "%~dp0"\r
where node >nul 2>nul\r
if %errorlevel% neq 0 (\r
  echo Node.js is not installed. Installing it now with winget...\r
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements\r
  echo.\r
  echo If Node.js just finished installing, close this window and\r
  echo run "Start Newsflow.bat" again.\r
  pause\r
  exit /b\r
)\r
set NEWSFLOW_OPEN=1\r
echo Starting Newsflow... keep this window open; close it to stop the server.\r
node server.js\r
pause\r
`);
  const sh = path.join(STAGE, 'start-newsflow.sh');
  fs.writeFileSync(sh, `#!/bin/sh\ncd "$(dirname "$0")"\nNEWSFLOW_OPEN=1 exec node server.js\n`);
  fs.chmodSync(sh, 0o755);

  fs.writeFileSync(path.join(STAGE, 'README-FIRST.txt'),
`NEWSFLOW — personal news reader
================================

TO START (Windows):  double-click "Start Newsflow.bat"
Your browser opens automatically at http://localhost:8360.
Keep the black console window open — that's the server. Close it to quit.

The first run needs Node.js; if it's missing, the script installs it for you
(you may need to run the script twice). Click "Allow access" if the Windows
Firewall prompt appears — that's what lets phones/tablets connect.

Mac/Linux: run ./start-newsflow.sh instead.

AI PANEL (optional):
Ask questions about the news using Claude. Either click the gear icon (⚙) in
the app and paste an Anthropic API key (platform.claude.com), or rename
newsflow.config.sample.json to newsflow.config.json and put the key in it.
News reading works fine without a key.

PHONES / TABLETS:
The console window shows an "On your network" address — open it on any device
on the same Wi-Fi. Use "Add to Home Screen" to install it like an app.
`);
}

// Zip the staged folder.
const zipPath = path.join(DIST, 'Newsflow.zip');
if (process.platform === 'win32') {
  run(`powershell -NoProfile -Command "Compress-Archive -Path '${STAGE}' -DestinationPath '${zipPath}' -Force"`);
} else {
  const hasZip = spawnSync('zip -v', { shell: true, stdio: 'ignore' }).status === 0;
  if (hasZip) run(`cd "${DIST}" && zip -qr Newsflow.zip Newsflow`);
  else run(`cd "${DIST}" && python3 -m zipfile -c Newsflow.zip Newsflow`);
}
console.log(`\nDone → ${zipPath}`);
console.log('Share that zip. Recipients: unzip, then ' +
  (EXE ? 'double-click Newsflow.exe.' : 'double-click "Start Newsflow.bat".'));
