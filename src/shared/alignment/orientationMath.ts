/**
 * deviceorientation センサ値(alpha/beta/gamma)→ カメラ quaternion 変換。
 * three.js 旧 DeviceOrientationControls と同じ数学(W3C 規約の Tait-Bryan 角)。
 * 純粋関数なので単体テスト可能。コンパス(webkitCompassHeading)には一切依存しない。
 */
import * as THREE from 'three';

const DEG2RAD = Math.PI / 180;
const Z_AXIS = new THREE.Vector3(0, 0, 1);
// 端末を立てて持ったとき(beta=90°)にカメラが水平前方を向くための −90° X回転
const SCREEN_TRANSFORM = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

/**
 * @param alphaDeg deviceorientation の alpha(Z軸まわり、反時計回り正)
 * @param betaDeg  beta(X軸まわり)
 * @param gammaDeg gamma(Y軸まわり)
 * @param screenOrientDeg 画面の回転角(screen.orientation.angle)
 */
export function quaternionFromDeviceOrientation(
  alphaDeg: number,
  betaDeg: number,
  gammaDeg: number,
  screenOrientDeg: number,
  out: THREE.Quaternion = new THREE.Quaternion()
): THREE.Quaternion {
  const euler = new THREE.Euler(betaDeg * DEG2RAD, alphaDeg * DEG2RAD, -gammaDeg * DEG2RAD, 'YXZ');
  out.setFromEuler(euler);
  out.multiply(SCREEN_TRANSFORM);
  out.multiply(new THREE.Quaternion().setFromAxisAngle(Z_AXIS, -screenOrientDeg * DEG2RAD));
  return out;
}
