import { loadLocationConfig } from './config';
import { getInitialGPSFix, getRequiredGPSAccuracy } from './gps';
import { startOrientationFallback, type OrientationFallbackController } from './orientation-fallback';
import { setupThreeJS } from './scene';
import { startWebXRSession, type WebXRSessionController } from './webxr-session';
import type { LocationConfig, ModelConfig } from './types';

type ConfigKey = 'old-place' | 'miyako-suimon' | 'takizawa';

type ConfigOption = {
  key: ConfigKey;
  label: string;
  url: string;
  description: string;
};

type RuntimeController = WebXRSessionController | OrientationFallbackController;

type InitLocationPageOptions = {
  enableAudio?: boolean;
};

const DEFAULT_CONFIG_KEY: ConfigKey = 'miyako-suimon';

const CONFIG_OPTIONS: ConfigOption[] = [
  {
    key: 'miyako-suimon',
    label: '宮古水門',
    url: 'config/miyakoSuimon.yaml',
    description: 'YAML に定義した宮古水門の固定座標へ小型モデルを配置します。',
  },
  {
    key: 'old-place',
    label: '旧配置地点',
    url: 'config/old-place.yaml',
    description: 'YAML に定義した旧配置地点の固定座標へ閉伊川水門モデルを配置します。',
  },
  {
    key: 'takizawa',
    label: '滝沢',
    url: 'config/Takizawa.yaml',
    description: 'YAML に定義した滝沢の固定座標へモデルを配置します。',
  },
];

const CONFIG_OPTION_MAP = new Map<ConfigKey, ConfigOption>(
  CONFIG_OPTIONS.map((option) => [option.key, option]),
);

// ---------------------------------------------------------------------------
// AudioController
// ---------------------------------------------------------------------------

class AudioController {
  private audio: HTMLAudioElement | null = null;
  private primed = false;
  private seekRafId = 0;

  private readonly handleClick = () => {
    void this.toggle();
  };
  private readonly handleSeek = () => {
    const audio = this.audio;
    const bar = this.seekBar;
    if (!audio || !bar) return;
    const pct = Number(bar.value) / 100;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = pct * audio.duration;
    }
  };

  constructor(
    private readonly path: string,
    private readonly button: HTMLButtonElement | null,
    private readonly seekBar: HTMLInputElement | null,
    private readonly currentTimeEl: HTMLElement | null,
    private readonly durationEl: HTMLElement | null,
    private readonly setStatus: (message: string) => void,
  ) {
    if (this.button) {
      this.button.disabled = false;
      this.button.textContent = '▶';
      this.button.addEventListener('click', this.handleClick);
    }
    if (this.seekBar) {
      this.seekBar.disabled = false;
      this.seekBar.value = '0';
      this.seekBar.addEventListener('input', this.handleSeek);
    }
    this.setTimeDisplay(0, 0);
  }

  private ensureAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio(this.path);
      this.audio.preload = 'auto';
      this.audio.loop = false;
      this.audio.volume = 1;
      this.audio.addEventListener('loadedmetadata', () => {
        if (this.audio && Number.isFinite(this.audio.duration)) {
          this.setTimeDisplay(0, this.audio.duration);
        }
      });
      this.audio.addEventListener('ended', () => {
        this.updateButton(false);
        this.stopSeekUpdate();
        if (this.audio) this.setTimeDisplay(0, this.audio.duration);
        if (this.seekBar) this.seekBar.value = '0';
      });
    }
    return this.audio;
  }

  private formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  private setTimeDisplay(current: number, total: number): void {
    if (this.currentTimeEl) this.currentTimeEl.textContent = this.formatTime(current);
    if (this.durationEl) this.durationEl.textContent = this.formatTime(total);
  }

  private startSeekUpdate(): void {
    this.stopSeekUpdate();
    const tick = () => {
      const audio = this.audio;
      if (!audio || audio.paused) return;
      const current = audio.currentTime;
      const total = audio.duration;
      if (this.seekBar && !this.seekBar.matches(':active') && Number.isFinite(total) && total > 0) {
        this.seekBar.value = String((current / total) * 100);
      }
      this.setTimeDisplay(current, total);
      this.seekRafId = requestAnimationFrame(tick);
    };
    this.seekRafId = requestAnimationFrame(tick);
  }

  private stopSeekUpdate(): void {
    if (this.seekRafId) {
      cancelAnimationFrame(this.seekRafId);
      this.seekRafId = 0;
    }
  }

  private updateButton(isPlaying: boolean): void {
    if (!this.button) return;
    this.button.textContent = isPlaying ? '⏸' : '▶';
  }

  async play(): Promise<void> {
    const audio = this.ensureAudio();
    audio.currentTime = 0;
    await audio.play();
    this.updateButton(true);
    this.startSeekUpdate();
  }

  async prime(): Promise<void> {
    if (this.primed) return;
    const audio = this.ensureAudio();
    const previousMuted = audio.muted;
    audio.muted = true;
    try {
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      this.primed = true;
    } finally {
      audio.muted = previousMuted;
      this.updateButton(false);
    }
  }

  pause(): void {
    if (!this.audio) return;
    this.audio.pause();
    this.stopSeekUpdate();
    this.updateButton(false);
  }

  destroy(): void {
    this.pause();
    this.stopSeekUpdate();
    if (this.audio) {
      this.audio.src = '';
      this.audio.load();
      this.audio = null;
    }
    if (this.button) {
      this.button.removeEventListener('click', this.handleClick);
      this.button.disabled = true;
      this.button.textContent = '▶';
    }
    if (this.seekBar) {
      this.seekBar.removeEventListener('input', this.handleSeek);
      this.seekBar.disabled = true;
      this.seekBar.value = '0';
    }
    this.setTimeDisplay(0, 0);
  }

  async toggle(): Promise<void> {
    const audio = this.ensureAudio();
    if (!audio.paused) {
      this.pause();
      return;
    }
    try {
      await audio.play();
      this.updateButton(true);
      this.startSeekUpdate();
    } catch (error) {
      this.setStatus(
        error instanceof Error ? `音声再生に失敗しました: ${error.message}` : '音声再生に失敗しました',
      );
      this.updateButton(false);
      this.stopSeekUpdate();
    }
  }
}

