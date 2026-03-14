import { MODEL_URLS } from '../models';

const BUILD_BASE = (import.meta as any).env?.BASE_URL ?? '/';

const INITIAL_SCALE = 0.01;
const MIN_SCALE = 0.001;
const MAX_SCALE = 0.03;
const SCALE_STEP_UP = 1.1;
const SCALE_STEP_DOWN = 0.9;
const DRAG_ROTATION_SENSITIVITY = 0.35;
const DRAG_TILT_SENSITIVITY = 0.25;
const MIN_ROTATION_X = -45;
const MAX_ROTATION_X = 45;

let currentScale = INITIAL_SCALE;
let pinchStartDistance = 0;
let pinchStartScale = INITIAL_SCALE;
let currentRotationX = 0;
let currentRotationY = 0;
let dragActive = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartRotationX = 0;
let dragStartRotationY = 0;

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

function getModel(): HTMLElement | null {
  return document.getElementById('model-suimon') as HTMLElement | null;
}

function applyScale(value: number): void {
  currentScale = clampScale(value);
  const model = getModel();
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

function clampRotationX(value: number): number {
  return Math.min(MAX_ROTATION_X, Math.max(MIN_ROTATION_X, value));
}

function applyRotation(x: number, y: number): void {
  currentRotationX = clampRotationX(x);
  currentRotationY = y;
  const model = getModel();
  if (!model) return;
  model.setAttribute('rotation', `${currentRotationX.toFixed(1)} ${currentRotationY.toFixed(1)} 0`);
}

function setSuimonModelSrc(): void {
  const suimonUrl = normalizeAssetUrl(MODEL_URLS.suimon);

  const nodes = document.querySelectorAll<HTMLElement>('[data-model-entity="suimon"]');
  nodes.forEach((el) => {
    el.setAttribute('gltf-model', `url(${suimonUrl})`);
    el.setAttribute('visible', 'true');
  });

  applyScale(INITIAL_SCALE);
  applyRotation(0, 0);
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
      dragActive = false;
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

function isGestureTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true;
  return !target.closest('#start-overlay, .marker-panel, .panel-restore, .zoom-controls, .back-button');
}

function setupDragRotate(): void {
  window.addEventListener(
    'touchstart',
    (event) => {
      if (event.touches.length !== 1 || !isGestureTarget(event.target)) return;
      dragActive = true;
      dragStartX = event.touches[0].clientX;
      dragStartY = event.touches[0].clientY;
      dragStartRotationX = currentRotationX;
      dragStartRotationY = currentRotationY;
    },
    { passive: true }
  );

  window.addEventListener(
    'touchmove',
    (event) => {
      if (!dragActive || event.touches.length !== 1 || pinchStartDistance > 0) return;
      const touch = event.touches[0];
      const dx = touch.clientX - dragStartX;
      const dy = touch.clientY - dragStartY;
      applyRotation(
        dragStartRotationX - dy * DRAG_TILT_SENSITIVITY,
        dragStartRotationY + dx * DRAG_ROTATION_SENSITIVITY
      );
      event.preventDefault();
    },
    { passive: false }
  );

  window.addEventListener(
    'touchend',
    (event) => {
      if (event.touches.length === 0) {
        dragActive = false;
      }
    },
    { passive: true }
  );

  window.addEventListener(
    'touchcancel',
    () => {
      dragActive = false;
      pinchStartDistance = 0;
    },
    { passive: true }
  );

  let mouseDragging = false;
  window.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || !isGestureTarget(event.target)) return;
    mouseDragging = true;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragStartRotationX = currentRotationX;
    dragStartRotationY = currentRotationY;
  });

  window.addEventListener('mousemove', (event) => {
    if (!mouseDragging) return;
    const dx = event.clientX - dragStartX;
    const dy = event.clientY - dragStartY;
    applyRotation(
      dragStartRotationX - dy * DRAG_TILT_SENSITIVITY,
      dragStartRotationY + dx * DRAG_ROTATION_SENSITIVITY
    );
  });

  window.addEventListener('mouseup', () => {
    mouseDragging = false;
  });

  window.addEventListener('mouseleave', () => {
    mouseDragging = false;
  });
}

setSuimonModelSrc();
setupPanelToggle();
setupZoomButtons();
setupPinchZoom();
setupDragRotate();
