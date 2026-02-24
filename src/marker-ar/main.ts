import { MODEL_URLS } from '../models';

const BUILD_BASE = (import.meta as any).env?.BASE_URL ?? '/';

const INITIAL_SCALE = 0.004;
const MIN_SCALE = 0.001;
const MAX_SCALE = 0.02;
const SCALE_STEP_UP = 1.1;
const SCALE_STEP_DOWN = 0.9;

let currentScale = INITIAL_SCALE;
let pinchStartDistance = 0;
let pinchStartScale = INITIAL_SCALE;

function normalizeAssetUrl(url: string): string {
  const base = BUILD_BASE.endsWith('/') ? BUILD_BASE : `${BUILD_BASE}/`;
  if (base === '/' || window.location.pathname.startsWith(base)) {
    return url;
  }

  if (url.startsWith(base)) {
    const stripped = url.substring(base.length - 1);
    return stripped.startsWith('/') ? stripped : `/${stripped}`;
  }

  return url;
}

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function applyScale(value: number): void {
  currentScale = clampScale(value);
  const model = document.getElementById('model-suimon') as HTMLElement | null;
  if (model) {
    const raw = currentScale.toFixed(4);
    model.setAttribute('scale', `${raw} ${raw} ${raw}`);
  }

  const label = document.getElementById('zoom-value');
  if (label) {
    const percent = Math.round((currentScale / INITIAL_SCALE) * 100);
    label.textContent = `${percent}%`;
  }
}

function setSuimonModelSrc(): void {
  const suimonUrl = normalizeAssetUrl(MODEL_URLS.suimon);

  const nodes = document.querySelectorAll<HTMLElement>('[data-model-entity="suimon"]');
  nodes.forEach((el) => {
    el.setAttribute('gltf-model', `url(${suimonUrl})`);
    el.setAttribute('visible', 'true');
  });

  applyScale(INITIAL_SCALE);
  console.log('[marker-ar] suimon model src set', { url: suimonUrl, count: nodes.length });
}

function setupPanelToggle(): void {
  const panel = document.getElementById('marker-panel');
  const hideBtn = document.getElementById('marker-panel-toggle');
  const restoreBtn = document.getElementById('marker-panel-restore');
  if (!panel || !hideBtn || !restoreBtn) return;

  hideBtn.addEventListener('click', () => {
    panel.classList.add('hidden');
    restoreBtn.classList.add('visible');
  });

  restoreBtn.addEventListener('click', () => {
    panel.classList.remove('hidden');
    restoreBtn.classList.remove('visible');
  });
}

function setupZoomButtons(): void {
  const zoomIn = document.getElementById('zoom-in') as HTMLButtonElement | null;
  const zoomOut = document.getElementById('zoom-out') as HTMLButtonElement | null;
  if (!zoomIn || !zoomOut) return;

  zoomIn.addEventListener('click', () => {
    applyScale(currentScale * SCALE_STEP_UP);
  });

  zoomOut.addEventListener('click', () => {
    applyScale(currentScale * SCALE_STEP_DOWN);
  });
}

function getTouchDistance(t1: Touch, t2: Touch): number {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.hypot(dx, dy);
}

function setupPinchZoom(): void {
  window.addEventListener(
    'touchstart',
    (event) => {
      if (event.touches.length !== 2) return;
      pinchStartDistance = getTouchDistance(event.touches[0], event.touches[1]);
      pinchStartScale = currentScale;
    },
    { passive: true }
  );

  window.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length !== 2 || pinchStartDistance <= 0) return;
      const currentDistance = getTouchDistance(event.touches[0], event.touches[1]);
      if (!Number.isFinite(currentDistance) || currentDistance <= 0) return;
      const nextScale = pinchStartScale * (currentDistance / pinchStartDistance);
      applyScale(nextScale);
      event.preventDefault();
    },
    { passive: false }
  );

  window.addEventListener(
    'touchend',
    (event) => {
      if (event.touches.length < 2) {
        pinchStartDistance = 0;
      }
    },
    { passive: true }
  );
}

setSuimonModelSrc();
setupPanelToggle();
setupZoomButtons();
setupPinchZoom();
