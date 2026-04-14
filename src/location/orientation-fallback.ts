import * as THREE from 'three';
import { GeoConverter } from '../utils/geo-converter';
import { startGPSWatch } from './gps';
import { placeModels } from './place-models';
import { buildModelStatusMessage, formatDistanceMeters, getNearestPlacedModelDistance } from './runtime-metrics';
import type { GPSFix } from './gps';
import type { GeoPoint, ModelConfig } from './types';

type DeviceOrientationWithWebkit = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
};

type StartOrientationFallbackOptions = {
  initialFix: GPSFix;
  worldOrigin: GeoPoint;
  preciseGPS: boolean;
  setStatus: (message: string) => void;
  setGPSStatus: (message: string) => void;
  setModelStatus: (message: string) => void;
};

export interface OrientationFallbackController {
  stop: () => Promise<void>;
}

async function setupCameraBackground(
  scene: THREE.Scene,
): Promise<{ stop: () => void }> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
    audio: false,
  });

  const video = document.createElement('video');
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();

  const texture = new THREE.VideoTexture(video);
  scene.background = texture;

  return {
    stop: () => {
      scene.background = null;
      texture.dispose();
      video.pause();
      video.srcObject = null;
      stream.getTracks().forEach((track) => track.stop());
    },
  };
}

const ORIENTATION_EULER = new THREE.Euler();
const ORIENTATION_ZEE = new THREE.Vector3(0, 0, 1);
const ORIENTATION_Q0 = new THREE.Quaternion();
const ORIENTATION_Q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

function applyOrientation(camera: THREE.PerspectiveCamera, event: DeviceOrientationWithWebkit): void {
  if (event.alpha === null || event.beta === null || event.gamma === null) {
    return;
  }

  const alphaSource =
    typeof event.webkitCompassHeading === 'number'
      ? 360 - event.webkitCompassHeading
      : event.alpha;

  const alpha = THREE.MathUtils.degToRad(alphaSource);
  const beta = THREE.MathUtils.degToRad(event.beta);
  const gamma = THREE.MathUtils.degToRad(event.gamma);
  const screenAngle =
    window.screen.orientation?.angle ??
    (typeof window.orientation === 'number' ? window.orientation : 0);

  ORIENTATION_EULER.set(beta, alpha, -gamma, 'YXZ');
  camera.quaternion.setFromEuler(ORIENTATION_EULER);
  camera.quaternion.multiply(ORIENTATION_Q1);
  camera.quaternion.multiply(
    ORIENTATION_Q0.setFromAxisAngle(
      ORIENTATION_ZEE,
      -THREE.MathUtils.degToRad(screenAngle),
    ),
  );
}

export async function startOrientationFallback(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  models: ModelConfig[],
  options: StartOrientationFallbackOptions,
): Promise<OrientationFallbackController> {
  const { initialFix, worldOrigin, preciseGPS, setStatus, setGPSStatus, setModelStatus } = options;
  const converter = new GeoConverter(worldOrigin);
  const clock = new THREE.Clock();

  setStatus('カメラ背景を起動しています...');
  const background = await setupCameraBackground(scene);
  const initialOffset = converter.toLocal(initialFix);
  camera.position.set(initialOffset.x, initialOffset.y + 1.6, initialOffset.z);

  const accuracyText =
    typeof initialFix.accuracy === 'number' ? `${Math.round(initialFix.accuracy)}m` : '不明';
  setGPSStatus(
    preciseGPS
      ? `GPS: ${accuracyText} で原点確定`
      : `GPS: ${accuracyText} のため低精度で原点確定`,
  );

  setStatus('YAML 座標の固定アンカーへモデルを配置しています...');
  const { anchorRoot, mixers, clipCount, fallbackCount, placedModels } = await placeModels(scene, converter, models);
  const updateModelStatus = () => {
    scene.updateMatrixWorld(true);
    setModelStatus(
      buildModelStatusMessage({
        modelCount: placedModels.length,
        clipCount,
        fallbackCount,
        nearestDistanceMeters: getNearestPlacedModelDistance(camera, placedModels),
      }),
    );
  };
  updateModelStatus();
  setStatus('方位センサーを初期化しています...');

  const gpsWatchId = startGPSWatch(
    (current) => {
      const offset = converter.toLocal(current);
      camera.position.set(offset.x, offset.y + 1.6, offset.z);
      const nextAccuracyText =
        typeof current.accuracy === 'number' ? `${Math.round(current.accuracy)}m` : '不明';
      const firstModel = anchorRoot.children[0];
      const distText = firstModel
        ? ` / モデルまで ${Math.round(Math.sqrt(
            Math.pow(camera.position.x - firstModel.position.x, 2) +
            Math.pow(camera.position.z - firstModel.position.z, 2),
          ))}m`
        : '';
      scene.updateMatrixWorld(true);
      const nearestDistance = getNearestPlacedModelDistance(camera, placedModels);
      const distanceText =
        nearestDistance === null ? distText : ` / 最寄り ${formatDistanceMeters(nearestDistance)}`;
      setGPSStatus(`GPS: 追跡中 ${nextAccuracyText}${distanceText}`);
      updateModelStatus();
    },
    (message) => {
      setStatus(message);
    },
  );

  const handleOrientation = (event: DeviceOrientationEvent) => {
    applyOrientation(camera, event as DeviceOrientationWithWebkit);
  };

  window.addEventListener('deviceorientation', handleOrientation);

  let animationFrameId = 0;
  let stopped = false;

  const animate = () => {
    if (stopped) return;
    const delta = clock.getDelta();
    mixers.forEach((mixer) => mixer.update(delta));
    updateModelStatus();
    renderer.render(scene, camera);
    animationFrameId = window.requestAnimationFrame(animate);
  };

  setStatus(
    [
      'DeviceOrientation フォールバックで表示中',
      clipCount > 0 ? `アニメーション ${clipCount} 本再生中` : null,
      fallbackCount > 0 ? `簡易表示 ${fallbackCount} 件` : null,
    ]
      .filter(Boolean)
      .join(' / '),
  );
  animate();

  return {
    stop: async () => {
      if (stopped) return;
      stopped = true;
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
      navigator.geolocation.clearWatch(gpsWatchId);
      window.removeEventListener('deviceorientation', handleOrientation);
      background.stop();
      renderer.setAnimationLoop(null);
      setStatus('DeviceOrientation フォールバックを終了しました');
    },
  };
}
