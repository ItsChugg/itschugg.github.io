# argon

argon is a modified version of the [cobalt](https://github.com/imputnet/cobalt) web app,
served at https://itschu.gg/argon/ and backed by a private cobalt API at https://argon-api.itschu.gg/.
It is not affiliated with or endorsed by imput or cobalt.

Based on cobalt web at commit listed in `UPSTREAM_COMMIT`.

## build

```
npm install
npm run build
```

`npm run build` writes the static site to `../argon` (the folder GitHub Pages serves),
then `prune-build.js` drops files the site doesn't need. Commit both `argon-src/` and `argon/`.
Build settings live in `.env` (`WEB_DEFAULT_API`, `WEB_HOST`); nothing secret goes there.
The API key is entered by each user under settings > instances and stays in their browser.

## changes from cobalt

- renamed to argon; cobalt's logo, mascot (meowbalt), update banners and icons removed
- served from the `/argon` sub-path (`kit.paths.base`, helpers in `src/lib/path.ts`)
- local (in-browser) processing is off by default and the remux tab is hidden, because
  GitHub Pages can't send the cross-origin isolation headers it relies on
- removed the donate, updates, community, privacy and terms pages and the russian translation
- no sourcemaps, asm.js builds of libav are pruned
- installs with npm instead of the cobalt pnpm workspace (`.npmrc` sets `legacy-peer-deps`)

## license

Like cobalt's web app, this code is licensed under CC-BY-NC-SA-4.0 (see `LICENSE`).
cobalt branding is not covered by the license and must not be used here.
`version-info/` is cobalt's helper package, licensed under AGPL-3.0.
