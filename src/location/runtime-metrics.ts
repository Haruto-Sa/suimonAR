import * as THREE from 'three';
import type { PlacedModelInfo } from './place-models';

const CAMERA_WORLD_POS = new THREE.Vector3();
const MODEL_WORLD_POS = new THREE.Vector3();

export function formatDistanceMeters(distanceMeters: number | null): string {
  if (distanceMeters === null || !Number.isFinite(distanceMeters)) {
    return '計測中';
  }

  if (distanceMeters >= 1000) {
    return `${(distanceMeters / 1000).toFixed(2)}km`;
  }

  return `${Math.round(distanceMeters)}m`;
}

export function getNearestPlacedModelDistance(
  camera: THREE.Object3D,
  placedModels: PlacedModelInfo[],
): number | null {
  if (placedModels.length === 0) {
    return null;
  }

  camera.getWorldPosition(CAMERA_WORLD_POS);

  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const placedModel of placedModels) {
    placedModel.object.getWorldPosition(MODEL_WORLD_POS);
    const distance = CAMERA_WORLD_POS.distanceTo(MODEL_WORLD_POS);
    if (distance < nearestDistance) {
      nearestDistance = distance;
    }
  }

  return Number.isFinite(nearestDistance) ? nearestDistance : null;
}

export function buildModelStatusMessage(args: {
  modelCount: number;
  clipCount: number;
  fallbackCount: number;
  nearestDistanceMeters: number | null;
}): string {
  const { modelCount, clipCount, fallbackCount, nearestDistanceMeters } = args;

  return [
    `${modelCount}件`,
    `アニメ ${clipCount}本`,
    fallbackCount > 0 ? `簡易 ${fallbackCount}件` : '簡易 0件',
    `最寄り ${formatDistanceMeters(nearestDistanceMeters)}`,
  ].join(' / ');
}
