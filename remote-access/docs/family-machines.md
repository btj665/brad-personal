# Family machines (wife's & mom's)

For non-technical family, the goal is: you install one small agent once, and from then on you
can connect **unattended** (they don't have to do anything) and see **their real screen** so
you can actually help.

## Install the agent (once, per machine)

1. In MeshCentral, create a device group, e.g. `Family` (Device Group type: *Manage
   background & interactive*, which allows unattended access).
2. Open the group -> **Add Agent** -> download the Windows installer (or run the one-line
   install command).
3. Run it on their machine as admin. The agent installs as a service, survives reboots, and
   connects out to your tunnel hostname — no inbound ports on their end, works behind any
   home router/NAT.

## Connecting to help them

- Open the device in MeshCentral -> **Desktop** tab. This is the **console mirror**: you see
  exactly what's on their monitor at their monitor's resolution. Do **not** switch these to
  RDP — RDP would log them out of their own session. See `resolution.md` for the why.
- Use **Chat**/**Notify** to tell them what you're doing, and the **Files** and **Terminal**
  tabs for behind-the-scenes fixes.

## Collaboration & consent

The Desktop tab is a **shared** session by nature — you both see and control the same screen,
and they're never logged out. To make it consensual, set the device group's **User Consent /
Notification** options (notify on connect, prompt for consent, show a connection bar). For
family, prompt-for-consent + the connection bar is the polite default. Full details, including
multi-viewer sessions and the view-only toggle, are in
[`collaborative-sessions.md`](collaborative-sessions.md).

This is strictly your own personal use across your own household, which is exactly what
MeshCentral is built for.
