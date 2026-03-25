import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

export interface LoadedGLTF {
  root: THREE.Group;
  animations: THREE.AnimationClip[];
}

export async function loadGLTF(url: string): Promise<LoadedGLTF> {
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene;
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.frustumCulled = false;
    }
  });
  return {
    root,
    animations: gltf.animations,
  };
}

export function fitModelScale(model: THREE.Object3D, realHeightMeters: number, multiplier = 1): void {
  const box = new THREE.Box3().setFromObject(model);
  const height = Math.max(box.max.y - box.min.y, 0.001);
  const scale = (realHeightMeters * multiplier) / height;
  model.scale.setScalar(scale);
}
