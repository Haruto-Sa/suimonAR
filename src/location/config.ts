import { MODEL_URLS } from '../models';
import type { LocationConfig, ModelConfig } from './types';

declare const jsyaml: { load(text: string): unknown };

const MODEL_URL_MAP: Record<string, string> = {
  'duck.glb': MODEL_URLS.duck,
  'suimon-kousin.glb': MODEL_URLS.suimon,
  'wankosoba.glb': MODEL_URLS.wankosoba,
};

function resolveModelPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const fileName = value.split('/').pop()?.toLowerCase() ?? '';
  return MODEL_URL_MAP[fileName] ?? null;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function loadLocationConfig(): Promise<LocationConfig> {
  const res = await fetch('config/locations.yaml', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`locations.yaml の取得に失敗しました: ${res.status}`);
  }
  const text = await res.text();
  const parsed = jsyaml.load(text) as Record<string, unknown> | null;
  const originValue = parsed?.origin as Record<string, unknown> | undefined;
  const modelsRaw = Array.isArray(parsed?.models) ? parsed?.models : [];

  const models = modelsRaw
    .map((entry): ModelConfig | null => {
      if (!entry || typeof entry !== 'object') return null;
      const raw = entry as Record<string, unknown>;
      const modelPath = resolveModelPath(raw.model ?? raw.glb);
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
      };
    })
    .filter((entry): entry is ModelConfig => entry !== null);

  return {
    origin: originValue
      ? {
          lat: toNumber(originValue.lat ?? originValue.latitude),
          lng: toNumber(originValue.lng ?? originValue.longitude),
          altitude: toNumber(originValue.altitude, 0),
          description: typeof originValue.description === 'string' ? originValue.description : undefined,
        }
      : undefined,
    models,
  };
}
