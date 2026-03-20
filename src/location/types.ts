export interface GeoPoint {
  lat: number;
  lng: number;
  altitude?: number;
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
}

export interface LocationConfig {
  origin?: GeoPoint & { description?: string };
  models: ModelConfig[];
}
