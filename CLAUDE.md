# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## Commands

```bash
npm install
npm run dev
npm run build
npm run preview
```

No dedicated test or lint command is configured. Validation is currently `npx tsc --noEmit` and `npm run build`.

## Project Overview

`suimonAR` is a multi-entry Vite + TypeScript project for showing the Hei River floodgate model in three modes:

- marker AR via A-Frame + AR.js
- 3D / native AR viewing via `@google/model-viewer`
- location AR via WebXR with a DeviceOrientation fallback

There is no SPA framework. Each HTML file is an independent entry point.

## Entry Points

| HTML file | Purpose |
|-----------|---------|
| `index.html` | Landing page linking to the main modes |
| `marker.html` | Thin entry that routes users to the marker experience |
| `marker-ar.html` | Hiro marker AR implementation |
| `viewer.html` | `model-viewer` based 3D / native AR page |
| `location.html` | WebXR / DeviceOrientation location AR page |
| `marker-print.html` | Printable Hiro marker |
| `matterport.html` | Matterport compatibility page |

## Source Layout

- `src/location/main.ts`
  Bootstraps location AR, loads config, checks WebXR support, and starts either the XR path or the fallback path.

- `src/location/webxr-session.ts`
  Starts `immersive-ar`, requests `local-floor`, converts GPS coordinates into local meters, and places models into `scene`.

- `src/location/orientation-fallback.ts`
  Runs the non-WebXR path with `getUserMedia`, `watchPosition`, and `deviceorientation`. Camera updates and model placement stay separate.

- `src/location/config.ts`
  Loads `public/config/locations.yaml` and resolves model filenames through `src/models/index.ts`.

- `src/utils/geo-converter.ts`
  Converts GPS coordinates to Three.js local coordinates using a simple ENU-style approximation.

- `src/viewer/main.ts`
  Loads `public/config/models.yaml`, initializes `<model-viewer>`, and delegates AR launch to Quick Look / Scene Viewer.

- `src/marker-ar/main.ts`
  Marker AR behavior, including model scaling and touch gestures.

- `src/models/index.ts`
  Central source of Vite-resolved GLB URLs.

## Configuration

### `public/config/locations.yaml`

Used by `location.html`. Structure:

```yaml
origin:
  lat: 39.6395435045501
  lng: 141.96414846972124
  altitude: 0

models:
  - id: heigawa_suimon
    model: "suimon-kousin.glb"
    lat: 39.6395435045501
    lng: 141.96414846972124
    altitude: 0
    heading: -2
    scale: 1.0
    realHeightMeters: 8.5
```

### `public/config/models.yaml`

Used by `viewer.html` to populate selectable GLB / USDZ models.

## Working Rules For This Repo

- Do not reintroduce LocAR.js. The current location AR stack is WebXR + DeviceOrientation.
- Do not attach AR models to the camera. Keep them under `scene`.
- When changing location AR, preserve the split between camera tracking and model placement.
- Runtime YAML parsing relies on `js-yaml` loaded from CDN in HTML, not bundled into TypeScript.
- GitHub Pages deploys the app under `/sumionAR/`, so asset paths must remain compatible with the Vite `base` setting.
