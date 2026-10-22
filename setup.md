# Setup Guide: Develop & Deploy

The app is a static Vite build hosted on **Cloudflare Pages** at https://mafia-dealer.pages.dev.
Cloudflare Pages is connected to the GitHub repo `DhanushPrince/Mafia`, so **every push to `main` automatically builds and deploys**.

## 1. Run locally

```bash
git clone https://github.com/DhanushPrince/Mafia.git
cd Mafia
npm install
npm run dev        # http://localhost:5173
```

## 2. Make a change

```bash
git checkout -b my-change
# ...edit...
npm run build      # make sure the production build passes
npm run preview    # optional: check the built site at http://localhost:4173
git commit -am "Describe the change"
git push -u origin my-change
```

Open a pull request. By default Cloudflare Pages also builds a preview deployment for the branch.
Merging into `main` deploys to production automatically.

## 3. Cloudflare Pages settings (for reference)

| Setting | Value |
|---------|-------|
| Production branch | `main` |
| Framework preset | Vite (or None) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |

`vite.config.js` uses `base: '/'` because the site is served from the domain root.
Static files in `public/` (e.g. `noise.svg`, `favicon.svg`) are copied to `dist/` as-is.

## 4. Troubleshooting: Permission Denied (403) on push

If you see `remote: Permission to DhanushPrince/Mafia.git denied to <other-account>`, git is using the wrong saved GitHub credentials.

1. Clear saved credentials (macOS):
   ```bash
   git credential-osxkeychain erase
   host=github.com
   protocol=https
   ```
   (press Enter twice)
2. Push again and sign in as `DhanushPrince`, using a **Personal Access Token** (GitHub → Settings → Developer settings → Personal access tokens, `repo` scope) as the password.
