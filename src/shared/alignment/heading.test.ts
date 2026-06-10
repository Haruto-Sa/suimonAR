import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  bearingFromQuaternion,
  bearingToThreeYawRad,
  computeHeadingCorrection,
  rotatePointAroundPivotByBearing,
  yawCorrectionQuaternion,
} from './heading';
import { calcBearing, normalizeDeg360, offsetLatLon } from '../geo/geodesy';

const Y = new THREE.Vector3(0, 1, 0);

/** 指定方位角を向くカメラ quaternion を作る(three.js Y回転 = −方位角) */
function quaternionFacingBearing(bearingDeg: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(Y, (-bearingDeg * Math.PI) / 180);
}

describe('bearingFromQuaternion', () => {
  it('単位 quaternion(初期カメラ)は北 = 0°', () => {
    expect(bearingFromQuaternion(new THREE.Quaternion())).toBeCloseTo(0, 6);
  });

  it.each([
    [0, 0],
    [90, 90],
    [180, 180],
    [270, 270],
    [45, 45],
  ])('方位 %d° を向く quaternion → %d°', (deg, expected) => {
    expect(bearingFromQuaternion(quaternionFacingBearing(deg))).toBeCloseTo(expected, 5);
  });

  it('ピッチが混ざっても水平方位は変わらない', () => {
    const q = quaternionFacingBearing(120);
    // ローカルX軸まわりに 30° 見上げる
    const pitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 6);
    q.multiply(pitch);
    expect(bearingFromQuaternion(q)).toBeCloseTo(120, 4);
  });
});

describe('computeHeadingCorrection + yawCorrectionQuaternion(符号固定プロパティテスト)', () => {
  // ユーザーが実物(βtrue方向)を物理的に向いてタップした瞬間、
  // 仮想カメラはコンパス誤差 ε のせいで βtrue+ε を向いている。
  // 補正適用後のカメラ方位が βtrue に一致することを端から端まで検証し、
  // 実装の符号ミスを現地ではなく CI で捕まえる。
  const user = { lat: 39.802, lon: 141.135 };

  it.each([
    [10, 100],   // コンパス誤差 +10°、ターゲットは東寄り
    [-10, 100],
    [37, 350],   // 北をまたぐケース
    [-25, 5],
    [0, 200],
    [179, 90],   // 極端な誤差
  ])('コンパス誤差 %d°(βtrue=%d°)→ 補正後方位が βtrue に一致', (compassErrDeg, targetBearingDeg) => {
    // ターゲットを user から βtrue 方向 50m に置く
    const rad = (targetBearingDeg * Math.PI) / 180;
    const target = offsetLatLon(user.lat, user.lon, 50 * Math.sin(rad), 50 * Math.cos(rad));
    const trueBearing = calcBearing(user.lat, user.lon, target.lat, target.lon);

    // タップ時の仮想カメラ: 実際は βtrue を向いているが、誤差で βtrue + ε と認識されている
    const cameraQuat = quaternionFacingBearing(trueBearing + compassErrDeg);

    const result = computeHeadingCorrection({
      cameraQuaternion: cameraQuat,
      userLat: user.lat,
      userLon: user.lon,
      targetLat: target.lat,
      targetLon: target.lon,
    });

    // 補正値はコンパス誤差の符号反転
    expect(result.correctionDeg).toBeCloseTo(compassErrDeg > 180 ? compassErrDeg - 360 : -compassErrDeg, 3);
    expect(result.trueBearingDeg).toBeCloseTo(trueBearing, 5);

    // エンドツーエンド: premultiply 適用後の方位が βtrue に一致
    const corrected = cameraQuat.clone().premultiply(yawCorrectionQuaternion(result.correctionDeg));
    expect(bearingFromQuaternion(corrected)).toBeCloseTo(normalizeDeg360(trueBearing), 3);
  });

  it('補正 0 のとき quaternion は単位元', () => {
    const q = yawCorrectionQuaternion(0);
    expect(q.w).toBeCloseTo(1, 9);
  });

  it('対称性: +c と −c の補正は互いに逆回転', () => {
    const a = yawCorrectionQuaternion(30);
    const b = yawCorrectionQuaternion(-30);
    const combined = a.multiply(b);
    expect(combined.w).toBeCloseTo(1, 9);
  });
});

describe('rotatePointAroundPivotByBearing', () => {
  it('原点 pivot で北 10m の点を +90° → 東 10m', () => {
    const p = rotatePointAroundPivotByBearing(
      new THREE.Vector3(0, 0, -10),
      new THREE.Vector3(0, 0, 0),
      90
    );
    expect(p.x).toBeCloseTo(10, 6);
    expect(p.z).toBeCloseTo(0, 6);
  });

  it('pivot が原点以外でも pivot からの距離を保つ', () => {
    const pivot = new THREE.Vector3(5, 1, 3);
    const pos = new THREE.Vector3(5, 2, -7); // pivot から北 10m, 上 1m
    const rotated = rotatePointAroundPivotByBearing(pos, pivot, 45);
    expect(rotated.distanceTo(pivot)).toBeCloseTo(pos.distanceTo(pivot), 6);
    expect(rotated.y).toBeCloseTo(2, 6); // 水平回転なので高さ不変
    // 方位確認: pivot→rotated の方位角が 45°
    const bearing = normalizeDeg360((Math.atan2(rotated.x - pivot.x, -(rotated.z - pivot.z)) * 180) / Math.PI);
    expect(bearing).toBeCloseTo(45, 5);
  });
});

describe('bearingToThreeYawRad', () => {
  it('方位角 90°(東)→ Y回転 −π/2', () => {
    expect(bearingToThreeYawRad(90)).toBeCloseTo(-Math.PI / 2, 9);
  });
  it('rig に適用するとカメラ方位と一致する', () => {
    const bearing = 137;
    const rigQuat = new THREE.Quaternion().setFromAxisAngle(Y, bearingToThreeYawRad(bearing));
    expect(bearingFromQuaternion(rigQuat)).toBeCloseTo(bearing, 5);
  });
});
