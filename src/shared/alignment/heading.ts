/**
 * ★保護コア: シルエット位置合わせのヘディング逆算(全関数が純粋)。
 *
 * 座標規約:
 * - 方位角 β: 北から時計回りの度数 [0, 360)。
 * - locar ワールド座標: 東=+X, 上=+Y, 北=−Z。カメラの初期前方は −Z(=北)。
 * - three.js の +Y 軸回転は上から見て反時計回り正なので、方位角との符号は反転する
 *   (three.js Y回転 θ に対し β = −θ)。
 *
 * なぜヘディングのみの補正で十分か:
 * 1視点からは、コンパス誤差と視線直交方向のGPS誤差は観測上等価であり
 * (どちらもシルエットの横ズレとして現れる)、カメラ位置を中心とした
 * 1回のヨー回転が両方を同時に吸収する。残るのは視線方向の距離誤差
 * (見かけのスケール誤差 ≈ e/d)と高度誤差のみで、Phase 0 ではこれらを計測する。
 */
import * as THREE from 'three';
import { calcBearing, normalizeDeg180, normalizeDeg360 } from '../geo/geodesy';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const DEG2RAD = Math.PI / 180;

/**
 * カメラ姿勢 quaternion から前方の方位角を求める。
 * 前方 (0,0,−1) を回転して XZ 平面へ投影する。真上/真下を向いている場合は不定。
 */
export function bearingFromQuaternion(q: THREE.Quaternion): number {
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return normalizeDeg360(Math.atan2(f.x, -f.z) / DEG2RAD);
}

export type HeadingCorrectionInput = {
  /** 確定タップ時点のカメラ姿勢(ワールド) */
  cameraQuaternion: THREE.Quaternion;
  userLat: number;
  userLon: number;
  targetLat: number;
  targetLon: number;
};

export type HeadingCorrectionResult = {
  /** 以後カメラに適用すべきヨー補正(度)。βtrue − βvirtual を (−180,180] に正規化。 */
  correctionDeg: number;
  /** ユーザー位置 → ターゲットの真の方位角 */
  trueBearingDeg: number;
  /** タップ時にカメラが向いていた仮想方位角 */
  virtualBearingDeg: number;
};

/**
 * 確定タップの瞬間、端末は物理的にターゲット方向(βtrue)を向いている前提で、
 * 仮想世界のカメラ方位とのズレを補正値として返す。
 * コンパスの絶対精度には依存しない(βvirtual が任意の基準でも差分は正しい)。
 */
export function computeHeadingCorrection(input: HeadingCorrectionInput): HeadingCorrectionResult {
  const trueBearingDeg = calcBearing(input.userLat, input.userLon, input.targetLat, input.targetLon);
  const virtualBearingDeg = bearingFromQuaternion(input.cameraQuaternion);
  return {
    correctionDeg: normalizeDeg180(trueBearingDeg - virtualBearingDeg),
    trueBearingDeg,
    virtualBearingDeg,
  };
}

/**
 * 方位角を correctionDeg だけ増やすヨー回転 quaternion を返す。
 * カメラへは `camera.quaternion.premultiply(q)` で適用する
 * (方位角は時計回り正、three.js +Y回転は反時計回り正のため軸角は符号反転)。
 */
export function yawCorrectionQuaternion(correctionDeg: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(Y_AXIS, -correctionDeg * DEG2RAD);
}

/**
 * pivot から見た position の方位角が deltaBearingDeg だけ増えるように
 * position を pivot まわりに水平回転した新しい座標を返す(XR内の再合わせ用)。
 */
export function rotatePointAroundPivotByBearing(
  position: THREE.Vector3,
  pivot: THREE.Vector3,
  deltaBearingDeg: number
): THREE.Vector3 {
  const offset = position.clone().sub(pivot);
  offset.applyQuaternion(yawCorrectionQuaternion(deltaBearingDeg));
  return offset.add(pivot);
}

/** 方位角 → three.js の Y 回転(ラジアン)。rig の向き合わせに使う。 */
export function bearingToThreeYawRad(bearingDeg: number): number {
  return -bearingDeg * DEG2RAD;
}
