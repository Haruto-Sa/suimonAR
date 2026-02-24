import * as THREE from 'three';
import { MODEL_URLS } from '../models';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { LocationScene, metersToLatDelta, metersToLonDelta } from '../location/core';
import { setupUiMinimizer } from '../location/uiToggle';

// js-yaml を CDN から読み込んでいるため、グローバル宣言
declare const jsyaml: any;

type TargetModelConfig = {
  type: string | null;
  attributes: Record<string, unknown>;
};

type Target = {
  id: string | null;
  name: string;
  lat: number;
  lon: number;
  icon: string;
  color: string | null;
  model: TargetModelConfig | null;
};

type GeoPosition = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number | null;
};

type ModelKind = 'duck' | 'suimon' | 'wankosoba';
type DisplayMode = 'gps' | 'xr';

type PageConfig = {
  suimonConfigUrl: string | null;
  defaultHeight: number | null;
  defaultSize: number | null;
  defaultRotation: number | null;
  defaultModelKind: ModelKind | null;
  gpsMinDistance: number | null;
  gpsMinAccuracy: number | null;
};

type SuimonModelConfig = {
  id: string | null;
  name: string | null;
  lat: number;
  lon: number;
  modelFile: string | null;
  scale: number | null;
  sizeMeters: number | null;
  rotationYDeg: number | null;
  height: number | null;
  altitude: number | null;
  baseAltitudeMeters: number | null;
  realHeightMeters: number | null;
  offsetEast: number | null;
  offsetNorth: number | null;
};

type ModelTemplate = {
  root: THREE.Object3D;
  bboxMinY: number;
  bboxHeight: number;
};

const MODEL_KIND_TO_FILE: Record<ModelKind, string> = {
  duck: 'Duck.glb',
  suimon: 'suimon-kousin.glb',
  wankosoba: 'wankosoba.glb',
};

const TARGETS_CONFIG_URL = 'config/targets.yaml';
const PAGE_CONFIG = getPageConfig();
const SUIMON_CONFIG_URL = PAGE_CONFIG.suimonConfigUrl || 'config/locations.yaml';

const loader = new GLTFLoader();
const modelCache = new Map<ModelKind, ModelTemplate>();

const state = {
  selectedIndex: 0,
  hasFixedSpawned: false,
  lastPosition: null as GeoPosition | null,
  modelHeight: PAGE_CONFIG.defaultHeight ?? 1,
  // 後方互換のため既定値は 12 を維持し、realHeightMeters 指定地点では 1.0 を初期適用する。
  modelSize: PAGE_CONFIG.defaultSize ?? 12,
  modelRotationDeg: PAGE_CONFIG.defaultRotation ?? 0,
  selectedModelKind: PAGE_CONFIG.defaultModelKind ?? null,
  fixedAnchor: null as THREE.Group | null,
  fixedModel: null as THREE.Object3D | null,
  fixedObject: null as THREE.Object3D | null,
  loading: false,
  targets: [] as Target[],
  suimonModels: [] as SuimonModelConfig[],
  suimonByKey: new Map<string, SuimonModelConfig>(),
  gpsReady: false,
  configLoaded: false,
  offsetEast: 0,
  offsetNorth: 0,
  displayMode: 'gps' as DisplayMode,
  xrSupported: false,
  headingDeg: null as number | null,
  headingFromCompass: false,
};

const ui = {
  status: document.getElementById('info-status') as HTMLElement | null,
  current: document.getElementById('info-current') as HTMLElement | null,
  accuracy: document.getElementById('info-accuracy') as HTMLElement | null,
  altitude: document.getElementById('info-altitude') as HTMLElement | null,
  target: document.getElementById('info-target') as HTMLElement | null,
  distance: document.getElementById('info-distance') as HTMLElement | null,
  bearing: document.getElementById('info-bearing') as HTMLElement | null,
  orientationMode: document.getElementById('info-orientation-mode') as HTMLElement | null,
  displayMode: document.getElementById('info-display-mode') as HTMLElement | null,
  gpsWarning: document.getElementById('gps-warning-banner') as HTMLElement | null,
};

const controls = {
  modelSelect: document.getElementById('model-select') as HTMLSelectElement | null,
  targetSelect: document.getElementById('target-select') as HTMLSelectElement | null,
  heightSlider: document.getElementById('height-slider') as HTMLInputElement | null,
  heightValue: document.getElementById('height-value') as HTMLElement | null,
  sizeInput: document.getElementById('size-input') as HTMLInputElement | null,
  sizeValue: document.getElementById('size-value') as HTMLElement | null,
  rotationSlider: document.getElementById('rotation-slider') as HTMLInputElement | null,
  rotationValue: document.getElementById('rotation-value') as HTMLElement | null,
  offsetEastSlider: document.getElementById('offset-east-slider') as HTMLInputElement | null,
  offsetEastValue: document.getElementById('offset-east-value') as HTMLElement | null,
  offsetNorthSlider: document.getElementById('offset-north-slider') as HTMLInputElement | null,
  offsetNorthValue: document.getElementById('offset-north-value') as HTMLElement | null,
  startXrButton: document.getElementById('start-xr-button') as HTMLButtonElement | null,
};

