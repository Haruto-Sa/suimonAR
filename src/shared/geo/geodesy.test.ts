import { describe, it, expect } from 'vitest';
import {
  calcBearing,
  calcDistanceMeters,
  latLonToEastNorth,
  metersToLatDelta,
  metersToLonDelta,
  normalizeDeg180,
  normalizeDeg360,
  offsetLatLon,
} from './geodesy';

// 閉伊川水門(locations-heiRiver.yaml の本番地点)
const SUIMON = { lat: 39.6395435045501, lon: 141.96414846972124 };

describe('calcDistanceMeters', () => {
  it('同一地点は 0', () => {
    expect(calcDistanceMeters(SUIMON.lat, SUIMON.lon, SUIMON.lat, SUIMON.lon)).toBe(0);
  });

  it('緯度1度はおよそ 111km', () => {
    const d = calcDistanceMeters(39, 141, 40, 141);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it('対称性: A→B と B→A は等しい', () => {
    const a = calcDistanceMeters(39.64, 141.96, 39.65, 141.97);
    const b = calcDistanceMeters(39.65, 141.97, 39.64, 141.96);
    expect(a).toBeCloseTo(b, 9);
  });
});

describe('calcBearing', () => {
  it('真北は 0°', () => {
    expect(calcBearing(39, 141, 40, 141)).toBeCloseTo(0, 6);
  });
  it('真南は 180°', () => {
    expect(calcBearing(40, 141, 39, 141)).toBeCloseTo(180, 6);
  });
  it('真東はほぼ 90°(近距離)', () => {
    expect(calcBearing(39.64, 141.96, 39.64, 141.961)).toBeCloseTo(90, 1);
  });
  it('真西はほぼ 270°(近距離)', () => {
    expect(calcBearing(39.64, 141.961, 39.64, 141.96)).toBeCloseTo(270, 1);
  });
});

describe('metersToLatDelta / metersToLonDelta', () => {
  it('緯度デルタの round-trip', () => {
    const delta = metersToLatDelta(100);
    const d = calcDistanceMeters(39.64, 141.96, 39.64 + delta, 141.96);
    expect(d).toBeCloseTo(100, 0);
  });

  it('経度デルタの round-trip(緯度40度近辺)', () => {
    const delta = metersToLonDelta(100, 39.64);
    const d = calcDistanceMeters(39.64, 141.96, 39.64, 141.96 + delta);
    expect(d).toBeCloseTo(100, 0);
  });
});

describe('offsetLatLon / latLonToEastNorth', () => {
  it('東50m・北30m ずらした点への変位が一致する(round-trip)', () => {
    const moved = offsetLatLon(SUIMON.lat, SUIMON.lon, 50, 30);
    const { east, north } = latLonToEastNorth(SUIMON.lat, SUIMON.lon, moved.lat, moved.lon);
    expect(east).toBeCloseTo(50, 3);
    expect(north).toBeCloseTo(30, 3);
  });

  it('offsetLatLon の距離と方位が一致する', () => {
    const moved = offsetLatLon(SUIMON.lat, SUIMON.lon, 30, 30);
    const d = calcDistanceMeters(SUIMON.lat, SUIMON.lon, moved.lat, moved.lon);
    const b = calcBearing(SUIMON.lat, SUIMON.lon, moved.lat, moved.lon);
    expect(d).toBeCloseTo(Math.hypot(30, 30), 1);
    expect(b).toBeCloseTo(45, 1);
  });
});

describe('normalizeDeg180 / normalizeDeg360', () => {
  it('境界値', () => {
    expect(normalizeDeg180(180)).toBe(180);
    expect(normalizeDeg180(181)).toBe(-179);
    expect(normalizeDeg180(-180)).toBe(180);
    expect(normalizeDeg180(-190)).toBe(170);
    expect(normalizeDeg180(540)).toBe(180);
    expect(normalizeDeg180(0)).toBe(0);
    expect(normalizeDeg360(-10)).toBe(350);
    expect(normalizeDeg360(370)).toBe(10);
    expect(normalizeDeg360(360)).toBe(0);
  });

  it('方位差の計算に使える: 350° と 10° の差は 20°', () => {
    expect(normalizeDeg180(10 - 350)).toBe(20);
    expect(normalizeDeg180(350 - 10)).toBe(-20);
  });
});
