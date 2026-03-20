import type { GeoPoint } from '../location/types';

export class GeoConverter {
  private origin: GeoPoint;

  constructor(origin: GeoPoint) {
    this.origin = origin;
  }

  toLocal(target: GeoPoint): { x: number; y: number; z: number } {
    const dLat = target.lat - this.origin.lat;
    const dLng = target.lng - this.origin.lng;
    const z = -dLat * 111320;
    const x = dLng * 111320 * Math.cos((this.origin.lat * Math.PI) / 180);
    const y = (target.altitude ?? 0) - (this.origin.altitude ?? 0);
    return { x, y, z };
  }

  updateOrigin(newOrigin: GeoPoint): void {
    this.origin = newOrigin;
  }
}