function getPageConfig(): PageConfig {
  if (typeof document === 'undefined') {
    return {
      suimonConfigUrl: null,
      defaultHeight: null,
      defaultSize: null,
      defaultRotation: null,
      defaultModelKind: null,
      gpsMinDistance: null,
      gpsMinAccuracy: null,
    };
  }

  const datasets: Array<DOMStringMap | undefined> = [document.body?.dataset, document.documentElement?.dataset];
  const read = (key: keyof DOMStringMap): string | null => {
    for (const ds of datasets) {
      if (ds && typeof ds[key] === 'string') {
        return ds[key] as string;
      }
    }
    return null;
  };

  const toNumber = (value: string | null): number | null => {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const kindRaw = (read('modelKind') || '').toLowerCase();
  const normalizedKind: ModelKind | null =
    kindRaw === 'duck' || kindRaw === 'suimon' || kindRaw === 'wankosoba' ? (kindRaw as ModelKind) : null;

  return {
    suimonConfigUrl: read('suimonConfigUrl'),
    defaultHeight: toNumber(read('defaultHeight')),
    defaultSize: toNumber(read('defaultSize')),
    defaultRotation: toNumber(read('defaultRotation')),
    defaultModelKind: normalizedKind,
    gpsMinDistance: toNumber(read('gpsMinDistance')),
    gpsMinAccuracy: toNumber(read('gpsMinAccuracy')),
  };
}

function suimonKey(lat: number, lon: number): string {
  return `${lat.toFixed(8)},${lon.toFixed(8)}`;
}

function normalizeModelFileName(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split('/');
  return parts[parts.length - 1].toLowerCase();
}

function fileNameToModelKind(fileName: string | null | undefined): ModelKind | null {
  const normalized = normalizeModelFileName(fileName);
  if (!normalized) return null;
  if (normalized === 'duck.glb') return 'duck';
  if (normalized === 'suimon-kousin.glb') return 'suimon';
  if (normalized === 'wankosoba.glb') return 'wankosoba';
  return null;
}

function modelKindToFileName(kind: ModelKind | null): string {
  if (kind && MODEL_KIND_TO_FILE[kind]) return MODEL_KIND_TO_FILE[kind];
  return MODEL_KIND_TO_FILE.suimon;
}

function toNumberOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeTarget(raw: any): Target | null {
  if (!raw || typeof raw !== 'object') return null;
  const lat = Number(raw.latitude ?? raw.lat);
  const lon = Number(raw.longitude ?? raw.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    console.warn('[config] 無効な座標が検出されました', raw);
    return null;
  }
  return {
    id: raw.id ?? null,
    name:
      typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.trim()
        : `Target ${lat.toFixed(4)}`,
    lat,
    lon,
    icon: typeof raw.icon === 'string' && raw.icon.trim() ? raw.icon : '📍',
    color: typeof raw.color === 'string' && raw.color.trim() ? raw.color.trim() : null,
    model: sanitizeModelConfig(raw.model),
  };
}

function normalizeSuimonModel(raw: any): SuimonModelConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const lat = Number(raw.latitude ?? raw.lat);
  const lon = Number(raw.longitude ?? raw.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    console.warn('[suimon] 無効な座標が検出されました', raw);
    return null;
  }
  const modelObject = raw.model && typeof raw.model === 'object' ? raw.model : null;
  const modelKindFromObject = typeof modelObject?.kind === 'string' ? (modelObject.kind as string).toLowerCase() : '';
  const modelFileFromObject =
    typeof modelObject?.glb === 'string' && modelObject.glb.trim()
      ? modelObject.glb.trim()
      : modelKindFromObject === 'duck'
      ? 'Duck.glb'
      : modelKindFromObject === 'suimon'
      ? 'suimon-kousin.glb'
      : modelKindFromObject === 'wankosoba'
      ? 'wankosoba.glb'
      : null;
  const rotationRaw = raw.defaultRotationY ?? raw.rotationY ?? raw.rotation;
  return {
    id: typeof raw.id === 'string' ? raw.id : null,
    name: typeof raw.name === 'string' ? raw.name : null,
    lat,
    lon,
    modelFile:
      (typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : null) ??
      modelFileFromObject,
    scale: toNumberOrNull(raw.scale),
    sizeMeters: toNumberOrNull(raw.defaultSize ?? raw.sizeMeters ?? raw.size ?? modelObject?.size),
    rotationYDeg: toNumberOrNull(rotationRaw ?? modelObject?.rotationYDeg ?? modelObject?.rotation),
    height: toNumberOrNull(raw.defaultHeight ?? raw.height ?? modelObject?.height),
    altitude: toNumberOrNull(raw.altitude),
    baseAltitudeMeters: toNumberOrNull(raw.baseAltitudeMeters),
    realHeightMeters: toNumberOrNull(raw.realHeightMeters),
    offsetEast: toNumberOrNull(raw.offsetEast ?? modelObject?.offsetEast),
    offsetNorth: toNumberOrNull(raw.offsetNorth ?? modelObject?.offsetNorth),
  };
}

function sanitizeModelConfig(model: any): TargetModelConfig | null {
  if (!model || typeof model !== 'object') return null;
  const type =
    typeof model.type === 'string' && model.type.trim() ? (model.type.trim() as string) : null;
  const attributes: Record<string, unknown> = {};
  if (model.attributes && typeof model.attributes === 'object') {
    Object.entries(model.attributes).forEach(([key, value]) => {
      attributes[key] = value as unknown;
    });
  }
  return { type, attributes };
}

function pickModelFallback(target: Target): ModelKind {
  const index = Math.max(0, state.targets.indexOf(target));
  const options: ModelKind[] = ['duck', 'suimon', 'wankosoba'];
  return options[index % options.length];
}

function pickModel(target: Target): ModelKind {
  if (state.selectedModelKind) return state.selectedModelKind;
  const type = (target.model?.type as ModelKind | null)?.toLowerCase();
  if (type === 'duck' || type === 'suimon' || type === 'wankosoba') return type;
  return pickModelFallback(target);
}

function getSelectedTarget(): Target | null {
  if (!state.targets.length) return null;
  return state.targets[state.selectedIndex] || state.targets[0];
}

function summarizeTarget(target: Target | null) {
  if (!target) return null;
  return {
    id: target.id,
    name: target.name,
    lat: target.lat,
    lon: target.lon,
    icon: target.icon,
    model: target.model?.type ?? null,
  };
}

function getSuimonConfigForTarget(target: Target): SuimonModelConfig | null {
  const key = suimonKey(target.lat, target.lon);
  const direct = state.suimonByKey.get(key);
  if (direct) return direct;

  let best: SuimonModelConfig | null = null;
  let bestDist = Infinity;
  for (const cfg of state.suimonModels) {
    const dLat = Math.abs(cfg.lat - target.lat);
    const dLon = Math.abs(cfg.lon - target.lon);
    const dist = dLat + dLon;
    if (dist < bestDist && dist < 1e-4) {
      bestDist = dist;
      best = cfg;
    }
  }
  return best;
}

function resolveTargetAltitude(cfg: SuimonModelConfig | null): number {
  if (cfg && typeof cfg.altitude === 'number') return cfg.altitude;
  if (cfg && typeof cfg.baseAltitudeMeters === 'number') return cfg.baseAltitudeMeters;
  return 0;
}

function isRealScaleTarget(target: Target | null): boolean {
  if (!target) return false;
  const cfg = getSuimonConfigForTarget(target);
  return !!cfg && typeof cfg.realHeightMeters === 'number' && cfg.realHeightMeters > 0;
}

