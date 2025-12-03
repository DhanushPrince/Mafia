# 🎭 Mafia Card Dealer - React + Vite

A modern, animated Mafia card-dealing game built with React and Vite.

## Features

- ⚡ Lightning-fast with Vite
- 🎨 Smooth React animations
- 🎭 Smart role assignment based on player count
- 📱 Fully responsive design
- 🌑 Dark blue/black theme
- 🃏 Beautiful card flip animations

## Getting Started

### Install Dependencies
```bash
npm install
```

### Run Development Server
```bash
npm run dev
```

Open http://localhost:5173 in your browser.

### Build for Production
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

## How to Play

1. Enter the number of players (3-20)
2. Click "Start Game"
3. Click "Deal Next Card" to reveal each role
4. Pass device around for private role viewing
5. Click "Start New Game" when finished

## Role Assignment

- 3-5 players → 1 Mafia
- 6-9 players → 2 Mafia + Doctor + Detective
- 10+ players → 3 Mafia + Doctor + Detective
- Rest are Villagers

## Deployment

### Vercel
```bash
npm i -g vercel
vercel
```

### Netlify
```bash
npm run build
# Upload dist/ folder to Netlify
```

### GitHub Pages
```bash
npm run build
# Deploy dist/ folder to gh-pages branch
```

## Tech Stack

- React 18
- Vite
- CSS3 Animations
- ES6+ JavaScript

Enjoy! 🎮
