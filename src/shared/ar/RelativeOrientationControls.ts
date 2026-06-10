/**
 * コンパス非依存の姿勢追従コントロール(確定後のステージ3用)。
 *
 * `deviceorientation` のみを購読し、`deviceorientationabsolute` や
 * iOS の `webkitCompassHeading` は一切使わない。水門(鋼構造物)近傍では
 * コンパスの磁気誤差が大きいため、確定後はジャイロ相対値+確定時に
 * 求めた定数ヨーオフセットだけで追従する。
 */
import * as THREE from 'three';
import { bearingFromQuaternion, yawCorrectionQuaternion } from '../alignment/heading';
import { quaternionFromDeviceOrientation } from '../alignment/orientationMath';
import { normalizeDeg180 } from '../geo/geodesy';

export type RelativeOrientationOptions = {
  /** slerp 係数 (0–1]。小さいほど滑らか。 */
  smoothingFactor?: number;
};

export class RelativeOrientationControls {
  private alphaDeg: number | null = null;
  private betaDeg = 0;
  private gammaDeg = 0;
  private worldYawOffsetDeg = 0;
  private pendingAlignTarget: THREE.Quaternion | null = null;
  private readonly smoothingFactor: number;
  private readonly rawQuat = new THREE.Quaternion();
  private readonly smoothedQuat = new THREE.Quaternion();
  private hasSmoothed = false;
  private connected = false;

  private readonly handleOrientation = (event: DeviceOrientationEvent) => {
    if (typeof event.alpha !== 'number' || !Number.isFinite(event.alpha)) return;
    this.alphaDeg = event.alpha;
    this.betaDeg = typeof event.beta === 'number' ? event.beta : 0;
    this.gammaDeg = typeof event.gamma === 'number' ? event.gamma : 0;
  };

  constructor(options: RelativeOrientationOptions = {}) {
    this.smoothingFactor = options.smoothingFactor ?? 0.25;
  }

  connect(): void {
    if (this.connected) return;
    window.addEventListener('deviceorientation', this.handleOrientation, { passive: true });
    this.connected = true;
  }

  disconnect(): void {
    if (!this.connected) return;
    window.removeEventListener('deviceorientation', this.handleOrientation);
    this.connected = false;
  }

  /**
   * 切替の瞬間に視界が飛ばないよう、現在のセンサ生値の方位が target の方位に
   * 一致するようヨーオフセットを設定する。センサ値が未到着なら初回 update まで保留。
   */
  alignTo(target: THREE.Quaternion): void {
    this.pendingAlignTarget = target.clone();
    this.hasSmoothed = false;
    this.tryResolvePendingAlign();
  }

  private tryResolvePendingAlign(): void {
    if (!this.pendingAlignTarget || this.alphaDeg === null) return;
    this.computeRawQuat();
    const rawBearing = bearingFromQuaternion(this.rawQuat);
    const targetBearing = bearingFromQuaternion(this.pendingAlignTarget);
    this.worldYawOffsetDeg = normalizeDeg180(targetBearing - rawBearing);
    this.pendingAlignTarget = null;
  }

  private computeRawQuat(): void {
    const screenOrient =
      typeof screen !== 'undefined' && screen.orientation
        ? screen.orientation.angle
        : (window as any).orientation ?? 0;
    quaternionFromDeviceOrientation(
      this.alphaDeg ?? 0,
      this.betaDeg,
      this.gammaDeg,
      Number(screenOrient) || 0,
      this.rawQuat
    );
  }

  /**
   * 現在の姿勢を out に書き込む。センサ値が未到着なら false を返し out は触らない。
   */
  update(out: THREE.Quaternion): boolean {
    if (this.alphaDeg === null) return false;
    this.tryResolvePendingAlign();

    this.computeRawQuat();
    const effective = this.rawQuat.clone().premultiply(yawCorrectionQuaternion(this.worldYawOffsetDeg));

    if (!this.hasSmoothed) {
      this.smoothedQuat.copy(effective);
      this.hasSmoothed = true;
    } else {
      this.smoothedQuat.slerp(effective, this.smoothingFactor);
    }
    out.copy(this.smoothedQuat);
    return true;
  }

  get yawOffsetDeg(): number {
    return this.worldYawOffsetDeg;
  }
}
