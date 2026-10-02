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

## 2. Custom CSS theme (included in this repo)

This repo ships a hand-written theme at **`meshcentral/web/public/styles/custom.css`** — a system
font, flat surfaces, a slate + blue palette, rounded controls, and readable tables, replacing the
beveled Windows-3.1 chrome. It's an **upgrade-safe** override: `custom.css` loads last on every
page and lives in `meshcentral-web/`, which is separate from your data, so MeshCentral upgrades
never touch it.

### How it's wired
`docker-compose.yml` already mounts the theme folder into the container:
```yaml
      - ./meshcentral/web:/opt/meshcentral/meshcentral-web
```
Folder layout:
```
remote-access/meshcentral/web/public/
├── scripts/custom.js  # loaded last (empty; theme is pure CSS)
└── styles/custom.css  # the theme
```
It only takes effect on the **Modern UI** (`siteStyle: 3`, already set). After changing the CSS,
recreate the container and hard-refresh:
```bash
docker compose up -d          # picks up the volume / restarts
# then Ctrl+Shift+R in the browser
```

### Tuning it
All colors, radii, and the font stack are CSS variables at the top of `custom.css` (`--accent`,
`--nav`, `--bg`, `--radius`, …) — change those first. MeshCentral hard-codes a lot of inline
styles, so the file uses `!important` deliberately. If a specific screen still looks off, note the
element and it can be targeted. Enabling MeshCentral's built-in **dark mode** will clash with the
light palette — ask for a dark variant if you want it.

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
