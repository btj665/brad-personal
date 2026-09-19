# Working agreement

## Establish it or ask. Do not guess.

Every factual claim that ends up in this repository — in code, in a comment,
in a commit message, in a write-up — must come from a source I have actually
read, or from you. Where I cannot establish something, I ask. I do not fill
the gap with something plausible and move on.

This is not a style preference. It has already cost real bugs. Three
comments in the arcade games asserted original hardware behaviour that I had
never verified — "the mission restarts from the top, as it did on the
board", "the wave restarts with a full bar, as the cartridge did" — and both
were wrong, and the wrongness shipped and had to be reported back by the
person playing the game.

### What this means in practice

**Say which it is.** A value is sourced, or it is a reconstruction. If it is
a reconstruction, the code says so at the value, not in a commit message
nobody will read again. A reader should never have to guess which numbers
are real.

**A secondary source is not a fact.** Two independent pages said Megamania
replenishes energy as enemies are hit. Both were wrong. When the primary
source is unreachable and the answer changes the work, ask rather than
adopt the best available rumour.

**Name the conflict.** Where sources disagree — how many waves are in a Moon
Cresta lap, whether Gorf's saucer is 100 or 200 — record both readings and
which one the code took.

**Change only what is evidenced.** Adopting a sourced value should not
silently drag unsourced ones along with it. When Megamania's bar became 80
units, the drain rate moved to hold the wave's length where it already was,
because the length was a deliberate choice and the bar size was the only
thing the evidence touched.

**Do not dress a guess as research.** "Approximately", "roughly as the
original did", "period-correct" are not citations.

### Asking is cheap

Asking cost one message and got a correction that no amount of searching
would have produced — the user knew the game and the internet did not.
A blocked proxy, a paywalled manual or a contradictory wiki is a reason to
ask, not a reason to invent.

## What this session can actually reach

Measured in this container, not assumed. The environment's network access
level is **Trusted**, which allows only the default list: `api.anthropic.com`,
`registry.npmjs.org`, `jsr.io`, `npm.jsr.io`, `pypi.org`,
`files.pythonhosted.org`, `index.crates.io`, `proxy.golang.org`, plus GitHub
through its own proxy and `raw.githubusercontent.com`, and `code.claude.com`.

Reachable, tested: `github.com`, `raw.githubusercontent.com`,
`api.github.com`, `codeload.github.com`, `code.claude.com`.

Blocked, tested: `en.wikipedia.org`, `atariage.com`, `archive.org`,
`gamefaqs.gamespot.com`, `strategywiki.org`, `arcade-history.com`,
`mobygames.com`, `atarionline.org`, `gist.githubusercontent.com`,
`google.com`.

WebSearch still works, because it does not go through this proxy. That is
why search snippets arrive but the pages behind them do not — and snippets
are exactly the secondary sources the rule above says not to trust.

A URL does not grant access. The block is per host, so pasting a link to a
blocked host changes nothing. Three things that do work, in order of how
little they cost you:

1. **Paste the text, or attach the file.** Always works, no configuration.
   PDFs and images of manual pages are readable.
2. **Put the document in a GitHub repository.** Committed files are
   reachable through `raw.githubusercontent.com` right now. Drop them in
   `docs/arcade-sources/`, which lists what is still open.
3. **Change the environment's network access.** Open the environment for
   editing and use the **Network access** selector: **Custom** with a list
   of hosts, with *Also include default list of common package managers*
   checked so GitHub and the registries keep working, or **Full** for any
   domain.

**`raw.githubusercontent.com` serves any public repository, not only the
ones attached to this session.** Tested: MAME's 897 KB Galaxian driver
fetched fine. The GitHub *API* is scoped to attached repositories and
refuses anything else, but raw file reads are not. That makes a large class
of primary material reachable without changing any setting — source,
disassemblies, documentation, data files.

This is worth reaching for before asking. MAME's driver sources carry DIP
switch tables read off the original boards, and they settled three values
that had been marked as reconstructions: Gorf runs three ships per credit
and awards its bonus ship for reaching Mission 5 rather than at any score,
which corrected a wrong implementation, and Moon Cresta's bonus section
comes at 30,000. Useful paths: `mamedev/mame`, `src/mame/<manufacturer>/`.
Say what such a source is — a DIP table read off hardware is strong, and it
is still not the operator manual.

Never route around a block. The proxy README is explicit: a 403 or 407 is an
organization policy denial, and the instruction is to report the blocked
host rather than retry or find another way to the content.

## Verifying games

Two failures that got past a suite that looked thorough, both now standing
rules in `games/README.md`:

- Clear every wave the way a player does, by shooting, never with a
  `killAll` helper. Moon Cresta shipped with an unclearable first wave
  because every test cleared waves by setting `alive = false`.
- Lose a life on purpose and look at what comes back. All three games
  rebuilt the whole wave on death and no test covered dying.