function syncSizeUiMode() {
  const target = getSelectedTarget();
  const usingRealScale = isRealScaleTarget(target);
  if (controls.sizeInput) {
    controls.sizeInput.min = usingRealScale ? '0.1' : '0.05';
    controls.sizeInput.step = usingRealScale ? '0.1' : '0.05';
  }
  if (controls.sizeValue) {
    controls.sizeValue.textContent = usingRealScale
      ? `${state.modelSize.toFixed(2)} x`
      : `${state.modelSize.toFixed(2)} m`;
  }
}

function syncControlsWithState() {
  if (controls.heightSlider) controls.heightSlider.value = String(state.modelHeight);
  if (controls.heightValue) controls.heightValue.textContent = `${state.modelHeight.toFixed(1)} m`;
  if (controls.sizeInput) controls.sizeInput.value = String(state.modelSize);
  syncSizeUiMode();
  if (controls.rotationSlider) controls.rotationSlider.value = String(state.modelRotationDeg);
  if (controls.rotationValue) controls.rotationValue.textContent = `${state.modelRotationDeg.toFixed(0)}°`;
  if (controls.offsetEastSlider) controls.offsetEastSlider.value = String(state.offsetEast);
  if (controls.offsetEastValue) controls.offsetEastValue.textContent = `${state.offsetEast.toFixed(1)} m`;
  if (controls.offsetNorthSlider) controls.offsetNorthSlider.value = String(state.offsetNorth);
  if (controls.offsetNorthValue) controls.offsetNorthValue.textContent = `${state.offsetNorth.toFixed(1)} m`;
  if (controls.modelSelect) {
    const value = state.selectedModelKind ?? '';
    if (controls.modelSelect.value !== value) controls.modelSelect.value = value;
  }
}

function updateModeUi(extraMessage = '') {
  if (ui.displayMode) {
    ui.displayMode.textContent = state.displayMode === 'xr' ? '高精度ARモード (WebXR)' : 'GPSモード';
  }
  if (ui.orientationMode && state.displayMode === 'xr') {
    ui.orientationMode.textContent = 'WebXRトラッキング';
  }

  if (ui.gpsWarning) {
    if (state.displayMode === 'xr') {
      ui.gpsWarning.style.display = extraMessage ? '' : 'none';
      ui.gpsWarning.textContent = extraMessage || '';
      ui.gpsWarning.classList.toggle('warning-emphasis', !!extraMessage);
    } else {
      ui.gpsWarning.style.display = '';
      ui.gpsWarning.textContent =
        'GPS/コンパス誤差により数mズレる可能性があります。実在物との厳密一致が必要な場合は高精度ARを使用してください。';
      ui.gpsWarning.classList.remove('warning-emphasis');
    }
  }

  if (controls.startXrButton) {
    controls.startXrButton.style.display = state.xrSupported ? '' : 'none';
    controls.startXrButton.disabled = !state.xrSupported || state.displayMode === 'xr';
    controls.startXrButton.textContent =
      state.displayMode === 'xr' ? '高精度AR稼働中' : '高精度AR開始 (WebXR)';
  }
}

function applyDefaultsFromConfig(models: SuimonModelConfig[]) {
  if (!models.length) return;
  const first = models[0];
  let updated = false;

  if (PAGE_CONFIG.defaultHeight === null && typeof first.height === 'number') {
    state.modelHeight = first.height;
    updated = true;
  }
  if (PAGE_CONFIG.defaultSize === null && typeof first.sizeMeters === 'number') {
    state.modelSize = first.sizeMeters;
    updated = true;
  }
  if (PAGE_CONFIG.defaultRotation === null && typeof first.rotationYDeg === 'number') {
    state.modelRotationDeg = first.rotationYDeg;
    updated = true;
  }
  if (typeof first.offsetEast === 'number') {
    state.offsetEast = first.offsetEast;
    updated = true;
  }
  if (typeof first.offsetNorth === 'number') {
    state.offsetNorth = first.offsetNorth;
    updated = true;
  }

  if (
    PAGE_CONFIG.defaultSize === null &&
    typeof first.realHeightMeters === 'number' &&
    first.realHeightMeters > 0 &&
    typeof first.sizeMeters !== 'number'
  ) {
    state.modelSize = 1;
    updated = true;
  }

  if (updated) syncControlsWithState();
}

function applySelectedTargetConfigDefaults(): void {
  const target = getSelectedTarget();
  if (!target) return;
  const cfg = getSuimonConfigForTarget(target);
  if (!cfg) {
    syncSizeUiMode();
    return;
  }

  let changed = false;
  if (typeof cfg.height === 'number' && state.modelHeight !== cfg.height) {
    state.modelHeight = cfg.height;
    changed = true;
  }
  if (typeof cfg.sizeMeters === 'number' && state.modelSize !== cfg.sizeMeters) {
    state.modelSize = cfg.sizeMeters;
    changed = true;
  }
  if (
    typeof cfg.realHeightMeters === 'number' &&
    cfg.realHeightMeters > 0 &&
    typeof cfg.sizeMeters !== 'number' &&
    PAGE_CONFIG.defaultSize === null &&
    state.modelSize !== 1
  ) {
    state.modelSize = 1;
    changed = true;
  }
  if (typeof cfg.rotationYDeg === 'number' && state.modelRotationDeg !== cfg.rotationYDeg) {
    state.modelRotationDeg = cfg.rotationYDeg;
    changed = true;
  }
  if (typeof cfg.offsetEast === 'number' && state.offsetEast !== cfg.offsetEast) {
    state.offsetEast = cfg.offsetEast;
    changed = true;
  }
  if (typeof cfg.offsetNorth === 'number' && state.offsetNorth !== cfg.offsetNorth) {
    state.offsetNorth = cfg.offsetNorth;
    changed = true;
  }

  if (changed) syncControlsWithState();
  else syncSizeUiMode();
}

async function loadTargetsConfig(): Promise<Target[]> {
  const response = await fetch(TARGETS_CONFIG_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  if (typeof jsyaml === 'undefined' || typeof jsyaml.load !== 'function') {
    throw new Error('js-yaml ローダーが利用できません');
  }
  const text = await response.text();
  const parsed = jsyaml.load(text);
  const rawTargets = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.targets)
    ? parsed.targets
    : [];
  const normalized = (rawTargets as any[]).map(normalizeTarget).filter(Boolean) as Target[];
  if (!normalized.length) {
    throw new Error('有効な地点が設定されていません');
  }
  state.targets = normalized;
  state.selectedIndex = Math.min(state.selectedIndex, state.targets.length - 1);
  if (state.selectedIndex < 0) state.selectedIndex = 0;
  logEvent('config-load', 'ターゲット設定を読み込みました', { count: normalized.length });
  return state.targets;
}

