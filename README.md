# 🎭 Mafia Card Dealer - React + Vite

A pass-the-phone Mafia role dealer with a **Game Master view**, built with React, Vite, Tailwind CSS v4 and Framer Motion.

**Live:** https://mafia-dealer.pages.dev (Cloudflare Pages, auto-deployed from `main`)

## Features

- 🎭 Smart role assignment based on player count (4-20 players)
- 🧑‍🤝‍🧑 Named players: the Game Master enters everyone's name (remembered for the next game)
- 🙈 Private dealing: each player picks their name, sees their role, then hides the card and passes the phone
- 👑 Game Master view (press & hold to open): every player's role, tap to eliminate, live Mafia vs others count and automatic win banner
- 📱 Mobile-first, responsive rules screen
- 🃏 3D card flip animations, nebula background

## How to Play

The **Game Master** (moderator) runs the game on one phone and does **not** get a card.

1. Choose the number of players (4-20) and tap **Next: Player Names**.
2. Enter each player's name (prefilled `Player 1..N`; names must be unique and non-empty). Tap **Deal Cards**.
3. Pass the phone around. Each player taps an untaken card, picks their name in **Who are you?**, sees their role,
   then taps **Hide & Pass** (or waits ~3 s) - the card flips back face-down and shows only their name.
4. When every card is taken, hand the phone to the Game Master, who **presses and holds** the **Game Master** button (~1.5 s).
5. In the Game Master view, tap players to mark them eliminated. The app shows alive Mafia vs alive others and announces the winner:
   - **Villagers win** when every Mafia member is eliminated.
   - **Mafia win** when alive Mafia equal or outnumber everyone else alive.
6. **Start New Game** keeps the player count and names.

## Role Assignment

| Players | Mafia | Doctor | Detective | Villagers |
|---------|-------|--------|-----------|-----------|
| 4-6     | 1     | 1      | 1         | rest (1-3) |
| 7-9     | 2     | 1      | 1         | rest (3-5) |
| 10-20   | 3     | 1      | 1         | rest (5-15) |

## Getting Started

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build -> dist/
npm run preview   # serve dist/ locally
```

## Deployment (Cloudflare Pages)

The site is hosted on Cloudflare Pages, connected to this GitHub repo:

- **Push to `main` = deploy.** Cloudflare builds every push to `main` and publishes it to https://mafia-dealer.pages.dev.
- Build command: `npm run build` · Output directory: `dist` · Vite `base` is `/`.
- By default Cloudflare Pages also builds preview deployments (with their own URLs) for other branches/PRs.

No manual deploy step or `gh-pages` branch is needed.

## Tech Stack

- React 18 + Vite 6
- Tailwind CSS v4 (configured in `src/index.css` via `@theme`; there is no `tailwind.config.js`)
- Framer Motion, Lucide icons
- No backend: last player count + names are stored in `localStorage`

Enjoy! 🎮
