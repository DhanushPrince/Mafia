# Mafia Card Dealer — Stack & Architecture

A frontend-only single-page app for dealing Mafia role cards on one phone, with a Game Master (moderator) view.
No backend, database, or API — the last player count and names are kept in `localStorage`.

---

## High-Level Architecture

```mermaid
flowchart TB
    subgraph build [Build & Deploy]
        Vite[Vite 6]
        CF[Cloudflare Pages — auto-deploy on push to main]
    end

    subgraph ui [UI Layer]
        React[React 18]
        Tailwind[Tailwind CSS 4]
        Motion[Framer Motion]
        Lucide[Lucide Icons]
    end

    subgraph app [App Logic]
        App[App.jsx — screen + game state]
        Roles[game/roles.js — deck, roles, win check]
        Storage[game/storage.js — localStorage]
    end

    Vite --> React
    React --> App
    App --> Roles
    App --> Storage
    React --> Tailwind
    React --> Motion
    React --> Lucide
    Vite --> CF
```

---

## Tech Stack

| Layer | Tech | Role |
|-------|------|------|
| **Framework** | React 18 | UI components and state |
| **Bundler / dev server** | Vite 6 | Fast dev, production builds |
| **Language** | JavaScript (JSX) | No TypeScript |
| **Styling** | Tailwind CSS 4 | Utility classes; custom animations via `@theme` in `index.css` |
| **CSS pipeline** | PostCSS (`@tailwindcss/postcss`) + Autoprefixer | Processes Tailwind |
| **Animations** | Framer Motion | Card flips, fades, particles, 3D tilt |
| **Icons** | Lucide React | Skull, User, HeartPulse, Search, etc. |
| **Font** | Rajdhani (Google Fonts) | Loaded in `index.css` |
| **Persistence** | `localStorage` | Last player count + names |
| **Hosting** | Cloudflare Pages | Builds `main` → https://mafia-dealer.pages.dev |

---

## Project Structure

```
Mafia/
├── index.html              # Entry HTML, mounts React at #root
├── vite.config.js          # Vite config, base '/'
├── package.json            # Dependencies & scripts
├── postcss.config.js       # Tailwind + autoprefixer
├── public/
│   ├── noise.svg           # Local grain texture for the background
│   └── favicon.svg
├── rules.png               # Legacy rules image (no longer used by the app)
└── src/
    ├── main.jsx            # React entry point
    ├── index.css           # Tailwind import, @theme animations, 3D utilities
    ├── App.jsx             # Screen routing + game state (names, deck, assignments, eliminations)
    ├── game/
    │   ├── roles.js        # ROLES visuals, generateDeck, shuffle, getWinner
    │   └── storage.js      # load/save last game, namesForCount
    └── components/
        ├── PlayerCountScreen.jsx   # Pick player count (4-20)
        ├── NamesScreen.jsx         # Game Master enters player names
        ├── DealingScreen.jsx       # Card grid, "Who are you?" picker, Hide & Pass, GM hold button
        ├── Card.jsx                # Individual role card (flip, taken-by name)
        ├── GameMasterScreen.jsx    # Roles, eliminations, live counts, win banner
        ├── RulesScreen.jsx         # Wraps Rules.jsx
        ├── Rules.jsx               # Responsive rules UI
        ├── ui.jsx                  # LiquidButton, PrimaryButton, HoldButton
        ├── Background.jsx          # Animated nebula/particles
        ├── EndScreen.jsx           # (unused)
        └── WarpTransition.jsx      # (unused)
```

---

## Screen Flow

Manual routing via React state — no React Router.

```mermaid
stateDiagram-v2
    [*] --> playerCount
    playerCount --> rules : Rules
    rules --> playerCount : Close / Got it
    playerCount --> names : Next - Player Names
    names --> playerCount : Back
    names --> dealing : Deal Cards
    dealing --> playerCount : Start New Game (keeps count + names)
    dealing --> gm : All dealt + press & hold Game Master
    gm --> dealing : Back
    gm --> playerCount : Start New Game (keeps count + names)
```

---

## Dealing Flow

```mermaid
flowchart LR
    A[Choose count] --> B[Enter names]
    B --> C[generateDeck + shuffle]
    C --> D[Player taps untaken card]
    D --> E["Who are you? (unassigned names)"]
    E --> F[Card flips: role shown]
    F --> G["Hide & Pass (or auto after ~3 s)"]
    G --> H[Card face-down, shows name, marked taken]
    H -->|cards left| D
    H -->|all taken| I[Press & hold Game Master ~1.5 s]
    I --> J[GM view: toggle eliminated, live counts, win banner]
```

### Role assignment rules

| Players | Mafia | Doctor | Detective | Villagers |
|---------|-------|--------|-----------|-----------|
| 4–6 | 1 | 1 | 1 | rest |
| 7–9 | 2 | 1 | 1 | rest |
| 10–20 | 3 | 1 | 1 | rest |

The Game Master is not a player and gets no card.

### Win conditions (Game Master view)

- **Villagers win**: every Mafia member is eliminated.
- **Mafia win**: alive Mafia ≥ alive non-Mafia.

---

## Component Dependencies

```mermaid
flowchart TD
    App[App.jsx]
    App --> Background
    App --> PlayerCountScreen
    App --> NamesScreen
    App --> RulesScreen
    App --> DealingScreen
    App --> GameMasterScreen
    RulesScreen --> Rules
    DealingScreen --> Card
    DealingScreen --> ui[ui.jsx]
    GameMasterScreen --> ui
    NamesScreen --> ui
    Card --> roles[game/roles.js]
    GameMasterScreen --> roles
    App --> roles
    App --> storage[game/storage.js]
```

---

## Build & Deploy Pipeline

```mermaid
flowchart LR
    A[Push / merge to main] --> B[Cloudflare Pages build]
    B --> C[npm run build]
    C --> D[dist/]
    D --> E[mafia-dealer.pages.dev]
```

### Commands

| Command | What it does |
|---------|--------------|
| `npm run dev` | Vite dev server → `localhost:5173` |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview production build locally |

Deployment has no manual command: Cloudflare Pages deploys `main` automatically.

---

## Styling Architecture

```mermaid
flowchart LR
    A[index.css] --> B["@import tailwindcss"]
    A --> C[Rajdhani font]
    A --> D["@theme: animate-spin-slow, animate-float + keyframes"]
    A --> E["@utility: perspective-1000, preserve-3d"]
    G[postcss.config.js] --> H[Tailwind PostCSS plugin]
    G --> I[Autoprefixer]
    J[Components] --> K[Tailwind utility classes]
    J --> L[Framer Motion inline animations]
```

---

## What Is NOT in the Stack

| Not used | Notes |
|----------|-------|
| TypeScript | Plain `.jsx` files |
| React Router | Manual `screen` state in `App.jsx` |
| Redux / Zustand | Local `useState` only |
| Backend / API | Fully static client-side app |
| Database | Only `localStorage` for last names/count |
| Testing framework | No Jest/Vitest setup |
| CSS-in-JS | Tailwind utility classes instead |

---

## Mental Model

1. **Vite** — builds and serves the app
2. **React** — UI and game state
3. **Tailwind** — look and layout
4. **Framer Motion** — motion and polish
5. **Cloudflare Pages** — hosts the built static files, deploys on push to `main`

This is a **pass-the-phone Mafia card dealer with a moderator view**, not a multiplayer online game.
