# Vessel website

A static site (plain HTML, CSS and JavaScript; no build step) with:

- **Home** (`index.html`): what Vessel does, the screens, the one-minute tour, FAQ and a donation box.
- **Download** (`download.html`): reads the newest release from the GitHub API in the
  visitor's browser, picks the right file for their computer (Mac Apple chip or Intel,
  Windows), lists every file, shows the release notes and earlier versions. Publish a
  new GitHub release and the page updates by itself; nothing to redeploy.
- **Donate** (`donate.html`): one-time or monthly gifts through GitHub Sponsors, with
  optional PayPal and Ko-fi.

## Settings

Everything you'd change lives in [`assets/js/config.js`](assets/js/config.js):
the GitHub repository, the donation amounts and which donation services to show.

## How the download page names files

It matches release assets by the end of their name, as electron-builder makes them:

| Ends with | Shown as |
|---|---|
| `-mac-arm64.dmg` | Mac with Apple chip |
| `-mac-x64.dmg` | Mac with Intel chip |
| `-win.exe` | Windows (any PC) |
| `-win-x64.exe` | Windows, Intel or AMD (smaller) |

If GitHub can't be reached (rate limit is 60 requests an hour per visitor), the page
falls back to a button for the latest release on GitHub. Results are cached for 10
minutes per browser tab. `/latest` always redirects to the latest GitHub release.

## Run it locally

```bash
npx serve website
```

## Deploy

**Netlify:** "Add new site", import the GitHub repository. The `netlify.toml` at the
repository root already points at `website/`, with no build command.

**Vercel:** "Add New Project", import the repository, set **Root Directory** to
`website` and **Framework Preset** to *Other*. `website/vercel.json` adds clean URLs
(`/download`), headers and the `/latest` redirect.

Both are free for a site like this. Add your own domain in the host's domain settings.