// ---------------------------------------------------------------------------
// MapController (canvas-based, no external dependencies)
// ---------------------------------------------------------------------------

class MapController {
  private watchId: number | null = null;
  private userPos: { lat: number; lng: number } | null = null;
  private modelPositions: Array<{ lat: number; lng: number; name: string }> = [];
  private stopped = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly statusEl: HTMLElement | null,
  ) {}

  startGPSWatch(): void {
    if (!navigator.geolocation || this.watchId !== null) return;
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (this.statusEl) {
          const acc = Number.isFinite(pos.coords.accuracy)
            ? `精度 ${Math.round(pos.coords.accuracy)}m`
            : '';
          this.statusEl.textContent = `GPS 受信中 ${acc}`;
        }
        this.draw();
      },
      () => {
        if (this.statusEl) this.statusEl.textContent = 'GPS 取得失敗';
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  }

  setModels(models: ModelConfig[]): void {
    this.modelPositions = models.map((m) => ({ lat: m.lat, lng: m.lng, name: m.name }));
    this.draw();
  }

  private draw(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#0a0f1e';
    ctx.fillRect(0, 0, W, H);

    const allPoints: Array<{ lat: number; lng: number }> = [...this.modelPositions];
    if (this.userPos) allPoints.push(this.userPos);
    if (allPoints.length === 0) {
      ctx.fillStyle = 'rgba(247,249,252,0.3)';
      ctx.font = '13px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('設定を読み込み中...', W / 2, H / 2);
      return;
    }

    // Compute bounding box with padding
    const lats = allPoints.map((p) => p.lat);
    const lngs = allPoints.map((p) => p.lng);
    const latMin = Math.min(...lats);
    const latMax = Math.max(...lats);
    const lngMin = Math.min(...lngs);
    const lngMax = Math.max(...lngs);
    const padDeg = 0.0004; // ~44m
    const dLat = Math.max(latMax - latMin, padDeg * 2) + padDeg * 2;
    const dLng = Math.max(lngMax - lngMin, padDeg * 2) + padDeg * 2;
    const latOrigin = latMin - padDeg;
    const lngOrigin = lngMin - padDeg;

    const toCanvas = (lat: number, lng: number) => ({
      cx: ((lng - lngOrigin) / dLng) * W,
      cy: H - ((lat - latOrigin) / dLat) * H,
    });

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const x = (i / 4) * W;
      const y = (i / 4) * H;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Model markers (cyan)
    for (const m of this.modelPositions) {
      const { cx, cy } = toCanvas(m.lat, m.lng);
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(125, 211, 252, 0.9)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(247,249,252,0.9)';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.name, cx + 11, cy);
    }

    // User marker (orange)
    if (this.userPos) {
      const { cx, cy } = toCanvas(this.userPos.lat, this.userPos.lng);
      // Outer pulse ring
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
      ctx.lineWidth = 3;
      ctx.stroke();
      // Solid dot
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Label
      ctx.fillStyle = 'rgba(247,249,252,0.9)';
      ctx.font = 'bold 11px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('現在地', cx + 13, cy);
    }

    // Legend
    const lx = 8;
    let ly = H - 28;
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textBaseline = 'middle';

    ctx.beginPath(); ctx.arc(lx + 5, ly, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(125,211,252,0.9)'; ctx.fill();
    ctx.fillStyle = 'rgba(247,249,252,0.6)';
    ctx.textAlign = 'left';
    ctx.fillText('モデル配置点', lx + 13, ly);

    ly += 14;
    ctx.beginPath(); ctx.arc(lx + 5, ly, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#f59e0b'; ctx.fill();
    ctx.fillStyle = 'rgba(247,249,252,0.6)';
    ctx.fillText('現在地', lx + 13, ly);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPrimaryAudioModel(models: ModelConfig[]): ModelConfig | null {
  return models.find((model) => model.audioPath) ?? null;
}

function resolveInitialConfigKey(): ConfigKey {
  const params = new URLSearchParams(window.location.search);
  const key = params.get('config');
  return key === 'old-place' || key === 'miyako-suimon' || key === 'takizawa' ? key : DEFAULT_CONFIG_KEY;
}

function toConfigKey(value: string | null): ConfigKey {
  return value === 'old-place' || value === 'takizawa' ? value : 'miyako-suimon';
}

function syncConfigQuery(key: ConfigKey): void {
  const url = new URL(window.location.href);
  url.searchParams.set('config', key);
  window.history.replaceState({}, '', url);
}

function canNavigateBack(): boolean {
  return window.history.length > 1;
}

function navigateBack(): void {
  if (canNavigateBack()) {
    window.history.back();
    return;
  }
  window.location.href = 'index.html';
}

async function requestOrientationPermissionIfNeeded(
  setStatus: (message: string) => void,
): Promise<void> {
  const requestPermission = (DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<string>;
  }).requestPermission;

  if (typeof requestPermission !== 'function') {
    return;
  }

  setStatus('方位センサーの権限を確認しています...');
  const permission = await requestPermission();
  if (permission !== 'granted') {
    throw new Error('DeviceOrientation permission denied');
  }
}

function needsOrientationPermissionPrompt(): boolean {
  return typeof (DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<string>;
  }).requestPermission === 'function';
}

// ---------------------------------------------------------------------------
// initLocationPage
// ---------------------------------------------------------------------------

export async function initLocationPage(options: InitLocationPageOptions = {}): Promise<void> {
  const { enableAudio = false } = options;

  const app = document.getElementById('app');
  const root = document.getElementById('xr-root');
  const overlay = document.getElementById('startup-overlay');
  const startButton = document.getElementById('start-button') as HTMLButtonElement | null;
  const startupStatus = document.getElementById('startup-status');
  const runtimeStatus = document.getElementById('runtime-status');
  const modeLabel = document.getElementById('mode-label');
  const gpsStatus = document.getElementById('gps-status');
  const modelStatus = document.getElementById('model-status');
  const audioToggle = document.getElementById('audio-toggle') as HTMLButtonElement | null;
  const audioSeek = document.getElementById('audio-seek') as HTMLInputElement | null;
  const audioCurrentTimeEl = document.getElementById('audio-current-time');
  const audioDurationEl = document.getElementById('audio-duration');
  const configSelect = document.getElementById('config-select') as HTMLSelectElement | null;
  const configDescription = document.getElementById('config-description');
  const backButton = document.getElementById('page-back-button') as HTMLButtonElement | null;
  const endButton = document.getElementById('end-ar-button') as HTMLButtonElement | null;
  const toggleHudButton = document.getElementById('toggle-hud-button') as HTMLButtonElement | null;
  const showUiButton = document.getElementById('show-ui-button') as HTMLButtonElement | null;
  const hudContainer = document.querySelector('.hud') as HTMLElement | null;
  const topBar = document.querySelector('.top-bar') as HTMLElement | null;
  const mapCanvas = document.getElementById('map-canvas') as HTMLCanvasElement | null;
  const mapStatusEl = document.getElementById('map-status');
  const tabPanelConfig = document.getElementById('tab-panel-config');
  const tabPanelMap = document.getElementById('tab-panel-map');
  const tabButtons = document.querySelectorAll<HTMLButtonElement>('.panel-tab');

  if (!app || !root || !startButton || !configSelect) return;

  let audioController: AudioController | null = null;
  let mapController: MapController | null = null;
  let loadedConfig: LocationConfig | null = null;
  let loadedConfigKey: ConfigKey = resolveInitialConfigKey();
  let setup: ReturnType<typeof setupThreeJS> | null = null;
  let activeRuntime: { id: number; controller: RuntimeController } | null = null;
  let runtimeCounter = 0;
  let configLoadToken = 0;
  let stopInProgress = false;

  // ---- Status setters ----

  const setStartupStatus = (message: string): void => {
    if (startupStatus) startupStatus.textContent = message;
  };

  const setRuntimeStatus = (message: string): void => {
    if (runtimeStatus) runtimeStatus.textContent = message;
  };

  const setModeLabel = (message: string): void => {
    if (modeLabel) modeLabel.textContent = message;
  };

  const setGPSStatus = (message: string): void => {
    if (gpsStatus) gpsStatus.textContent = message;
  };

  const setModelStatus = (message: string): void => {
    if (modelStatus) modelStatus.textContent = message;
  };

  const setProgressStatus = (message: string): void => {
    setStartupStatus(message);
    setRuntimeStatus(message);
  };

  // ---- HUD hide/show ----

  const setHudVisible = (visible: boolean): void => {
    if (hudContainer) hudContainer.hidden = !visible;
    if (topBar) topBar.hidden = !visible;
    if (showUiButton) showUiButton.hidden = visible;
  };

  toggleHudButton?.addEventListener('click', () => setHudVisible(false));
  showUiButton?.addEventListener('click', () => setHudVisible(true));

  // ---- Overlay / button state ----

  const showOverlay = (visible: boolean): void => {
    if (overlay) {
      overlay.style.display = visible ? 'grid' : 'none';
    }
  };

  const setRuntimeButtonsActive = (active: boolean): void => {
    if (endButton) { endButton.hidden = !active; endButton.disabled = !active; }
    if (toggleHudButton) { toggleHudButton.hidden = !active; toggleHudButton.disabled = !active; }
    if (!active) setHudVisible(true);
  };

  // ---- Scene / audio cleanup ----

  const disposeScene = (): void => {
    if (!setup) return;
    setup.dispose();
    setup = null;
  };

  const setAudioBarDisabled = (label = '音声なし'): void => {
    if (audioToggle) { audioToggle.disabled = true; audioToggle.textContent = label; }
    if (audioSeek) { audioSeek.disabled = true; audioSeek.value = '0'; }
    if (audioCurrentTimeEl) audioCurrentTimeEl.textContent = '0:00';
    if (audioDurationEl) audioDurationEl.textContent = '0:00';
  };

  const destroyAudioController = (): void => {
    if (!audioController) {
      setAudioBarDisabled();
      return;
    }
    audioController.destroy();
    audioController = null;
  };

  const configureAudio = (models: ModelConfig[]): ModelConfig | null => {
    destroyAudioController();

    if (!enableAudio) {
      setAudioBarDisabled();
      return null;
    }

    const primaryAudioModel = getPrimaryAudioModel(models);
    if (primaryAudioModel?.audioPath) {
      audioController = new AudioController(
        primaryAudioModel.audioPath,
        audioToggle,
        audioSeek,
        audioCurrentTimeEl,
        audioDurationEl,
        setRuntimeStatus,
      );
      return primaryAudioModel;
    }

    setAudioBarDisabled();
    return null;
  };

  const resetUIForStandby = (message: string): void => {
    setModeLabel('mode: standby');
    setGPSStatus('GPS: 開始待ち');
    setModelStatus('待機中');
    setRuntimeStatus(message);
    setRuntimeButtonsActive(false);
    configSelect.disabled = false;
    showOverlay(true);
    startButton.disabled = loadedConfig === null;
  };

  const cleanupAfterRuntime = (message: string): void => {
    audioController?.pause();
    disposeScene();
    resetUIForStandby(message);
  };

  const stopRuntime = async (message: string): Promise<void> => {
    if (!activeRuntime || stopInProgress) {
      return;
    }

    stopInProgress = true;
    const runtime = activeRuntime;
    activeRuntime = null;

    try {
      await runtime.controller.stop();
    } catch (error) {
      setRuntimeStatus(error instanceof Error ? error.message : 'AR の終了に失敗しました');
    } finally {
      cleanupAfterRuntime(message);
      stopInProgress = false;
    }
  };

  const goBackFromPage = async (): Promise<void> => {
    if (activeRuntime) {
      await stopRuntime('AR を終了しました');
    } else {
      audioController?.pause();
    }
    navigateBack();
  };

  // ---- Config loading ----

  const loadConfigForKey = async (key: ConfigKey): Promise<void> => {
    const option = CONFIG_OPTION_MAP.get(key);
    if (!option) return;

    const token = ++configLoadToken;
    loadedConfigKey = key;
    configSelect.value = key;
    configSelect.disabled = false;
    startButton.disabled = true;
    setStartupStatus(`${option.label} の設定を読み込み中...`);
    if (configDescription) {
      configDescription.textContent = option.description;
    }

    try {
      const config = await loadLocationConfig(option.url);
      if (token !== configLoadToken) return;
      if (config.models.length === 0) {
        throw new Error('表示対象のモデルが設定されていません');
      }

      loadedConfig = config;
      syncConfigQuery(key);
      const primaryAudioModel = configureAudio(config.models);
      const modelCountText = `${config.models.length} 件のモデル設定を読み込みました`;
      setStartupStatus(`${option.label}: ${modelCountText}`);
      setRuntimeStatus(enableAudio && primaryAudioModel ? '開始後に音声を再生できます' : '開始待ち');
      setGPSStatus('GPS: 開始待ち');
      setModelStatus(`${config.models.length}件の設定を読み込み済み`);
      startButton.disabled = false;

      // Update map with new model positions
      if (mapController) {
        mapController.setModels(config.models);
      }
    } catch (error) {
      if (token !== configLoadToken) return;
      loadedConfig = null;
      destroyAudioController();
      setStartupStatus(error instanceof Error ? error.message : '設定読み込みに失敗しました');
      setRuntimeStatus('開始待ち');
      setGPSStatus('GPS: 開始待ち');
      setModelStatus('設定読み込み失敗');
      startButton.disabled = true;
    }
  };

  // ---- AR runtime start ----

  const startRuntime = async (): Promise<void> => {
    if (!loadedConfig) {
      setStartupStatus('設定ファイルを読み込めていません');
      return;
    }

    const configOption = CONFIG_OPTION_MAP.get(loadedConfigKey);
    if (!configOption) return;

    startButton.disabled = true;
    configSelect.disabled = true;
    setRuntimeButtonsActive(false);
    audioController?.pause();

    // Stop map GPS watch while AR is running
    mapController?.stop();
    mapController = null;

    try {
      if (needsOrientationPermissionPrompt()) {
        await requestOrientationPermissionIfNeeded(setProgressStatus);
      }

      showOverlay(false);
      setRuntimeStatus('AR を起動しています...');
      setModelStatus('モデルを準備しています...');
      setRuntimeButtonsActive(true);

      const primaryAudioModel = getPrimaryAudioModel(loadedConfig.models);
      if (enableAudio && audioController && (primaryAudioModel?.autoPlayAudio ?? true)) {
        await audioController.prime().catch((error) => {
          setRuntimeStatus(
            error instanceof Error ? `音声準備に失敗しました: ${error.message}` : '音声準備に失敗しました',
          );
        });
      }

      disposeScene();
      setProgressStatus('Three.js シーンを準備しています...');
      setup = setupThreeJS(root);
      const { scene, camera, renderer } = setup;
      const requiredAccuracyMeters = getRequiredGPSAccuracy(loadedConfig.models);
      const initialFix = await getInitialGPSFix(requiredAccuracyMeters, setProgressStatus);
      const worldOrigin = loadedConfig.resolvedOrigin;
      const accuracyText =
        typeof initialFix.fix.accuracy === 'number' ? `${Math.round(initialFix.fix.accuracy)}m` : '不明';
      setGPSStatus(
        initialFix.precise
          ? `GPS: ${accuracyText} で開始`
          : `GPS: ${accuracyText} のため低精度で開始`,
      );

      const xrSupported =
        !!navigator.xr &&
        (await navigator.xr.isSessionSupported('immersive-ar'));

      const runtimeId = ++runtimeCounter;

      if (xrSupported) {
        setModeLabel(`mode: WebXR immersive-ar / ${configOption.label}`);
        const controller = await startWebXRSession(renderer, scene, camera, loadedConfig.models, {
          initialFix: initialFix.fix,
          worldOrigin,
          preciseGPS: initialFix.precise,
          setStatus: setRuntimeStatus,
          setGPSStatus,
          setModelStatus,
          overlayRoot: app,
        });
        activeRuntime = { id: runtimeId, controller };
        void controller.onEnd.then(() => {
          if (!activeRuntime || activeRuntime.id !== runtimeId) return;
          activeRuntime = null;
          cleanupAfterRuntime('WebXR セッションが終了しました');
        });
      } else {
        setModeLabel(`mode: DeviceOrientation fallback / ${configOption.label}`);
        const controller = await startOrientationFallback(renderer, scene, camera, loadedConfig.models, {
          initialFix: initialFix.fix,
          worldOrigin,
          preciseGPS: initialFix.precise,
          setStatus: setRuntimeStatus,
          setGPSStatus,
          setModelStatus,
        });
        activeRuntime = { id: runtimeId, controller };
      }

      if (enableAudio && audioController && (primaryAudioModel?.autoPlayAudio ?? true)) {
        void audioController.play().catch((error) => {
          setRuntimeStatus(
            error instanceof Error ? `音声再生に失敗しました: ${error.message}` : '音声再生に失敗しました',
          );
        });
      }
    } catch (error) {
      audioController?.pause();
      disposeScene();
      showOverlay(true);
      setRuntimeButtonsActive(false);
      configSelect.disabled = false;
      startButton.disabled = loadedConfig === null;
      setProgressStatus(error instanceof Error ? error.message : 'Location AR の起動に失敗しました');
      setModeLabel('mode: standby');
    }
  };

  // ---- Map tab initialization ----

  const initMapTab = (): void => {
    if (mapController !== null || !mapCanvas) return;
    mapController = new MapController(mapCanvas, mapStatusEl ?? null);
    mapController.startGPSWatch();
    if (loadedConfig) {
      mapController.setModels(loadedConfig.models);
    }
  };

  const switchTab = (tabName: string): void => {
    tabButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    if (tabPanelConfig) tabPanelConfig.hidden = tabName !== 'config';
    if (tabPanelMap) tabPanelMap.hidden = tabName !== 'map';

    if (tabName === 'map') {
      initMapTab();
    }
  };

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab ?? 'config'));
  });

  // ---- Wire up config select ----

  configSelect.replaceChildren();
  for (const option of CONFIG_OPTIONS) {
    const element = document.createElement('option');
    element.value = option.key;
    element.textContent = option.label;
    configSelect.appendChild(element);
  }

  configSelect.value = loadedConfigKey;
  configSelect.addEventListener('change', () => {
    const nextKey = toConfigKey(configSelect.value);
    void loadConfigForKey(nextKey);
  });

  startButton.addEventListener('click', () => {
    void startRuntime();
  });

  endButton?.addEventListener('click', () => {
    void stopRuntime('AR を終了しました');
  });

  backButton?.addEventListener('click', () => {
    void goBackFromPage();
  });

  resetUIForStandby('開始待ち');
  await loadConfigForKey(loadedConfigKey);
}
