import { loadLocationConfig } from './config';
import { setupThreeJS } from './scene';
import { startOrientationFallback } from './orientation-fallback';
import { startWebXRSession } from './webxr-session';

const root = document.getElementById('xr-root');
const overlay = document.getElementById('startup-overlay');
const startButton = document.getElementById('start-button') as HTMLButtonElement | null;
const startupStatus = document.getElementById('startup-status');
const runtimeStatus = document.getElementById('runtime-status');
const modeLabel = document.getElementById('mode-label');

let cachedConfigPromise = loadLocationConfig();

function setStartupStatus(message: string): void {
  if (startupStatus) startupStatus.textContent = message;
}

function setRuntimeStatus(message: string): void {
  if (runtimeStatus) runtimeStatus.textContent = message;
}

function setModeLabel(message: string): void {
  if (modeLabel) modeLabel.textContent = message;
}

async function init(): Promise<void> {
  if (!root || !startButton) return;

  try {
    const config = await cachedConfigPromise;
    if (config.models.length === 0) {
      throw new Error('表示対象のモデルが設定されていません');
    }

    setStartupStatus(`${config.models.length} 件のモデル設定を読み込みました`);
    startButton.disabled = false;

    startButton.addEventListener('click', async () => {
      startButton.disabled = true;
      setStartupStatus('Three.js シーンを準備しています...');

      try {
        const { scene, camera, renderer } = setupThreeJS(root);
        const xrSupported =
          !!navigator.xr &&
          (await navigator.xr.isSessionSupported('immersive-ar'));

        if (xrSupported) {
          setModeLabel('mode: WebXR immersive-ar');
          overlay?.remove();
          await startWebXRSession(renderer, scene, camera, config.models, setRuntimeStatus);
          return;
        }

        setModeLabel('mode: DeviceOrientation fallback');
        if (typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission === 'function') {
          const permission = await (DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission();
          if (permission !== 'granted') {
            throw new Error('DeviceOrientation permission denied');
          }
        }

        overlay?.remove();
        await startOrientationFallback(renderer, scene, camera, config.models, setRuntimeStatus);
      } catch (error) {
        setStartupStatus(error instanceof Error ? error.message : 'Location AR の起動に失敗しました');
        startButton.disabled = false;
      }
    });
  } catch (error) {
    setStartupStatus(error instanceof Error ? error.message : '設定読み込みに失敗しました');
  }
}

void init();