async function loadSuimonConfig(): Promise<SuimonModelConfig[]> {
  const response = await fetch(SUIMON_CONFIG_URL, { cache: 'no-store' });
  if (!response.ok) {
    console.warn(`[suimon] ${SUIMON_CONFIG_URL} の読み込みに失敗しました`, response.status);
    return [];
  }
  if (typeof jsyaml === 'undefined' || typeof jsyaml.load !== 'function') {
    console.warn('[suimon] js-yaml ローダーが利用できません');
    return [];
  }

  const text = await response.text();
  const parsed = jsyaml.load(text);
  const rawModels =
    Array.isArray((parsed as any)?.locations)
      ? (parsed as any).locations
      : Array.isArray((parsed as any)?.models)
      ? (parsed as any).models
      : Array.isArray(parsed)
      ? (parsed as any)
      : [];

  const normalized = (rawModels as any[]).map(normalizeSuimonModel).filter(Boolean) as SuimonModelConfig[];
  state.suimonModels = normalized;
  state.suimonByKey.clear();
  normalized.forEach((m) => {
    state.suimonByKey.set(suimonKey(m.lat, m.lon), m);
  });
  applyDefaultsFromConfig(normalized);
  console.log(`[suimon] ${SUIMON_CONFIG_URL} を読み込みました (${normalized.length} 件)`);
  return normalized;
}

function buildTargetsFromSuimon(): void {
  if (!state.suimonModels.length) return;
  const targets: Target[] = state.suimonModels.map((m, index) => {
    const name = (m.name && m.name.trim()) || (m.id && m.id.trim()) || `水門 #${index + 1}`;
    return {
      id: m.id,
      name,
      lat: m.lat,
      lon: m.lon,
      icon: '🌊',
      color: '#4e9bff',
      model: { type: 'suimon', attributes: {} },
    };
  });
  state.targets = targets;
  state.selectedIndex = Math.min(state.selectedIndex, state.targets.length - 1);
  if (state.selectedIndex < 0) state.selectedIndex = 0;
  logEvent('config-load', 'locations から地点設定を構築しました', {
    count: targets.length,
    source: 'locations.yaml',
  });
}

function getModelUrl(kind: ModelKind, target: Target): string {
  const cfg = getSuimonConfigForTarget(target);
  const mappedKind = fileNameToModelKind(cfg?.modelFile);
  if (kind === 'suimon' && mappedKind) {
    return MODEL_URLS[mappedKind];
  }
  if (kind === 'suimon') return MODEL_URLS.suimon;
  if (kind === 'wankosoba') return MODEL_URLS.wankosoba;
  return MODEL_URLS.duck;
}

async function loadModelTemplate(kind: ModelKind, target: Target): Promise<ModelTemplate> {
  const cached = modelCache.get(kind);
  if (cached) return cached;

  const url = getModelUrl(kind, target);
  const gltf = await new Promise<any>((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
  const root = gltf.scene || gltf.scenes?.[0];
  if (!root) {
    throw new Error('GLB にシーンが含まれていません');
  }
  const box = new THREE.Box3().setFromObject(root);
  const height = box.max.y - box.min.y;

  const modelTemplate: ModelTemplate = {
    root,
    bboxMinY: Number.isFinite(box.min.y) ? box.min.y : 0,
    bboxHeight: Number.isFinite(height) && height > 0 ? height : 1,
  };
  modelCache.set(kind, modelTemplate);
  return modelTemplate;
}

function computeModelScale(target: Target, template: ModelTemplate): number {
  const cfg = getSuimonConfigForTarget(target);

  if (cfg && typeof cfg.realHeightMeters === 'number' && cfg.realHeightMeters > 0) {
    const multiplier = Number.isFinite(state.modelSize) ? state.modelSize : 1;
    return (cfg.realHeightMeters * multiplier) / template.bboxHeight;
  }

  const legacyMultiplier = cfg && typeof cfg.scale === 'number' ? cfg.scale : 1;
  const scaleMeters = state.modelSize * legacyMultiplier;
  return scaleMeters / 10;
}

function applyModelTransform(
  obj: THREE.Object3D,
  target: Target,
  template: ModelTemplate,
  options: { includeHeightInModelPosition: boolean; yawOffsetDeg?: number }
): void {
  const scale = computeModelScale(target, template);
  const yawOffsetDeg = options.yawOffsetDeg ?? 0;

  obj.scale.setScalar(scale);
  obj.rotation.y = ((state.modelRotationDeg + yawOffsetDeg) * Math.PI) / 180;

  const bottomY = template.bboxMinY * scale;
  const heightOffset = options.includeHeightInModelPosition ? state.modelHeight : 0;
  obj.position.set(0, heightOffset - bottomY, 0);
}

function prepareModelInstance(obj: THREE.Object3D): THREE.Object3D {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = false;
      child.receiveShadow = false;
      child.frustumCulled = false;
    }
  });
  return obj;
}

async function createTargetObject(
  target: Target,
  options: { includeHeightInModelPosition: boolean; yawOffsetDeg?: number }
): Promise<THREE.Object3D> {
  const kind = pickModel(target);
  const template = await loadModelTemplate(kind, target);
  const inst = template.root.clone(true);
  applyModelTransform(inst, target, template, options);
  return prepareModelInstance(inst);
}

function calcDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6378137;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calcBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const lam1 = (lon1 * Math.PI) / 180;
  const lam2 = (lon2 * Math.PI) / 180;
  const y = Math.sin(lam2 - lam1) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(lam2 - lam1);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

function bearingToCompass(bearing: number): string {
  const dirs = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
  const index = Math.round(bearing / 45) % 8;
  return `${dirs[index]} (${bearing.toFixed(1)}°)`;
}

function formatLatLon(lat: number, lon: number): string {
  const format = (value: number, positive: string, negative: string) => {
    const sign = value >= 0 ? positive : negative;
    return `${Math.abs(value).toFixed(6)}°${sign}`;
  };
  return `${format(lat, 'N', 'S')} / ${format(lon, 'E', 'W')}`;
}

