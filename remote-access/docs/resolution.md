# Controlling screen resolution

This is the requirement that shaped the whole design, so it gets its own doc. There are two
fundamentally different ways to view a remote machine, and they handle resolution very
differently. Use the right one per machine.

## The two modes

### 1. Console mirror (MeshCentral "Desktop" tab)
You see the machine's **actual physical screen**. Resolution is whatever the attached display
is running at. This is what you want for the **family machines** — you're looking at the same
thing they see, so you can help them.

The catch: resolution is tied to real display hardware. On a **headless** lab box (no monitor)
there's no display, so you get a tiny fallback resolution or a black screen. Fix by giving it
a *virtual* display (see below), after which you can set any resolution in Windows/Linux
display settings and the mirror follows it.

### 2. RDP virtual session (true dynamic resolution, like you asked for)
RDP creates its **own session at whatever resolution the client requests** — no display
hardware involved. This is the "adjust resolution instead of it being locked to the machine"
behavior. Use this for your **home lab / cluster** boxes.

- **Windows single-session caveat:** on Windows Pro, logging in over RDP logs off whoever is
  at the physical console (and vice-versa). Fine for your own headless/lab machines; not what
  you want for helping family in real time.

## Recommended per machine

| Machine | Mode | How to change resolution |
| --- | --- | --- |
| Home lab / cluster (Windows) | RDP | Set it in the RDP client's display options at connect time |
| Home lab / cluster (headless, any OS) | Console mirror + virtual display | Set it in the OS display settings once a virtual display exists |
| Wife / Mom (Windows) | Console mirror | You match their real screen (don't change it) |
| Linux desktops | Console mirror | `xrandr` custom modes, or virtual display for headless |

## Reaching RDP through MeshCentral (no port forwarding)

You do **not** expose port 3389 to the internet. Two options, both riding the tunnel/agent:

- **MeshCentral relayed RDP:** on a Windows device page in MeshCentral, use the RDP option —
  MeshCentral proxies the RDP connection through the already-installed agent. Set the desired
  width/height in the connect dialog. Traffic goes browser -> Cloudflare Tunnel -> MeshCentral
  -> agent -> local RDP. Nothing is exposed.
- **`cloudflared access rdp`:** if you want a native RDP client (mstsc) with full dynamic
  resizing, add a second **public hostname** in the same tunnel of type `RDP` pointing at
  `<machine-ip>:3389`, protect it with a Cloudflare Access policy, then on your client run
  `cloudflared access rdp --hostname rdp.example.com --url localhost:3389` and point mstsc at
  `localhost:3389`. This gives you mstsc's full resolution/multi-monitor controls with no VPN.

## Giving a headless machine a virtual display (so the console mirror can change resolution)

On a headless lab box the console mirror needs a display to render into. Add a virtual one:

- **Cheapest/no-driver:** a **HDMI/DisplayPort "dummy plug"** (~$8). The GPU thinks a monitor
  is attached; you can then pick any resolution the plug advertises in display settings.
- **Software (Windows):** install a virtual display driver such as **`IddSampleDriver`**
  (Indirect Display Driver). After install, a virtual monitor appears and you can set arbitrary
  resolutions in Settings -> Display. The MeshCentral console mirror then follows it.
- **Software (Linux):** for X11, define a virtual mode with `xrandr` (`cvt` to compute a
  modeline, `xrandr --newmode` / `--addmode` / `--output ... --mode`). For truly headless,
  run a virtual framebuffer (`Xvfb`) or configure a dummy video driver.

## Quick decision rule

> Want the resolution to be **whatever you ask for on connect** → use **RDP**.
> Want to **see the real screen** (family support) → use the **console mirror**, and add a
> **virtual display** if the machine is headless.
