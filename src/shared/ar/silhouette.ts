/**
 * モデルの輪郭シルエット表示(ステージ2の位置合わせ用)。
 * EdgesGeometry によるアウトライン + 半透明ゴーストフィル。
 * アウトラインは depthTest:false + 高 renderOrder で常に最前面に描く。
 */
import * as THREE from 'three';
import type { ModelTemplate } from '../models/modelTemplate';

export type SilhouetteOptions = {
  color?: number;
  /** EdgesGeometry の角度しきい値(度)。小さいほどエッジが増える。 */
  edgeThresholdDeg?: number;
  edgeOpacity?: number;
  ghostOpacity?: number;
};

export function createSilhouette(template: ModelTemplate, options: SilhouetteOptions = {}): THREE.Object3D {
  const color = options.color ?? 0x4e9bff;
  const edgeThresholdDeg = options.edgeThresholdDeg ?? 30;

  const edgeMaterial = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: options.edgeOpacity ?? 0.9,
    depthTest: false,
  });
  const ghostMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: options.ghostOpacity ?? 0.12,
    depthWrite: false,
  });

  const root = template.root.clone(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child);
  });

  for (const mesh of meshes) {
    mesh.material = ghostMaterial;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry, edgeThresholdDeg),
      edgeMaterial
    );
    edges.renderOrder = 999;
    edges.frustumCulled = false;
    // メッシュの子に付けることでメッシュ自身のローカル変換を継承する
    mesh.add(edges);
  }

  return root;
}
