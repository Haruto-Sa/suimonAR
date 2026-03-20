import * as THREE from 'three';
import { GeoConverter } from '../utils/geo-converter';
import { loadGLTF, fitModelScale } from './load-gltf';
import type { GeoPoint, ModelConfig } from './types';

type DeviceOrientationWithWebkit = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
};

async function setupCameraBackground(scene: THREE.Scene): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
    audio: false,
  });

  const video = document.createElement('video');
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();
  scene.background = new THREE.VideoTexture(video);
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

function applyOrientation(camera: THREE.PerspectiveCamera, event: DeviceOrientationWithWebkit): void {
  if (event.alpha === null || event.beta === null || event.gamma === null) {
    return;
  }

  const alpha = THREE.MathUtils.degToRad(event.alpha);
  const beta = THREE.MathUtils.degToRad(event.beta);
  const gamma = THREE.MathUtils.degToRad(event.gamma);
  const euler = new THREE.Euler(beta, alpha, -gamma, 'YXZ');
  camera.quaternion.setFromEuler(euler);

  const screenAngle =
    window.screen.orientation?.angle ??
    (typeof window.orientation === 'number' ? window.orientation : 0);

  const screenQ = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    -THREE.MathUtils.degToRad(screenAngle),
  );
  camera.quaternion.multiply(screenQ);

  const fixQ = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    -Math.PI / 2,
  );
  camera.quaternion.multiply(fixQ);

  if (typeof event.webkitCompassHeading === 'number') {
    camera.rotation.y = THREE.MathUtils.degToRad(360 - event.webkitCompassHeading);
  }
}

export async function startOrientationFallback(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  models: ModelConfig[],
  setStatus: (message: string) => void,
): Promise<void> {
  let converter: GeoConverter | null = null;
  let modelsPlaced = false;

  setStatus('カメラ背景を起動しています...');
  await setupCameraBackground(scene);

  setStatus('GPS を監視しています...');
  navigator.geolocation.watchPosition(
    (position) => {
      const current: GeoPoint = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        altitude: position.coords.altitude ?? 0,
      };

      if (!converter) {
        converter = new GeoConverter(current);
        camera.position.set(0, 1.6, 0);
      }

      if (!modelsPlaced && converter) {
        modelsPlaced = true;
        void placeModels(scene, converter, models).then(() => {
          setStatus('DeviceOrientation フォールバックで表示中');
        });
        return;
      }

      if (converter) {
        const offset = converter.toLocal(current);
        camera.position.set(offset.x, offset.y + 1.6, offset.z);
      }
    },
    (error) => {
      setStatus(`GPS error: ${error.message}`);
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
  );

  window.addEventListener('deviceorientation', (event) => {
    applyOrientation(camera, event as DeviceOrientationWithWebkit);
  });

  const animate = () => {
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };
  animate();
}
