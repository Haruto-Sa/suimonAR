# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at localhost:8000
npm run build    # Production build → dist/
npm run preview  # Preview production build locally
```

No test or lint commands are currently configured.

## Architecture Overview

**sumionAR** is a multi-mode AR demo (location-based AR, marker-based AR, Matterport embed) built with Vite + TypeScript. It has **no SPA framework** — it uses multiple independent HTML entry points, each compiled as a separate bundle.

### Entry Points

| HTML File | Purpose |
|-----------|---------|
| `index.html` | Landing page with Leaflet map of all locations |
| `location-ar-check.html` | Location AR — dev/adjustment mode (full UI, sliders, YAML export) |
| `location-ar-prod.html` | Location AR — production mode (minimal UI) |
| `marker-ar.html` | Hiro marker AR via A-Frame + AR.js |
| `marker-print.html` | A4 print template for the Hiro marker |
| `matterport.html` | Matterport iframe wrapper |
| `location-ar.html`, `heiRiver-ar.html` | Legacy redirects |

### Source Modules

- **`src/location/core.ts`** — `LocationScene` class: the core GPS+three.js engine. Wraps LocAR.js, handles GPS smoothing (8-sample moving average + accuracy weighting), dual orientation mode (`sensor` vs `touch` fallback), WebXR integration, and elevation handling.

- **`src/location-ar/main.ts`** — High-level orchestration for location AR (~1600 lines). Loads YAML config, spawns `LocationScene`, loads GLB models via `THREE.GLTFLoader`, builds all UI (location selector, mode switcher, height/scale/rotation/offset sliders, YAML export button).

- **`src/marker-ar/main.ts`** — A-Frame marker AR. Handles pinch-zoom (2-touch), drag-rotation (1-touch), and ± zoom buttons for the `suimon-kousin.glb` model.

- **`src/matterport/main.ts`** — Validates and redirects to a Matterport URL from a `data-matterport-url` attribute.

- **`src/models/index.ts`** — Exports `MODEL_URLS` using `import.meta.url`-relative paths for bundler-aware GLB resolution.

### Configuration

Location data lives in `public/config/locations.yaml` (dev) and `public/config/locations-heiRiver.yaml` (prod). These YAML files are fetched at runtime using `js-yaml` (loaded from CDN, not bundled). Key YAML fields per location:

```yaml
id, name, latitude, longitude
altitude / baseAltitudeMeters   # priority order for height
defaultHeight, defaultSize, defaultRotationY
offsetEast, offsetNorth
model                           # GLB filename under src/models/
```

### Key Dependencies

| Library | Source | Role |
|---------|--------|------|
| `locar` | npm | GPS-to-3D coordinate mapping |
| `three` | npm | 3D rendering |
| `A-Frame 1.4.1` | CDN | Entity-component system for marker AR |
| `AR.js 3.4.5` | CDN | Hiro marker detection |
| `js-yaml 4.1.0` | CDN | Runtime YAML parsing |
| `leaflet 1.9.4` | CDN | Map on index page |

### Deployment

GitHub Actions (`.github/workflows/deploy.yaml`) runs `npm ci && npm run build` on push to `main` and deploys `./dist` to GitHub Pages at `/sumionAR/`. The Vite base path is `/sumionAR/` — all asset URLs depend on this.

Camera and GPS APIs require HTTPS (or localhost). iOS requires a manual tap to reconnect device orientation after the first permission prompt.
