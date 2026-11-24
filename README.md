# Velocity Bay

An original open-world driving game that runs in the browser (plain HTML + JavaScript, Three.js + Rapier physics). There's no build step.

## Play locally

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173. Add `?q=low` or `?q=high` to the URL to change the graphics quality.

## Controls

W/↑ gas · S/↓ brake and reverse · A D/← → steer · Space handbrake · Shift nitro · G auto/manual · Q/E shift · C camera · L lights · R back on the road · T skip an hour · H help

## Tests

```bash
npm test
```

## Deploy (Cloudflare Pages)

1. Push this folder to a GitHub repo.
2. In Cloudflare, go to Workers & Pages → Create → Pages → Connect to Git and pick the repo.
3. Framework preset: **None**. Build command: *(empty)*. Build output directory: **/**.
4. Save. After that, every push to `main` goes live.

Design and plans: `docs/superpowers/`.
