import * as THREE from 'three';
import { GeoConverter } from '../utils/geo-converter';
import type { GPSFix } from './gps';
import { placeModels } from './place-models';
import { buildModelStatusMessage, formatDistanceMeters, getNearestPlacedModelDistance } from './runtime-metrics';
import type { GeoPoint, ModelConfig } from './types';

type XRSessionInitWithDomOverlay = XRSessionInit & {
  domOverlay?: { root: Element };
};

type StartWebXROptions = {
  initialFix: GPSFix;
  worldOrigin: GeoPoint;
  preciseGPS: boolean;
  setStatus: (message: string) => void;
  setGPSStatus: (message: string) => void;
  setModelStatus: (message: string) => void;
  overlayRoot?: Element | null;
};

export interface WebXRSessionController {
  stop: () => Promise<void>;
  onEnd: Promise<void>;
}

export async function startWebXRSession(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  models: ModelConfig[],
  options: StartWebXROptions,
): Promise<WebXRSessionController> {
  if (!navigator.xr) {
    throw new Error('WebXR が利用できません');
  }

  const { initialFix, worldOrigin, preciseGPS, setStatus, setGPSStatus, setModelStatus, overlayRoot } = options;
  const clock = new THREE.Clock();

  setStatus('WebXR セッションを開始しています...');
  const sessionInit: XRSessionInitWithDomOverlay = {
    requiredFeatures: ['local-floor'],
    optionalFeatures: ['hit-test', 'dom-overlay'],
  };

  if (overlayRoot) {
    sessionInit.domOverlay = { root: overlayRoot };
  }

  const session = await navigator.xr.requestSession('immersive-ar', sessionInit);

  renderer.xr.enabled = true;
  await renderer.xr.setSession(session);
  const refSpace = await session.requestReferenceSpace('local-floor');

  const accuracyText =
    typeof initialFix.accuracy === 'number' ? `${Math.round(initialFix.accuracy)}m` : '不明';
  setGPSStatus(
    preciseGPS
      ? `GPS: ${accuracyText} で原点確定`
      : `GPS: ${accuracyText} のため低精度で原点確定`,
  );
  const converter = new GeoConverter(worldOrigin);
  const userOffset = converter.toLocal(initialFix);

  setStatus('YAML 座標の固定アンカーへモデルを配置しています...');
  const { anchorRoot, mixers, clipCount, fallbackCount, placedModels } = await placeModels(scene, converter, models);
  anchorRoot.position.set(-userOffset.x, -userOffset.y, -userOffset.z);
  const updateModelStatus = () => {
    scene.updateMatrixWorld(true);
    const nearestDistance = getNearestPlacedModelDistance(camera, placedModels);
    setGPSStatus(
      [
        preciseGPS ? `GPS: ${accuracyText} で原点確定` : `GPS: ${accuracyText} のため低精度で原点確定`,
        nearestDistance === null ? null : `最寄り ${formatDistanceMeters(nearestDistance)}`,
      ]
        .filter(Boolean)
        .join(' / '),
    );
    setModelStatus(
      buildModelStatusMessage({
        modelCount: placedModels.length,
        clipCount,
        fallbackCount,
        nearestDistanceMeters: nearestDistance,
      }),
    );
  };
  updateModelStatus();

  let ended = false;
  let resolveEnd = () => {};
  const onEnd = new Promise<void>((resolve) => {
    resolveEnd = resolve;
  });

  const handleSessionEnd = () => {
    if (ended) return;
    ended = true;
    renderer.setAnimationLoop(null);
    renderer.xr.enabled = false;
    setStatus('WebXR セッションが終了しました');
    resolveEnd();
  };

  session.addEventListener('end', handleSessionEnd, { once: true });

  renderer.setAnimationLoop((_time, frame) => {
    if (!frame) return;
    const pose = frame.getViewerPose(refSpace);
    if (!pose) return;

    const delta = clock.getDelta();
    mixers.forEach((mixer) => mixer.update(delta));
    updateModelStatus();
    renderer.render(scene, camera);
  });

  setStatus(
    [
      'WebXR immersive-ar モードで表示中',
      clipCount > 0 ? `アニメーション ${clipCount} 本再生中` : null,
      fallbackCount > 0 ? `簡易表示 ${fallbackCount} 件` : null,
    ]
      .filter(Boolean)
      .join(' / '),
  );

  return {
    stop: async () => {
      if (ended) return;
      await session.end();
    },
    onEnd,
  };
}
