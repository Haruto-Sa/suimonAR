/**
 * GLB モデルの読み込み・スケール計算・トランスフォーム適用の共通パイプライン。
 * 旧 src/location-ar/main.ts から抽出し、ページ固有の state 依存を引数化した。
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { BoxDimensions } from '../config/locations';

export type ModelTemplate = {
  root: THREE.Object3D;
  bboxMinY: number;
  bboxHeight: number;
  animations: THREE.AnimationClip[];
};

const loader = new GLTFLoader();
const templateCache = new Map<string, ModelTemplate>();

export async function loadModelTemplate(url: string): Promise<ModelTemplate> {
  const cached = templateCache.get(url);
  if (cached) return cached;

  const gltf = await new Promise<any>((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
  const root = gltf.scene || gltf.scenes?.[0];
  if (!root) {
    throw new Error('GLB にシーンが含まれていません');
  }
  const box = new THREE.Box3().setFromObject(root);
  const height = box.max.y - box.min.y;

  const template: ModelTemplate = {
    root,
    bboxMinY: Number.isFinite(box.min.y) ? box.min.y : 0,
    bboxHeight: Number.isFinite(height) && height > 0 ? height : 1,
    animations: Array.isArray(gltf.animations) ? gltf.animations : [],
  };
  templateCache.set(url, template);
  return template;
}

/** 検証用: 実寸ボックスを ModelTemplate と同じ形で生成する(GLB不要)。 */
export function createBoxTemplate(dims: BoxDimensions): ModelTemplate {
  const geometry = new THREE.BoxGeometry(dims.width, dims.height, dims.depth);
  // 底面を y=0 に置く(GLBテンプレートの bboxMinY 補正と整合させるため)
  geometry.translate(0, dims.height / 2, 0);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffb84e,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  const root = new THREE.Group();
  root.add(mesh);
  return {
    root,
    bboxMinY: 0,
    bboxHeight: dims.height,
    animations: [],
  };
}

export type ScaleOptions = {
  /** 実寸高さ(m)。指定時は bboxHeight を実寸に合わせるスケールを返す。 */
  realHeightMeters?: number | null;
  /** レガシー: YAML の scale 倍率 */
  legacyScale?: number | null;
  /** UI のサイズ値(実寸モードでは倍率、レガシーモードではメートル) */
  sizeValue: number;
};

export function computeModelScale(template: ModelTemplate, opts: ScaleOptions): number {
  if (typeof opts.realHeightMeters === 'number' && opts.realHeightMeters > 0) {
    const multiplier = Number.isFinite(opts.sizeValue) ? opts.sizeValue : 1;
    return (opts.realHeightMeters * multiplier) / template.bboxHeight;
  }

  const legacyMultiplier = typeof opts.legacyScale === 'number' ? opts.legacyScale : 1;
  const scaleMeters = opts.sizeValue * legacyMultiplier;
  return scaleMeters / 10;
}

export type TransformOptions = {
  scale: number;
  rotationDeg: number;
  yawOffsetDeg?: number;
  /** モデル底面の追加高さ(m)。0 なら地面に接地。 */
  heightOffset: number;
};

export function applyModelTransform(
  obj: THREE.Object3D,
  template: ModelTemplate,
  opts: TransformOptions
): void {
  const yawOffsetDeg = opts.yawOffsetDeg ?? 0;

  obj.scale.setScalar(opts.scale);
  obj.rotation.y = ((opts.rotationDeg + yawOffsetDeg) * Math.PI) / 180;

  const bottomY = template.bboxMinY * opts.scale;
  obj.position.set(0, opts.heightOffset - bottomY, 0);
}

export function prepareModelInstance(obj: THREE.Object3D): THREE.Object3D {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = false;
      child.receiveShadow = false;
      child.frustumCulled = false;
    }
  });
  return obj;
}
