# Mafia Card Dealer — Stack & Architecture

A frontend-only single-page app for dealing Mafia role cards. No backend, database, or API.

---

## High-Level Architecture

```mermaid
flowchart TB
    subgraph build [Build & Deploy]
        Vite[Vite 6]
        GH[GitHub Pages / gh-pages]
    end

    subgraph ui [UI Layer]
        React[React 18]
        Tailwind[Tailwind CSS 4]
        Motion[Framer Motion]
        Lucide[Lucide Icons]
    end

    subgraph app [App Logic]
        App[App.jsx — screen state]
        Deck[Role generation + shuffle]
    end

    Vite --> React
    React --> App
    App --> Deck
    React --> Tailwind
    React --> Motion
    React --> Lucide
    Vite --> GH
```

---

## Tech Stack

| Layer | Tech | Role |
|-------|------|------|
| **Framework** | React 18 | UI components and state |
| **Bundler / dev server** | Vite 6 | Fast dev, production builds |
| **Language** | JavaScript (JSX) | No TypeScript |
| **Styling** | Tailwind CSS 4 | Utility classes (`flex`, `text-white`, etc.) |
| **CSS pipeline** | PostCSS + Autoprefixer | Processes Tailwind |
| **Animations** | Framer Motion | Card flips, fades, particles, 3D tilt |
| **Icons** | Lucide React | Skull, User, Search, etc. |
| **Font** | Rajdhani (Google Fonts) | Loaded in `index.css` |
| **Hosting** | GitHub Pages | Static site from `gh-pages` branch |

---

## Project Structure

```
Mafia/
├── index.html              # Entry HTML, mounts React at #root
├── vite.config.js          # Vite config, base path /Mafia/
├── package.json            # Dependencies & scripts
├── tailwind.config.js      # Custom animations (float, spin-slow)
├── postcss.config.js       # Tailwind + autoprefixer
├── rules.png               # Rules image asset
└── src/
    ├── main.jsx            # React entry point
    ├── index.css           # Tailwind import + global styles
    ├── App.jsx             # Main app logic & screen routing
    └── components/
        ├── PlayerCountScreen.jsx   # Pick player count
        ├── DealingScreen.jsx       # Card grid & dealing
        ├── Card.jsx                # Individual role card
        ├── RulesScreen.jsx         # Full-screen rules image
        ├── Rules.jsx               # Detailed rules UI
        ├── Background.jsx          # Animated nebula/particles
        ├── EndScreen.jsx           # End game screen
        └── WarpTransition.jsx      # Transition effect
```

---

## Screen Flow

Manual routing via React state — no React Router.

```mermaid
stateDiagram-v2
    [*] --> playerCount
    playerCount --> rules : View Rules
    rules --> playerCount : Close
    playerCount --> dealing : Start Game
    dealing --> playerCount : Restart
```

---

## Game Logic Flow

```mermaid
flowchart LR
    A[Player enters count] --> B[generateDeck]
    B --> C{Player count?}
    C -->|3–6| D[1 Mafia]
    C -->|7–9| E[2 Mafia + Doctor + Detective]
    C -->|10+| F[3 Mafia + Doctor + Detective]
    D --> G[Fill rest with Villagers]
    E --> G
    F --> G
    G --> H[shuffleDeck]
    H --> I[DealingScreen]
    I --> J[Player taps card]
    J --> K[Flip → reveal role]
    K --> L[Mark card taken after 2s]
```

### Role assignment rules

| Players | Roles |
|---------|-------|
| 3–6 | 1 Mafia + Villagers |
| 7–9 | 2 Mafia + Doctor + Detective + Villagers |
| 10+ | 3 Mafia + Doctor + Detective + Villagers |

---

## Component Dependencies

```mermaid
flowchart TD
    App[App.jsx]
    App --> Background
    App --> PlayerCountScreen
    App --> RulesScreen
    App --> DealingScreen
    DealingScreen --> Card
    PlayerCountScreen --> Rules
    RulesScreen --> rules.png
    Card --> Lucide[Lucide Icons]
    Card --> Framer[Framer Motion]
    Background --> Framer
    DealingScreen --> Framer
```

---

## Build & Deploy Pipeline

```mermaid
flowchart LR
    A[Source code] --> B[npm run build]
    B --> C[dist/ folder]
    C --> D[npm run deploy]
    D --> E[gh-pages branch]
    E --> F[dhanushprince.github.io/Mafia]
```

### Commands

| Command | What it does |
|---------|--------------|
| `npm run dev` | Vite dev server → `localhost:5173` |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview production build locally |
| `npm run deploy` | Build + push `dist/` to `gh-pages` |

### GitHub Pages config

- `vite.config.js` → `base: '/Mafia/'` (asset paths for subpath hosting)
- `package.json` → `homepage: https://DhanushPrince.github.io/Mafia`

---

## Styling Architecture

```mermaid
flowchart LR
    A[index.css] --> B["@import tailwindcss"]
    A --> C[Rajdhani font]
    A --> D[Global dark theme]
    E[tailwind.config.js] --> F[Custom keyframes: float, spin-slow]
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
| Database | No data persistence |
| Testing framework | No Jest/Vitest setup |
| CSS-in-JS | Tailwind utility classes instead |

---

## Mental Model

1. **Vite** — builds and serves the app
2. **React** — UI and game state
3. **Tailwind** — look and layout
4. **Framer Motion** — motion and polish
5. **GitHub Pages** — hosts the built static files

This is a **pass-the-phone Mafia card dealer**, not a multiplayer online game.