function updateInfoPanel(position: GeoPosition) {
  const target = getSelectedTarget();
  if (ui.current) ui.current.textContent = formatLatLon(position.latitude, position.longitude);

  if (ui.accuracy) {
    const acc = position.accuracy;
    ui.accuracy.textContent = typeof acc === 'number' ? `${acc.toFixed(1)} m` : '--';
  }

  if (ui.altitude) {
    if (typeof position.altitude === 'number' && Number.isFinite(position.altitude)) {
      ui.altitude.textContent = `${position.altitude.toFixed(1)} m`;
    } else {
      ui.altitude.textContent = '高度未取得';
    }
  }

  if (target) {
    const distance = calcDistanceMeters(position.latitude, position.longitude, target.lat, target.lon);
    if (ui.distance) ui.distance.textContent = `${distance.toFixed(distance >= 1000 ? 0 : 1)} m`;

    const bearing = calcBearing(position.latitude, position.longitude, target.lat, target.lon);
    if (ui.bearing) ui.bearing.textContent = bearingToCompass(bearing);
  } else {
    if (ui.distance) ui.distance.textContent = '--';
    if (ui.bearing) ui.bearing.textContent = '--';
  }

  if (ui.status) {
    ui.status.textContent = state.displayMode === 'xr' ? '高精度AR追跡中' : 'GPS追跡中';
  }
}

function logEvent(type: string, message: string, details: Record<string, unknown> = {}, attachLocation = false) {
  const payload: any = { type, message, details };
  if (attachLocation && state.lastPosition) {
    payload.location = {
      lat: state.lastPosition.latitude,
      lon: state.lastPosition.longitude,
      altitude: state.lastPosition.altitude ?? null,
    };
  }
  console.log(`[log][${type}] ${message}`, details);
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch((error) => {
    console.warn('[log] サーバー送信に失敗しました', error);
  });
}

class GpsModeController {
  private scene: LocationScene | null = null;

  start(): void {
    if (this.scene) return;

    this.scene = new LocationScene({
      gpsMinDistance: PAGE_CONFIG.gpsMinDistance ?? 0.5,
      gpsMinAccuracy: PAGE_CONFIG.gpsMinAccuracy ?? 60,
    });

    this.scene.onGpsUpdate((pos) => {
      handlePositionUpdate(
        {
          latitude: pos.latitude,
          longitude: pos.longitude,
          accuracy: pos.accuracy,
          altitude: pos.altitude,
        },
        'locar-gps'
      );
    });

    this.scene.onOrientationStatus((status) => {
      if (!ui.orientationMode) return;
      if (status === 'sensor') {
        ui.orientationMode.textContent = 'ジャイロ/コンパス';
      } else if (status === 'touch') {
        ui.orientationMode.textContent = 'タッチ操作 (スワイプで回転)';
        const btn = document.getElementById('motion-permission-button') as HTMLButtonElement | null;
        if (btn && needsIOSPermission()) btn.style.display = '';
      }
    });
  }

  stop(): void {
    if (!this.scene) return;
    this.scene.dispose();
    this.scene = null;
  }

  reconnectOrientation(): void {
    this.scene?.reconnectOrientation();
  }

  addAtLatLon(object: THREE.Object3D, lat: number, lon: number, altitude?: number): void {
    this.scene?.addAtLatLon(object, lat, lon, altitude);
  }

  remove(object: THREE.Object3D): void {
    this.scene?.remove(object);
  }

  get isActive(): boolean {
    return !!this.scene;
  }
}

class XrModeController {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private session: XRSession | null = null;
  private targetAnchor: THREE.Group | null = null;
  private startPosition: GeoPosition | null = null;
  private headingDeg = 0;
  private manualEnding = false;
  private onEnded: (() => void) | null = null;

  async start(params: {
    target: Target;
    startPosition: GeoPosition;
    headingDeg: number | null;
    onEnded: () => void;
  }): Promise<{ usedBearingFallback: boolean }> {
    if (!navigator.xr) throw new Error('WebXR が利用できません');
    if (this.session) throw new Error('すでにXRセッションが開始されています');

    this.onEnded = params.onEnded;
    this.startPosition = params.startPosition;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;

    renderer.domElement.style.position = 'fixed';
    renderer.domElement.style.inset = '0';
    renderer.domElement.style.width = '100vw';
    renderer.domElement.style.height = '100vh';
    renderer.domElement.style.zIndex = '2';
    renderer.domElement.style.pointerEvents = 'none';

    const ambient = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1.2);
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(1, 2, 1);
    scene.add(ambient);
    scene.add(directional);

    const xrSession = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.body },
    } as any);

    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.session = xrSession;

    const headingResult = this.resolveHeading(params.headingDeg, params.startPosition, params.target);
    this.headingDeg = headingResult.headingDeg;

    document.body.appendChild(renderer.domElement);

    renderer.xr.setReferenceSpaceType('local-floor');
    await renderer.xr.setSession(xrSession);

    await this.placeTarget(params.target);

    xrSession.addEventListener('end', () => {
      const userEnded = !this.manualEnding;
      this.cleanup();
      if (userEnded) {
        this.onEnded?.();
      }
    });

    renderer.setAnimationLoop(() => {
      if (this.scene && this.camera) {
        renderer.render(this.scene, this.camera);
      }
    });

    return { usedBearingFallback: headingResult.usedFallback };
  }

  private resolveHeading(
    headingDeg: number | null,
    position: GeoPosition,
    target: Target
  ): { headingDeg: number; usedFallback: boolean } {
    if (typeof headingDeg === 'number' && Number.isFinite(headingDeg)) {
      return { headingDeg, usedFallback: false };
    }

    const fallback = calcBearing(position.latitude, position.longitude, target.lat, target.lon);
    return { headingDeg: fallback, usedFallback: true };
  }

  private async placeTarget(target: Target): Promise<void> {
    if (!this.scene || !this.startPosition) return;

    if (this.targetAnchor) {
      this.scene.remove(this.targetAnchor);
      this.targetAnchor = null;
    }

    const model = await createTargetObject(target, {
      includeHeightInModelPosition: false,
      yawOffsetDeg: -this.headingDeg,
    });

    const cfg = getSuimonConfigForTarget(target);
    const targetAltitude = resolveTargetAltitude(cfg);

    const dLat = target.lat + metersToLatDelta(state.offsetNorth) - this.startPosition.latitude;
    const dLon = target.lon + metersToLonDelta(state.offsetEast, target.lat) - this.startPosition.longitude;

    const east = dLon * 111320 * Math.cos((this.startPosition.latitude * Math.PI) / 180);
    const north = dLat * 110540;
    const userAltitude =
      typeof this.startPosition.altitude === 'number' && Number.isFinite(this.startPosition.altitude)
        ? this.startPosition.altitude
        : 0;
    const up = targetAltitude - userAltitude + state.modelHeight;

    const headingRad = (this.headingDeg * Math.PI) / 180;
    const localX = east * Math.cos(headingRad) - north * Math.sin(headingRad);
    const localForward = east * Math.sin(headingRad) + north * Math.cos(headingRad);
    const localZ = -localForward;

    const anchor = new THREE.Group();
    anchor.position.set(localX, up, localZ);
    anchor.add(model);

    this.scene.add(anchor);
    this.targetAnchor = anchor;
  }

  async refreshTarget(target: Target): Promise<void> {
    if (!this.session) return;
    await this.placeTarget(target);
  }

  async stop(): Promise<void> {
    if (!this.session) return;
    this.manualEnding = true;
    try {
      await this.session.end();
    } catch (error) {
      console.warn('[xr] セッション終了時エラー', error);
      this.cleanup();
    }
  }

  private cleanup(): void {
    this.manualEnding = false;

    if (this.renderer) {
      this.renderer.setAnimationLoop(null);
      this.renderer.dispose();
      if (this.renderer.domElement.parentElement) {
        this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
      }
    }

    this.targetAnchor = null;
    this.session = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.startPosition = null;
  }

  get isActive(): boolean {
    return !!this.session;
  }
}

