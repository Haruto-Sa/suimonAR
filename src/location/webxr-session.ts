import * as THREE from 'three';
import { GeoConverter } from '../utils/geo-converter';
import { loadGLTF, fitModelScale } from './load-gltf';
import type { GeoPoint, ModelConfig } from './types';

async function getCurrentGPSPosition(): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          altitude: position.coords.altitude ?? 0,
        }),
      reject,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

async function placeModels(scene: THREE.Scene, converter: GeoConverter, models: ModelConfig[]): Promise<void> {
  for (const config of models) {
    const localPos = converter.toLocal({
      lat: config.lat,
      lng: config.lng,
      altitude: config.altitude,
    });

    const model = await loadGLTF(config.modelPath);
    if (config.realHeightMeters) {
      fitModelScale(model, config.realHeightMeters, config.scale ?? 1);
    } else if (config.scale) {
      model.scale.setScalar(config.scale);
    }
    model.position.set(localPos.x, localPos.y, localPos.z);
    model.rotation.y = THREE.MathUtils.degToRad(config.heading ?? 0);
    scene.add(model);
  }
}

export async function startWebXRSession(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  models: ModelConfig[],
  setStatus: (message: string) => void,
): Promise<void> {
  if (!navigator.xr) {
    throw new Error('WebXR が利用できません');
  }

  setStatus('WebXR セッションを開始しています...');
  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['local-floor'],
    optionalFeatures: ['hit-test'],
  });

  renderer.xr.enabled = true;
  await renderer.xr.setSession(session);
  const refSpace = await session.requestReferenceSpace('local-floor');

  setStatus('GPS で原点を取得しています...');
  const origin = await getCurrentGPSPosition();
  const converter = new GeoConverter(origin);

  setStatus('モデルをワールド空間へ配置しています...');
  await placeModels(scene, converter, models);

  session.addEventListener('end', () => {
    renderer.setAnimationLoop(null);
    setStatus('WebXR セッションが終了しました');
  });

  renderer.setAnimationLoop((_time, frame) => {
    if (!frame) return;
    const pose = frame.getViewerPose(refSpace);
    if (pose) {
      renderer.render(scene, camera);
    }
  });

  setStatus('WebXR immersive-ar モードで表示中');
}
