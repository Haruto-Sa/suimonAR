import type { GeoPoint, ModelConfig } from './types';

export interface GPSFix extends GeoPoint {
  accuracy?: number;
}

export interface InitialGPSFixResult {
  fix: GPSFix;
  precise: boolean;
}

const DEFAULT_REQUIRED_ACCURACY_METERS = 25;
const DEFAULT_TIMEOUT_MS = 12000;

function toGPSFix(position: GeolocationPosition): GPSFix {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    altitude: position.coords.altitude ?? 0,
    accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : undefined,
  };
}

export function getRequiredGPSAccuracy(models: ModelConfig[]): number {
  const values = models
    .map((model) => model.gpsAccuracyMeters)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);

  return values.length > 0 ? Math.min(...values) : DEFAULT_REQUIRED_ACCURACY_METERS;
}

export async function getInitialGPSFix(
  requiredAccuracyMeters: number,
  setStatus: (message: string) => void,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<InitialGPSFixResult> {
  if (!navigator.geolocation) {
    throw new Error('Geolocation が利用できません');
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let latestFix: GPSFix | null = null;

    const finalize = (result: InitialGPSFixResult): void => {
      if (settled) return;
      settled = true;
      navigator.geolocation.clearWatch(watchId);
      window.clearTimeout(timeoutId);
      resolve(result);
    };

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      navigator.geolocation.clearWatch(watchId);
      window.clearTimeout(timeoutId);
      reject(error);
    };

    setStatus(`GPS 初期位置を取得しています... 精度 ${requiredAccuracyMeters}m 以内を待機中`);

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        latestFix = toGPSFix(position);
        const accuracyText =
          typeof latestFix.accuracy === 'number' ? `${Math.round(latestFix.accuracy)}m` : '不明';

        setStatus(`GPS 受信中... 現在精度 ${accuracyText}`);

        if (typeof latestFix.accuracy === 'number' && latestFix.accuracy <= requiredAccuracyMeters) {
          finalize({ fix: latestFix, precise: true });
        }
      },
      (error) => {
        fail(new Error(`GPS 初期位置の取得に失敗しました: ${error.message}`));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    );

    const timeoutId = window.setTimeout(() => {
      if (latestFix) {
        finalize({ fix: latestFix, precise: false });
        return;
      }

      fail(new Error('GPS 初期位置を取得できませんでした'));
    }, timeoutMs);
  });
}

export function startGPSWatch(
  onUpdate: (fix: GPSFix) => void,
  onError: (message: string) => void,
): number {
  return navigator.geolocation.watchPosition(
    (position) => {
      onUpdate(toGPSFix(position));
    },
    (error) => {
      onError(`GPS error: ${error.message}`);
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
  );
}