let gpsController: GpsModeController | null = null;
const xrController = new XrModeController();

function resetFixedObject() {
  if (state.fixedAnchor && gpsController?.isActive) {
    gpsController.remove(state.fixedAnchor);
  }
  state.fixedAnchor = null;
  state.fixedModel = null;
  state.fixedObject = null;
  state.hasFixedSpawned = false;
}

async function spawnFixedTarget() {
  if (state.hasFixedSpawned || state.loading || state.displayMode !== 'gps') return;
  const target = getSelectedTarget();
  if (!target || !gpsController?.isActive) return;

  state.loading = true;
  try {
    const model = await createTargetObject(target, {
      includeHeightInModelPosition: true,
    });

    const anchor = new THREE.Group();
    anchor.add(model);

    const cfg = getSuimonConfigForTarget(target);
    const altitude = resolveTargetAltitude(cfg);

    const finalLat = target.lat + metersToLatDelta(state.offsetNorth);
    const finalLon = target.lon + metersToLonDelta(state.offsetEast, target.lat);

    state.fixedAnchor = anchor;
    state.fixedModel = model;
    state.fixedObject = anchor;

    gpsController.addAtLatLon(anchor, finalLat, finalLon, altitude);
    state.hasFixedSpawned = true;

    logEvent('spawn-fixed', '固定モデルを配置しました', {
      target: summarizeTarget(target),
      altitude,
      offsetEast: state.offsetEast,
      offsetNorth: state.offsetNorth,
      mode: 'gps',
    });
  } catch (error) {
    console.warn('[model] load failed', error);
  } finally {
    state.loading = false;
  }
}

async function refreshCurrentPlacement(): Promise<void> {
  const target = getSelectedTarget();
  if (!target) return;

  if (state.displayMode === 'xr' && xrController.isActive) {
    await xrController.refreshTarget(target);
    return;
  }

  resetFixedObject();
  await spawnFixedTarget();
}

function handlePositionUpdate(position: GeoPosition, source = 'gps-event') {
  if (!position) return;
  state.lastPosition = position;
  updateInfoPanel(position);

  if (!state.gpsReady) {
    state.gpsReady = true;
    console.log('[gps] GPS ready via', source);
    logEvent('gps-ready', 'GPS 原点を取得しました', {
      lat: position.latitude,
      lon: position.longitude,
      accuracy: position.accuracy,
      altitude: position.altitude ?? null,
    });
  }

  if (state.configLoaded && state.gpsReady && !state.hasFixedSpawned && state.displayMode === 'gps') {
    void spawnFixedTarget();
  }
}

function updateTargetInfo() {
  const target = getSelectedTarget();
  if (controls.targetSelect) {
    controls.targetSelect.value = state.targets.length ? String(state.selectedIndex) : '';
  }
  if (!target) {
    if (ui.target) ui.target.textContent = '--';
    return;
  }
  if (ui.target) {
    ui.target.textContent = `${target.name} / ${formatLatLon(target.lat, target.lon)}`;
  }
  syncSizeUiMode();
}

function setupTargetOptions() {
  const select = controls.targetSelect;
  if (!select) return;

  select.innerHTML = '';
  if (!state.targets.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '地点設定なし';
    select.appendChild(option);
    select.disabled = true;
    return;
  }

  select.disabled = false;
  state.targets.forEach((target, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `${target.icon || '📍'} ${target.name}`;
    select.appendChild(option);
  });
  select.value = String(state.selectedIndex);

  if (!select.dataset.bound) {
    select.addEventListener('change', (event) => {
      void handleTargetChange((event.target as HTMLSelectElement).value);
    });
    select.dataset.bound = '1';
  }
}

async function handleTargetChange(value: string) {
  const index = Number(value);
  if (!Number.isInteger(index) || !state.targets[index]) {
    console.warn('[target] 無効な選択値', value);
    return;
  }
  if (index === state.selectedIndex) return;

  state.selectedIndex = index;
  applySelectedTargetConfigDefaults();
  updateTargetInfo();
  if (state.lastPosition) updateInfoPanel(state.lastPosition);

  await refreshCurrentPlacement();

  logEvent('target-switch', '地点を切り替えました', { target: summarizeTarget(getSelectedTarget()) }, true);
}

function setupModelControl() {
  const select = controls.modelSelect;
  if (!select) return;

  select.value = state.selectedModelKind ?? '';
  if (!select.dataset.bound) {
    select.addEventListener('change', () => {
      const value = select.value;
      if (value === '') {
        state.selectedModelKind = null;
      } else if (value === 'duck' || value === 'suimon' || value === 'wankosoba') {
        state.selectedModelKind = value;
      } else {
        state.selectedModelKind = null;
      }

      void refreshCurrentPlacement();
      logEvent('model-switch', 'モデル選択を切り替えました', { modelKind: state.selectedModelKind ?? 'auto' }, true);
    });
    select.dataset.bound = '1';
  }
}

