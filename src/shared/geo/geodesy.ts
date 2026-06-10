/**
 * 測地系ユーティリティ(純粋関数のみ)。
 *
 * 規約:
 * - 方位角(bearing)は北から時計回りの度数 [0, 360)。
 * - east/north はメートル単位のローカル平面近似(数百m以内の距離を想定)。
 * - locar のワールド座標系では 東=+X, 北=−Z(Spherical Mercator)。
 */

export const EARTH_RADIUS_METERS = 6378137;

// 1緯度あたりのメートル数。旧実装は 111000 / 110540 / 111320 が混在していたが、
// 差は最大0.7%でGPS誤差より十分小さいため 2πR/360 に統一する。
export const METERS_PER_DEGREE_LAT = (Math.PI * EARTH_RADIUS_METERS) / 180;

const DEG2RAD = Math.PI / 180;

export function metersToLatDelta(meters: number): number {
  return meters / METERS_PER_DEGREE_LAT;
}

export function metersToLonDelta(meters: number, latDeg: number): number {
  return meters / (METERS_PER_DEGREE_LAT * Math.cos(latDeg * DEG2RAD));
}

/** 基準点から東・北方向に meters だけずらした緯度経度を返す。 */
export function offsetLatLon(
  lat: number,
  lon: number,
  eastMeters: number,
  northMeters: number
): { lat: number; lon: number } {
  return {
    lat: lat + metersToLatDelta(northMeters),
    lon: lon + metersToLonDelta(eastMeters, lat),
  };
}

/** from → to の変位をローカル平面の east/north メートルで返す(近距離近似)。 */
export function latLonToEastNorth(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): { east: number; north: number } {
  return {
    east: (toLon - fromLon) * METERS_PER_DEGREE_LAT * Math.cos(fromLat * DEG2RAD),
    north: (toLat - fromLat) * METERS_PER_DEGREE_LAT,
  };
}

/** Haversine 距離(メートル)。 */
export function calcDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLon = (lon2 - lon1) * DEG2RAD;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/** 地点1から地点2への初期方位角(北から時計回り、度)。 */
export function calcBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = lat1 * DEG2RAD;
  const phi2 = lat2 * DEG2RAD;
  const dLam = (lon2 - lon1) * DEG2RAD;
  const y = Math.sin(dLam) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLam);
  return ((Math.atan2(y, x) / DEG2RAD) + 360) % 360;
}

/** 角度を (−180, 180] に正規化する。 */
export function normalizeDeg180(deg: number): number {
  const wrapped = ((deg % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

/** 角度を [0, 360) に正規化する。 */
export function normalizeDeg360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}
