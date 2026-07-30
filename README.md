# Harmony

Fair roommate rent from **perceived room value** — envy-free price discovery, not arbitrary square-footage math.

Live: [lyeric2022.github.io/harmony](https://lyeric2022.github.io/harmony/)

## How it works

1. Enter total rent, bedrooms, and roommates (equal counts).
2. Each person allocates 100% of perceived value across rooms.
3. Harmony assigns rooms (max total value) and finds prices so the split is **envy-free**: nobody prefers someone else’s room at that price.

Inspired by rental harmony / [Spliddit](http://spliddit.org/apps/rent)-style maximin rent division.

## Develop

```bash
npm install
npm run dev
```

```bash
npm run build
npm run preview
```

## Deploy

Pushes to `main` can be published via GitHub Pages (`gh-pages` branch or Actions) with `base: '/harmony/'`.
