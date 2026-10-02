// Builds the shareable package: a single zip a coworker can unzip and double-click
// to play, with no toolchain and no internet.
//
//   npm run package
//
// It runs the production build, lays out a `the-tables/` folder with the built
// site, the little static server, the three launchers and the readme, and zips
// it. The launchers detect Node.js and offer to install it, so the only thing the
// recipient needs is a browser and — the one dependency we can't remove without
// shipping a 50MB runtime per platform — Node, which the launcher handles.

import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, chmodSync, existsSync, statSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const stage = join(root, 'packaging', 'build')
const out = join(stage, 'the-tables')
const zipPath = join(root, 'the-tables.zip')

const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' })
const step = (msg) => console.log(`\n→ ${msg}`)

// 1. A fresh production build.
step('Building the site (npm run build)…')
run('npm', ['run', 'build'])
if (!existsSync(join(root, 'dist', 'index.html'))) {
  console.error('\nBuild produced no dist/index.html — aborting.')
  process.exit(1)
}

// 2. Lay out the package.
step('Assembling the package…')
rmSync(stage, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

cpSync(join(root, 'dist'), join(out, 'app'), { recursive: true })
cpSync(join(root, 'packaging', 'serve.mjs'), join(out, 'serve.mjs'))
cpSync(join(root, 'packaging', 'README.txt'), join(out, 'README.txt'))

const launchers = join(root, 'packaging', 'launchers')
for (const name of readdirSync(launchers)) {
  cpSync(join(launchers, name), join(out, name))
}
// The double-click launchers must stay executable, and the zip has to carry that
// bit or a Mac user's file won't open.
for (const name of readdirSync(out)) {
  if (name.endsWith('.command') || name.endsWith('.sh')) chmodSync(join(out, name), 0o755)
}

// 3. Zip it, preferring the system `zip` because it preserves the executable bit
//    that macOS needs; fall back to a Node zip that at least produces a valid
//    archive (Windows and Linux users are unaffected by the lost bit).
step('Zipping…')
rmSync(zipPath, { force: true })
let zipped = false
try {
  execFileSync('zip', ['-r', '-q', zipPath, 'the-tables'], { cwd: stage, stdio: 'inherit' })
  zipped = true
} catch {
  console.log('  system `zip` not available, using a Node fallback…')
}
if (!zipped) {
  // Minimal stored-only zip writer, so the script has no dependencies of its own.
  await nodeZip(out, zipPath)
}

const mb = (statSync(zipPath).size / 1024 / 1024).toFixed(1)
console.log(`\n✓ the-tables.zip  (${mb} MB)`)
console.log('  Send this one file to a coworker. They unzip it and double-click the launcher for their OS.\n')

// --- a tiny zip writer, used only when the system `zip` is missing -----------

async function nodeZip(srcDir, dest) {
  const { createWriteStream } = await import('node:fs')
  const { readFile } = await import('node:fs/promises')
  const { deflateRawSync } = await import('node:zlib')

  const files = []
  const walk = (dir, rel) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name)
      const r = rel ? `${rel}/${name}` : name
      if (statSync(abs).isDirectory()) walk(abs, r)
      else files.push({ abs, rel: r })
    }
  }
  walk(srcDir, 'the-tables')

  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc32 = (buf) => {
    let c = 0xffffffff
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }

  const chunks = []
  const central = []
  let offset = 0
  for (const f of files) {
    const data = await readFile(f.abs)
    const comp = deflateRawSync(data)
    const name = Buffer.from(f.rel)
    const crc = crc32(data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt32LE(0, 10)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(comp.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    chunks.push(local, name, comp)

    const cen = Buffer.alloc(46)
    cen.writeUInt32LE(0x02014b50, 0)
    cen.writeUInt16LE(20, 4)
    cen.writeUInt16LE(20, 6)
    cen.writeUInt16LE(0, 8)
    cen.writeUInt16LE(8, 10)
    cen.writeUInt32LE(0, 12)
    cen.writeUInt32LE(crc, 16)
    cen.writeUInt32LE(comp.length, 20)
    cen.writeUInt32LE(data.length, 24)
    cen.writeUInt16LE(name.length, 28)
    cen.writeUInt32LE(offset, 42)
    central.push(cen, name)

    offset += local.length + name.length + comp.length
  }

  const centralBuf = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16)

  await new Promise((resolve, reject) => {
    const ws = createWriteStream(dest)
    ws.on('error', reject).on('close', resolve)
    for (const c of chunks) ws.write(c)
    ws.write(centralBuf)
    ws.write(end)
    ws.end()
  })
}
