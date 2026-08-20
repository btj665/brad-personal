# Modernizing the MeshCentral look

MeshCentral is function-first and its default UI looks dated. There's no official "modern skin",
but there are two real levers — start with the first, it's the biggest win for zero maintenance.

## 1. Built-in Modern UI (recommended, zero risk)

MeshCentral ships a cleaner "Modern UI" that's simply off by default. Turn it on server-wide in
`meshcentral/config.json` under the default domain:

```json
"domains": { "": { "siteStyle": 3 } }
```

Then `docker compose restart meshcentral` and hard-refresh the browser (**Ctrl+Shift+R**).
Individual users can also switch styles under **My Account → interface/theme**; `siteStyle`
just sets the default for everyone. This is already set in this repo's `config.json`.

## 2. Custom CSS override (optional, deeper reskin)

For system fonts, flatter colors, custom icons, and tighter spacing, MeshCentral supports an
**upgrade-safe** CSS override: a `custom.css` that loads last on every page. It lives in a
`meshcentral-web/` folder, which is separate from your data, so upgrades don't touch it.

### Folder structure (on the host)
```
remote-access/meshcentral/web/public/
├── images/            # optional icon/logo overrides
├── scripts/custom.js  # optional (can be empty)
└── styles/custom.css  # your overrides
```

### Mount it into the container
In `docker-compose.yml`, add one volume to the `meshcentral` service — the override folder maps
to `meshcentral-web` alongside the data dir:
```yaml
    volumes:
      - ./meshcentral/data:/opt/meshcentral/meshcentral-data
      - ./meshcentral/config.json:/opt/meshcentral/meshcentral-data/config.json
      - ./meshcentral/web:/opt/meshcentral/meshcentral-web   # <-- add this
      - ./meshcentral/user_files:/opt/meshcentral/meshcentral-files
      - ./meshcentral/backups:/opt/meshcentral/meshcentral-backups
```
Then restart, make sure you're on the Modern UI (siteStyle 3), and hard-refresh.

### Starter custom.css
A conservative starting point — modern system font and flatter chrome, without fighting the
layout:
```css
:root { --nav: #1f2937; --accent: #2563eb; }

body, #page, .menu, table, input, select, button {
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
}

/* Flatten the beveled/3D chrome */
#topbar, #masthead, .style2, td.style2 { background: var(--nav) !important; color: #fff !important; }
* { border-style: solid !important; }
button, .button { border-radius: 6px !important; }
```
Tune from there. Keep changes in `custom.css` only so upgrades stay clean.

### Community theme (shortcut)
The [MeshCentral-Stylish-UI](https://github.com/Melo-Professional/MeshCentral-Stylish-UI) project
is a ready-made modern `custom.css` + image set you can drop into `meshcentral/web/public/`.
It's more polished than the starter above, but it's a third-party dependency that can drift when
MeshCentral updates — pin a version and re-check after upgrades.

## 3. Branding (logo / login page)

Independent of the theme, MeshCentral exposes branding keys in the domain config
(`titlePicture`, `loginPicture`, `welcomeText`, and a top-of-page `logoback.png` you place in the
data folder). Handy for a personal touch on the login screen; see MeshCentral's customization
docs for the current key names and image sizes.
