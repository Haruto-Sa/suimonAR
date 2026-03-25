import { resolveAudioAssetPath, resolveModelAssetPath } from '../models';
import type { AnchorOrigin, LocationConfig, ModelConfig } from './types';

declare const jsyaml: { load(text: string): unknown };

function resolveConfiguredModelPath(raw: Record<string, unknown>): string | null {
  const assetId = typeof raw.assetId === 'string' ? raw.assetId : null;
  const legacyValue =
    typeof raw.model === 'string'
      ? raw.model
      : typeof raw.glb === 'string'
        ? raw.glb
        : null;

  return resolveModelAssetPath(assetId ?? legacyValue);
}

function resolveConfiguredAudioPath(raw: Record<string, unknown>): string | undefined {
  const audioId = typeof raw.audioId === 'string' ? raw.audioId : null;
  const legacyValue =
    typeof raw.audio === 'string'
      ? raw.audio
      : typeof raw.audioPath === 'string'
        ? raw.audioPath
        : null;

  return resolveAudioAssetPath(audioId ?? legacyValue) ?? undefined;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toOptionalPositiveNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function toAnchorOrigin(raw: Record<string, unknown>): AnchorOrigin {
  return {
    lat: toNumber(raw.lat ?? raw.latitude),
    lng: toNumber(raw.lng ?? raw.longitude),
    altitude: toNumber(raw.altitude, 0),
    description: typeof raw.description === 'string' ? raw.description : undefined,
  };
}

export async function loadLocationConfig(configUrl = 'config/locations.yaml'): Promise<LocationConfig> {
  const res = await fetch(configUrl, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`${configUrl} の取得に失敗しました: ${res.status}`);
  }
  const text = await res.text();
  const parsed = jsyaml.load(text) as Record<string, unknown> | null;
  const originValue = parsed?.origin as Record<string, unknown> | undefined;
  const modelsRaw = Array.isArray(parsed?.models) ? parsed?.models : [];

  const models = modelsRaw
    .map((entry): ModelConfig | null => {
      if (!entry || typeof entry !== 'object') return null;
      const raw = entry as Record<string, unknown>;
      const modelPath = resolveConfiguredModelPath(raw);
      if (!modelPath) return null;
      return {
        id: typeof raw.id === 'string' ? raw.id : modelPath,
        name: typeof raw.name === 'string' ? raw.name : 'model',
        modelPath,
        usdz: typeof raw.usdz === 'string' ? raw.usdz : undefined,
        lat: toNumber(raw.lat ?? raw.latitude),
        lng: toNumber(raw.lng ?? raw.longitude),
        altitude: toNumber(raw.altitude, 0),
        heading: toNumber(raw.heading, 0),
        scale: toNumber(raw.scale, 1),
        realHeightMeters: toNumber(raw.realHeightMeters, 0) || undefined,
        description: typeof raw.description === 'string' ? raw.description : undefined,
        audioPath: resolveConfiguredAudioPath(raw),
        autoPlayAudio: typeof raw.autoPlayAudio === 'boolean' ? raw.autoPlayAudio : undefined,
        gpsAccuracyMeters: toOptionalPositiveNumber(raw.gpsAccuracyMeters),
      };
    })
    .filter((entry): entry is ModelConfig => entry !== null);

  const origin = originValue ? toAnchorOrigin(originValue) : undefined;
  const resolvedOrigin =
    origin ??
    (models[0]
      ? {
          lat: models[0].lat,
          lng: models[0].lng,
          altitude: models[0].altitude ?? 0,
          description: models[0].description ?? models[0].name,
        }
      : null);

  if (!resolvedOrigin) {
    throw new Error('固定アンカー原点を解決できません。origin または models[0] の座標を設定してください');
  }

  return {
    origin,
    resolvedOrigin,
    models,
  };
}
