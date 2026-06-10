import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { quaternionFromDeviceOrientation } from './orientationMath';
import { bearingFromQuaternion } from './heading';

function forwardOf(q: THREE.Quaternion): THREE.Vector3 {
  return new THREE.Vector3(0, 0, -1).applyQuaternion(q);
}

describe('quaternionFromDeviceOrientation', () => {
  it('縦持ち・背面カメラ北向き (α=0, β=90, γ=0) → 前方が北で水平', () => {
    const q = quaternionFromDeviceOrientation(0, 90, 0, 0);
    const f = forwardOf(q);
    expect(bearingFromQuaternion(q)).toBeCloseTo(0, 4);
    expect(f.y).toBeCloseTo(0, 6); // 水平
  });

  it('α=90(端末を反時計回りに90°)→ 前方は西 (270°)', () => {
    const q = quaternionFromDeviceOrientation(90, 90, 0, 0);
    expect(bearingFromQuaternion(q)).toBeCloseTo(270, 4);
  });

  it('α=270 → 前方は東 (90°)', () => {
    const q = quaternionFromDeviceOrientation(270, 90, 0, 0);
    expect(bearingFromQuaternion(q)).toBeCloseTo(90, 4);
  });

  it('端末を水平に寝かせ画面上向き (β=0) → カメラは真下', () => {
    const q = quaternionFromDeviceOrientation(0, 0, 0, 0);
    const f = forwardOf(q);
    expect(f.y).toBeCloseTo(-1, 5);
  });

  it('見上げ (β=120) → 前方が上向き成分を持ち、方位は維持', () => {
    const q = quaternionFromDeviceOrientation(0, 120, 0, 0);
    const f = forwardOf(q);
    expect(f.y).toBeGreaterThan(0.4);
    expect(bearingFromQuaternion(q)).toBeCloseTo(0, 3);
  });

  it('out 引数を再利用できる(アロケーションフリー経路)', () => {
    const out = new THREE.Quaternion();
    const ret = quaternionFromDeviceOrientation(0, 90, 0, 0, out);
    expect(ret).toBe(out);
  });
});
