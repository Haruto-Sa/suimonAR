import '@google/model-viewer';
import { MODEL_URLS } from '../models';

declare const jsyaml: { load(text: string): unknown };

type ViewerModelConfig = {
  id: string;
  name: string;
  glb: string;
  usdz?: string | null;
  defaultRotationY?: number;
  defaultSize?: number;
};

type ModelViewerElement = HTMLElement & {
  activateAR?: () => void;
  dismissPoster?: () => void;
};

const modelViewer = document.getElementById('model-viewer') as ModelViewerElement | null;
const modelSelect = document.getElementById('model-select') as HTMLSelectElement | null;
const rotationSlider = document.getElementById('rotation-slider') as HTMLInputElement | null;
const rotationValue = document.getElementById('rotation-value') as HTMLElement | null;
const scaleSlider = document.getElementById('scale-slider') as HTMLInputElement | null;
const scaleValue = document.getElementById('scale-value') as HTMLElement | null;
const progressFill = document.getElementById('progress-fill') as HTMLElement | null;
const progressLabel = document.getElementById('progress-label') as HTMLElement | null;
const viewerStatus = document.getElementById('viewer-status') as HTMLElement | null;
const infoModel = document.getElementById('info-model') as HTMLElement | null;
const infoGlb = document.getElementById('info-glb') as HTMLElement | null;
const infoUsdz = document.getElementById('info-usdz') as HTMLElement | null;
const toast = document.getElementById('toast') as HTMLElement | null;

let models: ViewerModelConfig[] = [];
let selectedModel: ViewerModelConfig | null = null;
let toastTimer = 0;

const MODEL_URL_MAP: Record<string, string> = {
  'duck.glb': MODEL_URLS.duck,
  'suimon-kousin.glb': MODEL_URLS.suimon,
  'wankosoba.glb': MODEL_URLS.wankosoba,
};

function showToast(message: string): void {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  if (toastTimer) {
    window.clearTimeout(toastTimer);
  }
  toastTimer = window.setTimeout(() => {
    toast.classList.remove('visible');
  }, 2500);
}

function normalizeModelPath(fileName: string): string {
  const leaf = fileName.split('/').pop()?.toLowerCase() ?? 'suimon-kousin.glb';
  return MODEL_URL_MAP[leaf] ?? MODEL_URLS.suimon;
}

function applyPreviewTransform(): void {
  if (!modelViewer || !rotationSlider || !scaleSlider || !rotationValue || !scaleValue) return;
  const rotation = Number(rotationSlider.value);
  const scale = Number(scaleSlider.value);
  modelViewer.setAttribute('orientation', `0deg ${rotation}deg 0deg`);
  modelViewer.setAttribute('scale', `${scale} ${scale} ${scale}`);
  rotationValue.textContent = `${rotation.toFixed(0)}°`;
  scaleValue.textContent = `${scale.toFixed(2)}x`;
}

function updateInfo(model: ViewerModelConfig): void {
  if (infoModel) infoModel.textContent = model.name;
  if (infoGlb) infoGlb.textContent = model.glb;
  if (infoUsdz) infoUsdz.textContent = model.usdz && model.usdz.trim() ? model.usdz : '自動生成フォールバック';
}

function applyModel(model: ViewerModelConfig): void {
  if (!modelViewer || !rotationSlider || !scaleSlider || !viewerStatus) return;
  selectedModel = model;
  modelViewer.setAttribute('src', normalizeModelPath(model.glb));
  if (model.usdz && model.usdz.trim()) {
    modelViewer.setAttribute('ios-src', model.usdz);
  } else {
    modelViewer.removeAttribute('ios-src');
  }
  rotationSlider.value = String(model.defaultRotationY ?? 0);
  scaleSlider.value = String(model.defaultSize ?? 1);
  applyPreviewTransform();
  updateInfo(model);
  viewerStatus.textContent = `${model.name} を読み込み中`;
}

async function loadModels(): Promise<ViewerModelConfig[]> {
  const res = await fetch('config/models.yaml', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`models.yaml の取得に失敗しました: ${res.status}`);
  }
  const text = await res.text();
  const parsed = jsyaml.load(text) as { models?: unknown[] } | unknown[];
  const raw = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { models?: unknown[] }).models)
      ? (parsed as { models?: unknown[] }).models ?? []
      : [];

  return raw
    .map((entry): ViewerModelConfig | null => {
      if (!entry || typeof entry !== 'object') return null;
      const value = entry as Record<string, unknown>;
      const glb = typeof value.glb === 'string' ? value.glb : null;
      if (!glb) return null;
      return {
        id: typeof value.id === 'string' ? value.id : glb,
        name: typeof value.name === 'string' ? value.name : glb,
        glb,
        usdz: typeof value.usdz === 'string' ? value.usdz : null,
        defaultRotationY: Number(value.defaultRotationY ?? 0),
        defaultSize: Number(value.defaultSize ?? 1),
      };
    })
    .filter((entry): entry is ViewerModelConfig => entry !== null);
}

function bindEvents(): void {
  if (!modelViewer || !modelSelect || !rotationSlider || !scaleSlider) return;

  modelSelect.addEventListener('change', () => {
    const next = models.find((model) => model.id === modelSelect.value);
    if (next) {
      applyModel(next);
    }
  });

  rotationSlider.addEventListener('input', () => {
    applyPreviewTransform();
  });

  scaleSlider.addEventListener('input', () => {
    applyPreviewTransform();
  });

  modelViewer.addEventListener('click', () => {
    modelViewer.activateAR?.();
  });

  modelViewer.addEventListener('progress', (event) => {
    const detail = event as unknown as CustomEvent<{ totalProgress?: number }>;
    const progress = detail.detail?.totalProgress ?? 0;
    const text = `${Math.round(progress * 100)}%`;
    if (progressFill) progressFill.style.width = text;
    if (progressLabel) progressLabel.textContent = text;
    if (viewerStatus) {
      viewerStatus.textContent = progress >= 1 ? 'モデル準備完了' : `読み込み中 ${text}`;
    }
  });

  modelViewer.addEventListener('load', () => {
    modelViewer.dismissPoster?.();
    if (viewerStatus) viewerStatus.textContent = 'モデル準備完了';
  });

  modelViewer.addEventListener('ar-status', (event) => {
    const detail = event as CustomEvent<{ status?: string }>;
    switch (detail.detail?.status) {
      case 'session-started':
        showToast('AR を開始しました。平面を探しています');
        break;
      case 'object-placed':
        showToast('配置完了。OS 標準の操作で調整してください');
        break;
      case 'failed':
        showToast('AR の起動に失敗しました');
        break;
      default:
        break;
    }
  });
}

async function init(): Promise<void> {
  if (!modelViewer || !modelSelect) {
    return;
  }

  bindEvents();
  models = await loadModels();
  modelSelect.replaceChildren();

  for (const model of models) {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.name;
    modelSelect.appendChild(option);
  }

  if (models[0]) {
    modelSelect.value = models[0].id;
    applyModel(models[0]);
  }
}

void init().catch((error) => {
  console.error(error);
  if (viewerStatus) {
    viewerStatus.textContent = error instanceof Error ? error.message : 'Viewer 初期化に失敗しました';
  }
  showToast('モデル設定の読み込みに失敗しました');
});
