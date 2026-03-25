export const MODEL_URLS = {
  duck: new URL('./Duck.glb', import.meta.url).href,
  suimon: new URL('./suimon-kousin.glb', import.meta.url).href,
  wankosoba: new URL('./wankosoba.glb', import.meta.url).href,
} as const;

export type ModelKey = keyof typeof MODEL_URLS;

export const MODEL_ASSET_URLS = {
  duck: MODEL_URLS.duck,
  suimon: MODEL_URLS.suimon,
  wankosoba: MODEL_URLS.wankosoba,
  'suimon-small-audio-glb': new URL('./3D Objects/suimon-small-with-audio-ar.glb', import.meta.url).href,
} as const;

export const AUDIO_ASSET_URLS = {
  'suimon-small-audio-mp3': new URL('./3D Objects/suimon-small-with-audio-ar.mp3', import.meta.url).href,
} as const;

export type ModelAssetId = keyof typeof MODEL_ASSET_URLS;
export type AudioAssetId = keyof typeof AUDIO_ASSET_URLS;

const LEGACY_MODEL_FILE_MAP: Record<string, string> = {
  'duck.glb': MODEL_ASSET_URLS.duck,
  'suimon-kousin.glb': MODEL_ASSET_URLS.suimon,
  'wankosoba.glb': MODEL_ASSET_URLS.wankosoba,
  'suimon-small-with-audio-ar.glb': MODEL_ASSET_URLS['suimon-small-audio-glb'],
};

const LEGACY_AUDIO_FILE_MAP: Record<string, string> = {
  'suimon-small-with-audio-ar.mp3': AUDIO_ASSET_URLS['suimon-small-audio-mp3'],
};

function getLeaf(value: string): string {
  return value.split('/').pop()?.toLowerCase() ?? '';
}

export function resolveModelAssetPath(value?: string | null): string | null {
  if (!value || !value.trim()) return null;
  if (value in MODEL_ASSET_URLS) {
    return MODEL_ASSET_URLS[value as ModelAssetId];
  }

  const leaf = getLeaf(value);
  return LEGACY_MODEL_FILE_MAP[leaf] ?? null;
}

export function resolveAudioAssetPath(value?: string | null): string | null {
  if (!value || !value.trim()) return null;
  if (value in AUDIO_ASSET_URLS) {
    return AUDIO_ASSET_URLS[value as AudioAssetId];
  }

  const leaf = getLeaf(value);
  return LEGACY_AUDIO_FILE_MAP[leaf] ?? null;
}