function setupHeightControl() {
  const slider = controls.heightSlider;
  const label = controls.heightValue;
  if (!slider || !label) return;

  slider.value = String(state.modelHeight);
  label.textContent = `${state.modelHeight.toFixed(1)} m`;

  slider.addEventListener('input', (event) => {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    state.modelHeight = value;
    label.textContent = `${state.modelHeight.toFixed(1)} m`;
    void refreshCurrentPlacement();
  });

  slider.addEventListener('change', () => {
    logEvent('height-adjust', 'モデル高さを調整しました', { height: state.modelHeight.toFixed(2) }, true);
  });
}

function setupSizeControl() {
  const input = controls.sizeInput;
  const label = controls.sizeValue;
  if (!input || !label) return;

  input.value = String(state.modelSize);
  syncSizeUiMode();

  const handleUpdate = () => {
    const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    state.modelSize = value;
    syncSizeUiMode();
    void refreshCurrentPlacement();
  };

  input.addEventListener('input', handleUpdate);
  input.addEventListener('change', () => {
    handleUpdate();
    logEvent('size-adjust', 'モデルサイズを調整しました', { value: state.modelSize.toFixed(2) }, true);
  });
}

function setupRotationControl() {
  const slider = controls.rotationSlider;
  const label = controls.rotationValue;
  if (!slider || !label) return;

  slider.value = String(state.modelRotationDeg);
  label.textContent = `${state.modelRotationDeg.toFixed(0)}°`;

  slider.addEventListener('input', (event) => {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    state.modelRotationDeg = value;
    label.textContent = `${state.modelRotationDeg.toFixed(0)}°`;
    void refreshCurrentPlacement();
  });

  slider.addEventListener('change', () => {
    logEvent('rotation-adjust', 'モデル向きを調整しました', { rotationY: state.modelRotationDeg.toFixed(1) }, true);
  });
}

function setupOffsetEastControl() {
  const slider = controls.offsetEastSlider;
  const label = controls.offsetEastValue;
  if (!slider || !label) return;

  slider.value = String(state.offsetEast);
  label.textContent = `${state.offsetEast.toFixed(1)} m`;

  slider.addEventListener('input', (event) => {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    state.offsetEast = value;
    label.textContent = `${state.offsetEast.toFixed(1)} m`;
    void refreshCurrentPlacement();
  });

  slider.addEventListener('change', () => {
    logEvent('offset-east-adjust', '東西オフセットを調整しました', { offsetEast: state.offsetEast.toFixed(1) }, true);
  });
}

function setupOffsetNorthControl() {
  const slider = controls.offsetNorthSlider;
  const label = controls.offsetNorthValue;
  if (!slider || !label) return;

  slider.value = String(state.offsetNorth);
  label.textContent = `${state.offsetNorth.toFixed(1)} m`;

  slider.addEventListener('input', (event) => {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    state.offsetNorth = value;
    label.textContent = `${state.offsetNorth.toFixed(1)} m`;
    void refreshCurrentPlacement();
  });

  slider.addEventListener('change', () => {
    logEvent('offset-north-adjust', '南北オフセットを調整しました', { offsetNorth: state.offsetNorth.toFixed(1) }, true);
  });
}

function setupCopyConfigButton() {
  const button = document.getElementById('copy-config-button') as HTMLButtonElement | null;
  if (!button) return;

  button.addEventListener('click', async () => {
    const target = getSelectedTarget();
    if (!target) {
      alert('コピーできる地点がありません。先に地点を選択してください。');
      return;
    }

    const cfg = getSuimonConfigForTarget(target);
    const selectedKind = state.selectedModelKind ?? fileNameToModelKind(cfg?.modelFile) ?? 'suimon';
    const resolvedModelFile = cfg?.modelFile ?? modelKindToFileName(selectedKind);
    const altitude = resolveTargetAltitude(cfg);
    const safeId = (target.id || 'new-location').replace(/"/g, '\\"');
    const safeName = (target.name || '新規地点').replace(/"/g, '\\"');
    const realHeight =
      cfg && typeof cfg.realHeightMeters === 'number' && Number.isFinite(cfg.realHeightMeters)
        ? cfg.realHeightMeters
        : null;

    const lines: string[] = [
      `- id: \"${safeId}\"`,
      `  name: \"${safeName}\"`,
      `  latitude: ${target.lat}`,
      `  longitude: ${target.lon}`,
      `  baseAltitudeMeters: ${altitude}`,
      realHeight !== null ? `  realHeightMeters: ${realHeight}` : '  realHeightMeters: 8.5',
      `  defaultHeight: ${state.modelHeight}`,
      `  defaultSize: ${state.modelSize}`,
      `  defaultRotationY: ${state.modelRotationDeg}`,
      `  offsetEast: ${state.offsetEast}`,
      `  offsetNorth: ${state.offsetNorth}`,
      `  model: \"${resolvedModelFile}\"`,
    ];

    const text = lines.join('\n');

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      alert('locations YAML 断片をコピーしました。locations-heiRiver.yaml の locations: 配下へ貼り付けできます。');
    } catch (error) {
      console.warn('[copy-config] failed', error);
      alert('コピーに失敗しました。ブラウザの制限で許可されていない可能性があります。');
    }
  });
}

function needsIOSPermission(): boolean {
  const needsMotion =
    typeof DeviceMotionEvent !== 'undefined' &&
    typeof (DeviceMotionEvent as any).requestPermission === 'function';
  const needsOrientation =
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof (DeviceOrientationEvent as any).requestPermission === 'function';
  return needsMotion || needsOrientation;
}

async function requestMotionPermission(): Promise<boolean> {
  let granted = true;
  try {
    if (
      typeof DeviceMotionEvent !== 'undefined' &&
      typeof (DeviceMotionEvent as any).requestPermission === 'function'
    ) {
      const r = await (DeviceMotionEvent as any).requestPermission();
      granted = granted && (r === 'granted' || r === undefined);
    }
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof (DeviceOrientationEvent as any).requestPermission === 'function'
    ) {
      const r = await (DeviceOrientationEvent as any).requestPermission();
      granted = granted && (r === 'granted' || r === undefined);
    }
  } catch (e) {
    console.warn('[perm] requestPermission failed', e);
    return false;
  }
  return granted;
}

