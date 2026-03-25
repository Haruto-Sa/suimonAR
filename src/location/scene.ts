import * as THREE from 'three';

export function setupThreeJS(container: HTMLElement): {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  dispose: () => void;
} {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 5000);
  camera.position.set(0, 1.6, 0);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.position = 'fixed';
  renderer.domElement.style.inset = '0';
  renderer.domElement.style.width = '100vw';
  renderer.domElement.style.height = '100vh';
  container.replaceChildren(renderer.domElement);

  const ambient = new THREE.HemisphereLight(0xffffff, 0x223355, 1.4);
  const directional = new THREE.DirectionalLight(0xffffff, 1.1);
  directional.position.set(8, 14, 12);
  scene.add(ambient);
  scene.add(directional);

  const handleResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };

  window.addEventListener('resize', handleResize);

  const dispose = (): void => {
    window.removeEventListener('resize', handleResize);
    renderer.setAnimationLoop(null);
    renderer.dispose();
    container.replaceChildren();
  };

  return { scene, camera, renderer, dispose };
}
