import * as THREE from 'three';
import { GeoConverter } from '../utils/geo-converter';
import { createFallbackMarker } from './fallback-marker';
import { fitModelScale, loadGLTF } from './load-gltf';
import type { ModelConfig } from './types';

export interface PlacedModelsResult {
  anchorRoot: THREE.Group;
  mixers: THREE.AnimationMixer[];
  clipCount: number;
  fallbackCount: number;
  placedModels: PlacedModelInfo[];
}

export interface PlacedModelInfo {
  config: ModelConfig;
  object: THREE.Object3D;
  clipCount: number;
  isFallback: boolean;
}

export async function placeModels(
  scene: THREE.Scene,
  converter: GeoConverter,
  models: ModelConfig[],
): Promise<PlacedModelsResult> {
  const anchorRoot = new THREE.Group();
  anchorRoot.name = 'location-anchor-root';
  scene.add(anchorRoot);

  const mixers: THREE.AnimationMixer[] = [];
  let clipCount = 0;
  let fallbackCount = 0;
  const placedModels: PlacedModelInfo[] = [];

  for (let i = 0; i < models.length; i++) {
    const config = models[i];
    const localPos = converter.toLocal({
      lat: config.lat,
      lng: config.lng,
      altitude: config.altitude,
    });

    let model: THREE.Object3D;
    let animations: THREE.AnimationClip[] = [];
    let isFallback = false;

    try {
      const loaded = await loadGLTF(config.modelPath);
      model = loaded.root;
      animations = loaded.animations;

      if (config.realHeightMeters) {
        fitModelScale(model, config.realHeightMeters, config.scale ?? 1);
      } else if (config.scale) {
        model.scale.setScalar(config.scale);
      }
    } catch (error) {
      model = createFallbackMarker(config);
      fallbackCount += 1;
      isFallback = true;
      console.warn(`GLB load failed for ${config.id}. Falling back to a fixed marker.`, error);
    }

    model.position.set(localPos.x, localPos.y, localPos.z);
    model.rotation.y = THREE.MathUtils.degToRad(config.heading ?? 0);

    if (animations.length > 0) {
      const mixer = new THREE.AnimationMixer(model);
      animations.forEach((clip) => {
        mixer.clipAction(clip).play();
      });
      mixers.push(mixer);
      clipCount += animations.length;
    }

    anchorRoot.add(model);
    placedModels.push({
      config,
      object: model,
      clipCount: animations.length,
      isFallback,
    });
  }

  return { anchorRoot, mixers, clipCount, fallbackCount, placedModels };
}
