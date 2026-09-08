# Collaborative sessions (shared screen, no console lockout)

The goal: you and the person at the machine both see and work on the **same screen at the same
time**, and nobody gets logged out. This is the opposite of RDP.

## Use Desktop, never RDP, for collaboration

- **Desktop tab (console mirror)** → shows the *actual physical screen* the person is sitting
  at. Both cursors are live, you both share control, and the local user is never kicked off.
  This is the collaborative mode.
- **RDP** → creates a *separate* session and (on Windows Pro) logs the local user out. Great
  for solo work on a lab box with flexible resolution, wrong for working alongside someone.

Rule of thumb: **collaborate → Desktop; flexible resolution solo → RDP.** You can't have both
at once, because collaboration means sharing their real console, which runs at their monitor's
resolution (see [`resolution.md`](resolution.md)).

## Make it consensual (recommended for family)

Configure per device group so the session is shared and visible, not a silent takeover.
Device group → **Edit** → **User Consent / Notification** section. Each can be set
independently for **Desktop**, **Terminal**, and **Files**:

- **Notify user on connection** — a toast tells them you've connected.
- **Prompt for user consent** — they must click *Accept* before you get the screen. Best
  setting for non-technical family; nothing happens without their okay.
- **Show connection / privacy bar** — a small on-screen toolbar stays up for the whole
  session so it's obvious you're connected.

For your own lab boxes, leave these off for silent unattended access. For family, consent +
the connection bar is the polite default.

## During the session

- **Both mouse/keyboard are active** — point and click while they watch, or let them drive
  while you guide them. That back-and-forth is the collaboration.
- **Chat** — the desktop toolbar has a chat/message button to talk in-app.
- **View-only** — a toggle on the toolbar lets you watch without taking control.
- **Multiple remote viewers** — if more than one person will connect to the *same* desktop at
  once, enable `"desktopMultiplex": true` in the domain block of `meshcentral/config.json`.
  It fans one agent connection out to several viewers efficiently. Not needed for the normal
  "local person + you" case, since the local user is at the physical console, not a viewer.
