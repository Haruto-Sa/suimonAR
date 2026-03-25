export interface GeoPoint {
  lat: number;
  lng: number;
  altitude?: number;
  accuracy?: number;
}

export interface ModelConfig extends GeoPoint {
  id: string;
  name: string;
  modelPath: string;
  usdz?: string;
  heading?: number;
  scale?: number;
  realHeightMeters?: number;
  description?: string;
  audioPath?: string;
  autoPlayAudio?: boolean;
  gpsAccuracyMeters?: number;
}

export interface AnchorOrigin extends GeoPoint {
  description?: string;
}

export interface LocationConfig {
  origin?: AnchorOrigin;
  resolvedOrigin: AnchorOrigin;
  models: ModelConfig[];
}