function setupReRequestButton() {
  const button = document.getElementById('motion-permission-button') as HTMLButtonElement | null;
  if (!button) return;

  if (!needsIOSPermission()) {
    button.style.display = 'none';
    return;
  }

  button.addEventListener('click', async () => {
    const ok = await requestMotionPermission();
    if (ok) {
      gpsController?.reconnectOrientation();
      button.style.display = 'none';
    }
  });
}

function setupHeadingTracker() {
  const updateHeading = (evt: Event) => {
    const e = evt as DeviceOrientationEvent & { webkitCompassHeading?: number };

    if (typeof e.webkitCompassHeading === 'number' && Number.isFinite(e.webkitCompassHeading)) {
      state.headingDeg = ((e.webkitCompassHeading % 360) + 360) % 360;
      state.headingFromCompass = true;
      return;
    }

    if (typeof e.alpha === 'number' && Number.isFinite(e.alpha)) {
      state.headingDeg = ((360 - e.alpha) % 360 + 360) % 360;
      state.headingFromCompass = false;
    }
  };

  window.addEventListener('deviceorientation', updateHeading, { passive: true });
  window.addEventListener('deviceorientationabsolute', updateHeading, { passive: true });
}

async function checkWebXRSupport(): Promise<boolean> {
  if (!navigator.xr) return false;
  try {
    return await navigator.xr.isSessionSupported('immersive-ar');
  } catch {
    return false;
  }
}

async function switchToGpsMode(reason = ''): Promise<void> {
  if (state.displayMode === 'xr') {
    await xrController.stop();
  }

  if (!gpsController) {
    gpsController = new GpsModeController();
  }
  gpsController.start();
  if (ui.orientationMode) ui.orientationMode.textContent = '検出中...';

  state.displayMode = 'gps';
  updateModeUi(reason);
  if (state.lastPosition) updateInfoPanel(state.lastPosition);

  if (state.configLoaded && state.gpsReady && !state.hasFixedSpawned) {
    await spawnFixedTarget();
  }
}

async function switchToXrMode(): Promise<void> {
  if (!state.xrSupported) {
    alert('この端末は WebXR 高精度ARに対応していません。GPSモードを利用してください。');
    return;
  }

  const target = getSelectedTarget();
  if (!target) {
    alert('地点設定がありません。');
    return;
  }

  if (!state.lastPosition) {
    alert('GPSが未取得です。位置情報が取得できてから再度実行してください。');
    return;
  }

  if (needsIOSPermission()) {
    await requestMotionPermission();
  }

  resetFixedObject();
  gpsController?.stop();

  try {
    const result = await xrController.start({
      target,
      startPosition: state.lastPosition,
      headingDeg: state.headingDeg,
      onEnded: () => {
        state.displayMode = 'gps';
        updateModeUi();
        void switchToGpsMode();
      },
    });

    state.displayMode = 'xr';
    updateModeUi(
      result.usedBearingFallback
        ? '方位センサーが不安定なため、地点方位から初期向きを推定しました。'
        : ''
    );
    if (state.lastPosition) updateInfoPanel(state.lastPosition);

    logEvent('mode-switch', '高精度ARモードに切り替えました', {
      target: summarizeTarget(target),
      headingDeg: state.headingDeg,
      headingSource: state.headingFromCompass ? 'compass' : 'alpha-or-fallback',
      fallbackUsed: result.usedBearingFallback,
    }, true);
  } catch (error) {
    console.warn('[xr] start failed', error);
    alert('高精度ARモードを開始できませんでした。GPSモードに戻ります。');
    await switchToGpsMode('高精度ARを開始できなかったためGPSモードで継続します。');
  }
}

function setupDisplayModeControl() {
  const button = controls.startXrButton;
  if (!button) return;
  if (!button.dataset.bound) {
    button.addEventListener('click', () => {
      void switchToXrMode();
    });
    button.dataset.bound = '1';
  }
}

function handleConfigLoadError(error: unknown) {
  console.warn('[config] locations / targets の読み込みに失敗しました', error);
  logEvent('config-error', '地点設定の読み込みに失敗しました', {
    message: (error as Error)?.message,
  });

  state.targets = [];
  state.selectedIndex = 0;
  resetFixedObject();

  if (ui.status) ui.status.textContent = '設定読み込み失敗';
  if (ui.target) ui.target.textContent = '--';

  if (controls.targetSelect) {
    controls.targetSelect.innerHTML = '';
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '地点設定なし';
    controls.targetSelect.appendChild(option);
    controls.targetSelect.disabled = true;
  }
}

async function loadAndApplyConfig() {
  await loadSuimonConfig();
  if (state.suimonModels.length) {
    buildTargetsFromSuimon();
  } else {
    await loadTargetsConfig();
  }

  applySelectedTargetConfigDefaults();
  setupTargetOptions();
  updateTargetInfo();
  state.configLoaded = true;

  if (ui.status && !state.gpsReady) {
    ui.status.textContent = 'GPS待機中...';
  }

  if (state.displayMode === 'gps' && state.gpsReady && !state.hasFixedSpawned) {
    await spawnFixedTarget();
  }
}

async function initSceneAndUi() {
  setupReRequestButton();
  setupHeadingTracker();
  setupHeightControl();
  setupSizeControl();
  setupRotationControl();
  setupOffsetEastControl();
  setupOffsetNorthControl();
  setupModelControl();
  setupCopyConfigButton();
  setupDisplayModeControl();
  setupUiMinimizer('location-ar');

  state.xrSupported = await checkWebXRSupport();
  updateModeUi();

  await switchToGpsMode();

  try {
    await loadAndApplyConfig();
  } catch (error) {
    handleConfigLoadError(error);
  }
}

function main() {
  const overlay = document.getElementById('ios-permission-overlay');
  const grantBtn = document.getElementById('ios-grant-button');

  if (needsIOSPermission() && overlay && grantBtn) {
    overlay.style.display = '';
    grantBtn.addEventListener(
      'click',
      async () => {
        const ok = await requestMotionPermission();
        overlay.style.display = 'none';
        if (ok) {
          console.log('[perm] iOS motion permission granted');
        } else {
          console.warn('[perm] iOS motion permission denied');
        }

        await initSceneAndUi();
        gpsController?.reconnectOrientation();
      },
      { once: true }
    );
  } else {
    void initSceneAndUi();
  }
}

main();
