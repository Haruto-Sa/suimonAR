import * as THREE from 'three';
import type { ModelConfig } from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function createLabelTexture(config: ModelConfig): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D context を取得できません');
  }

  context.fillStyle = 'rgba(9, 28, 38, 0.78)';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = 'rgba(210, 240, 245, 0.95)';
  context.lineWidth = 8;
  context.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);

  context.fillStyle = '#f2fbfd';
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  context.font = 'bold 42px sans-serif';
  context.fillText(config.name, canvas.width / 2, 96);

  context.font = '28px sans-serif';
  context.fillText('3D model unavailable', canvas.width / 2, 156);

  if (config.description) {
    context.font = '22px sans-serif';
    context.fillText(config.description, canvas.width / 2, 208);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createFallbackMarker(config: ModelConfig): THREE.Group {
  const root = new THREE.Group();
  root.name = `fallback-marker:${config.id}`;

  const markerHeight = clamp(config.realHeightMeters ?? 2.4, 1.6, 4.2);
  const panelHeight = markerHeight * 0.48;
  const panelWidth = panelHeight * 1.9;

  const texture = createLabelTexture(config);
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(panelWidth, panelHeight),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  panel.position.y = markerHeight * 0.72;

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.05, markerHeight * 0.75, 10),
    new THREE.MeshBasicMaterial({ color: 0xe9f5f9 }),
  );
  pole.position.y = markerHeight * 0.375;

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.18, 0.08, 18),
    new THREE.MeshBasicMaterial({ color: 0x18414f }),
  );
  base.position.y = 0.04;

  root.add(panel);
  root.add(pole);
  root.add(base);
  root.userData.locationFallback = true;

  return root;
}
