/**
 * locations.yaml / targets.yaml の型定義と正規化ロジック。
 *
 * パース部(parseLocationsYaml / parseTargetsYaml)は jsyaml を引数で受け取る
 * 純粋関数で、単体テスト可能。fetch を伴うローダは load* 関数に分離している。
 * js-yaml はランタイムでは CDN(グローバル jsyaml)から供給される。
 */

export type ModelKind = 'duck' | 'suimon' | 'wankosoba';

export const MODEL_KIND_TO_FILE: Record<ModelKind, string> = {
  duck: 'Duck.glb',
  suimon: 'suimon-kousin.glb',
  wankosoba: 'wankosoba.glb',
};

/** 手続き生成ボックスモデル(検証用)の寸法。実寸メートル。 */
export type BoxDimensions = {
  width: number;
  depth: number;
  height: number;
};

export type LocationConfig = {
  id: string | null;
  name: string | null;
  lat: number;
  lon: number;
  modelFile: string | null;
  box: BoxDimensions | null;
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

export type TargetModelConfig = {
  type: string | null;
  attributes: Record<string, unknown>;
};

export type Target = {
  id: string | null;
  name: string;
  lat: number;
  lon: number;
  icon: string;
  color: string | null;
  model: TargetModelConfig | null;
};

export type YamlLoader = { load(text: string): unknown };

export function toNumberOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function suimonKey(lat: number, lon: number): string {
  return `${lat.toFixed(8)},${lon.toFixed(8)}`;
}

export function normalizeModelFileName(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split('/');
  return parts[parts.length - 1].toLowerCase();
}

export function fileNameToModelKind(fileName: string | null | undefined): ModelKind | null {
  const normalized = normalizeModelFileName(fileName);
  if (!normalized) return null;
  if (normalized === 'duck.glb') return 'duck';
  if (normalized === 'suimon-kousin.glb') return 'suimon';
  if (normalized === 'wankosoba.glb') return 'wankosoba';
  return null;
}

export function modelKindToFileName(kind: ModelKind | null): string {
  if (kind && MODEL_KIND_TO_FILE[kind]) return MODEL_KIND_TO_FILE[kind];
  return MODEL_KIND_TO_FILE.suimon;
}

function normalizeBox(raw: unknown): BoxDimensions | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const width = toNumberOrNull(r.width);
  const depth = toNumberOrNull(r.depth);
  const height = toNumberOrNull(r.height);
  if (width === null || depth === null || height === null) return null;
  if (width <= 0 || depth <= 0 || height <= 0) return null;
  return { width, depth, height };
}

export function normalizeLocation(raw: any): LocationConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const lat = Number(raw.latitude ?? raw.lat);
  const lon = Number(raw.longitude ?? raw.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    console.warn('[config] 無効な座標が検出されました', raw);
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
    box: normalizeBox(raw.box),
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

export function sanitizeModelConfig(model: any): TargetModelConfig | null {
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

export function normalizeTarget(raw: any): Target | null {
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

export function parseLocationsYaml(text: string, yaml: YamlLoader): LocationConfig[] {
  const parsed = yaml.load(text) as any;
  const rawModels = Array.isArray(parsed?.locations)
    ? parsed.locations
    : Array.isArray(parsed?.models)
    ? parsed.models
    : Array.isArray(parsed)
    ? parsed
    : [];
  return (rawModels as any[]).map(normalizeLocation).filter(Boolean) as LocationConfig[];
}

export function parseTargetsYaml(text: string, yaml: YamlLoader): Target[] {
  const parsed = yaml.load(text) as any;
  const rawTargets = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.targets)
    ? parsed.targets
    : [];
  return (rawTargets as any[]).map(normalizeTarget).filter(Boolean) as Target[];
}

function getGlobalYamlLoader(): YamlLoader {
  const yaml = (globalThis as any).jsyaml;
  if (!yaml || typeof yaml.load !== 'function') {
    throw new Error('js-yaml ローダーが利用できません');
  }
  return yaml as YamlLoader;
}

export async function loadLocationsConfig(url: string): Promise<LocationConfig[]> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const text = await response.text();
  return parseLocationsYaml(text, getGlobalYamlLoader());
}

export async function loadTargetsYaml(url: string): Promise<Target[]> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const text = await response.text();
  return parseTargetsYaml(text, getGlobalYamlLoader());
}
