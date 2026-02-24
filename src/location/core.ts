import * as THREE from 'three';
import * as LocAR from 'locar';

export type LatLon = {
  lat: number;
  lon: number;
};

export function metersToLatDelta(meters: number): number {
  return meters / 111000;
}

export function metersToLonDelta(meters: number, latDeg: number): number {
  return meters / (111000 * Math.cos((latDeg * Math.PI) / 180));
}

const DEFAULT_VIDEO_ELEMENT_ID = 'locar-video-feed';
const ORIENTATION_WATCHDOG_MS = 5000;
const TOUCH_SENSITIVITY = 0.004;
const PITCH_LIMIT = Math.PI * 0.45;
const GPS_SMOOTHING_WINDOW = 5;

type PendingPlacement = {
  object: THREE.Object3D;
  lat: number;
  lon: number;
  altitude: number;
};

export type LocationSceneOptions = {
  gpsMinDistance?: number;
  gpsMinAccuracy?: number;
  videoElementId?: string;
  facingMode?: 'environment' | 'user';
};

type OrientationStatus = 'pending' | 'sensor' | 'touch';

export class LocationScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private locationBased: LocAR.LocationBased | null = null;
  private webcam: LocAR.Webcam | null = null;
  private deviceControls: LocAR.DeviceOrientationControls | null = null;
  private videoElement: HTMLVideoElement | null;
  private pendingAdds: PendingPlacement[] = [];
  private animationFrameId = 0;
  private originReady = false;
  private isDisposed = false;
  private readonly handleResize = () => this.onResize();
  private readonly handleBeforeUnload = () => this.dispose();
  private gpsCallbacks: Array<(pos: { latitude: number; longitude: number; accuracy: number; altitude: number | null }) => void> = [];
  private gpsSamples: Array<{ latitude: number; longitude: number; accuracy: number; altitude: number | null }> = [];

  private _orientationStatus: OrientationStatus = 'pending';
  private orientationEventReceived = false;
  private orientationStatusCallbacks: Array<(status: OrientationStatus) => void> = [];
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;

  private touchYaw = 0;
  private touchPitch = 0;
  private touchActive = false;
  private touchStartX = 0;
  private touchStartY = 0;
  private touchPrevX = 0;
  private touchPrevY = 0;

  constructor(options: LocationSceneOptions = {}) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      200000
    );
    this.camera.position.set(0, 1.6, 0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(1, 2, 1);
    this.scene.add(ambient);
    this.scene.add(dir);

    this.videoElement = this.setupVideoElement(options.videoElementId);

    const mountTarget = document.body || document.documentElement;
    if (mountTarget) {
      mountTarget.appendChild(this.renderer.domElement);
    }
    const canvas = this.renderer.domElement;
    canvas.style.position = 'fixed';
    canvas.style.inset = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.zIndex = '0';
    canvas.style.display = 'block';
    canvas.style.backgroundColor = 'transparent';
    canvas.setAttribute('aria-hidden', 'true');

    const facingMode = options.facingMode ?? 'environment';
    const videoSelector = this.videoElement ? `#${this.videoElement.id}` : undefined;
    this.webcam = new LocAR.Webcam({ video: { facingMode } }, videoSelector);
    if (this.webcam.on) {
      this.webcam.on('webcamstarted', () => {
        if (this.videoElement) {
          this.videoElement.style.opacity = '1';
        }
      });
      this.webcam.on('webcamerror', (event: any) => {
        console.warn('[LocationScene] カメラの初期化に失敗しました', event);
        if (this.videoElement) {
          this.videoElement.style.opacity = '0';
        }
      });
    }

    this.locationBased = new LocAR.LocationBased(this.scene, this.camera, {
      gpsMinDistance: options.gpsMinDistance ?? 3,
      gpsMinAccuracy: options.gpsMinAccuracy ?? 60,
    });

    if (this.locationBased.on) {
      this.locationBased.on('gpsupdate', (payload: any) => {
        const gpsEvent =
          payload && typeof payload === 'object' && 'position' in payload
            ? payload
            : null;
        const position = gpsEvent?.position ?? payload;
        if (!this.originReady) {
          this.originReady = true;
          console.log('[LocationScene] GPS origin established');
        }
        this.flushPendingAdds();

        try {
          const coords = position?.coords ?? position;
          if (coords && typeof coords.latitude === 'number') {
            const raw = {
              latitude: coords.latitude as number,
              longitude: coords.longitude as number,
              accuracy: (coords.accuracy as number) ?? 0,
              altitude:
                typeof coords.altitude === 'number' && Number.isFinite(coords.altitude)
                  ? (coords.altitude as number)
                  : null,
            };
            if (raw.altitude !== null) {
              this.locationBased?.setElevation(raw.altitude);
            }
            const data = this.smoothGps(raw);
            for (const cb of this.gpsCallbacks) {
              cb(data);
            }
          }
        } catch (e) {
          console.warn('[LocationScene] GPS callback dispatch error', e);
        }
      });
      this.locationBased.on('gpserror', (error: GeolocationPositionError) => {
        console.warn('[LocationScene] GPS 取得中にエラーが発生しました', error);
      });
    }

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        const startResult = this.locationBased.startGps();
        if (startResult && typeof (startResult as Promise<boolean>).then === 'function') {
          (startResult as Promise<boolean>).catch((error) => {
            console.warn('[LocationScene] GPS の開始に失敗しました', error);
          });
        } else if (startResult === false) {
          console.warn('[LocationScene] GPS を開始できませんでした (戻り値 false)');
        }
      } catch (error) {
        console.warn('[LocationScene] startGps 呼び出しに失敗しました', error);
      }
    } else {
      console.warn('[LocationScene] Geolocation API が利用できません');
    }

    this.deviceControls = new LocAR.DeviceOrientationControls(this.camera, {
      enablePermissionDialog: false,
    });
    this.deviceControls.init();
    this.deviceControls.connect();

    this.setupOrientationWatchdog();
    this.setupTouchControls();

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('beforeunload', this.handleBeforeUnload);

    this.animate();
  }

  // --- Orientation watchdog ---

  private setupOrientationWatchdog(): void {
    const handler = () => {
      if (this.orientationEventReceived) return;
      this.orientationEventReceived = true;
      this.setOrientationStatus('sensor');
      window.removeEventListener('deviceorientation', handler);
      window.removeEventListener('deviceorientationabsolute', handler);
      console.log('[LocationScene] deviceorientation event detected -> sensor mode');
    };

    window.addEventListener('deviceorientation', handler);
    window.addEventListener('deviceorientationabsolute', handler);

    this.watchdogTimer = setTimeout(() => {
      if (!this.orientationEventReceived) {
        this.setOrientationStatus('touch');
        console.log('[LocationScene] No deviceorientation events -> touch fallback mode');
      }
      window.removeEventListener('deviceorientation', handler);
      window.removeEventListener('deviceorientationabsolute', handler);
    }, ORIENTATION_WATCHDOG_MS);
  }

  private setOrientationStatus(status: OrientationStatus): void {
    if (this._orientationStatus === status) return;
    this._orientationStatus = status;
    for (const cb of this.orientationStatusCallbacks) {
      try { cb(status); } catch (e) { console.warn('[LocationScene] orientation status callback error', e); }
    }
  }

  /** Re-run the watchdog after iOS permission is granted */
  restartOrientationDetection(): void {
    this.orientationEventReceived = false;
    this._orientationStatus = 'pending';
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.setupOrientationWatchdog();
  }

  // --- Touch drag fallback ---

  private setupTouchControls(): void {
    const el = this.renderer.domElement;

    el.addEventListener('touchstart', (e: TouchEvent) => {
      if (this._orientationStatus === 'sensor') return;
      if (e.touches.length !== 1) return;
      this.touchActive = true;
      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;
      this.touchPrevX = this.touchStartX;
      this.touchPrevY = this.touchStartY;
    }, { passive: true });

    el.addEventListener('touchmove', (e: TouchEvent) => {
      if (!this.touchActive || this._orientationStatus === 'sensor') return;
      if (e.touches.length !== 1) return;
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      const dx = x - this.touchPrevX;
      const dy = y - this.touchPrevY;
      this.touchYaw -= dx * TOUCH_SENSITIVITY;
      this.touchPitch -= dy * TOUCH_SENSITIVITY;
      this.touchPitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.touchPitch));
      this.touchPrevX = x;
      this.touchPrevY = y;
    }, { passive: true });

    el.addEventListener('touchend', () => {
      this.touchActive = false;
    }, { passive: true });

    el.addEventListener('touchcancel', () => {
      this.touchActive = false;
    }, { passive: true });

    // Mouse fallback for desktop
    let mouseDown = false;
    let mouseX = 0;
    let mouseY = 0;
    el.addEventListener('mousedown', (e: MouseEvent) => {
      if (this._orientationStatus === 'sensor') return;
      mouseDown = true;
      mouseX = e.clientX;
      mouseY = e.clientY;
    });
    el.addEventListener('mousemove', (e: MouseEvent) => {
      if (!mouseDown || this._orientationStatus === 'sensor') return;
      const dx = e.clientX - mouseX;
      const dy = e.clientY - mouseY;
      this.touchYaw -= dx * TOUCH_SENSITIVITY;
      this.touchPitch -= dy * TOUCH_SENSITIVITY;
      this.touchPitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.touchPitch));
      mouseX = e.clientX;
      mouseY = e.clientY;
    });
    el.addEventListener('mouseup', () => { mouseDown = false; });
    el.addEventListener('mouseleave', () => { mouseDown = false; });
  }

  private applyTouchRotation(): void {
    const euler = new THREE.Euler(this.touchPitch, this.touchYaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }

  // --- Video element setup ---

  private setupVideoElement(preferredId?: string): HTMLVideoElement | null {
    if (typeof document === 'undefined') return null;
    const targetId = preferredId || DEFAULT_VIDEO_ELEMENT_ID;
    let element = document.getElementById(targetId) as HTMLVideoElement | null;
    if (!element) {
      element = document.createElement('video');
      element.id = targetId;
      element.muted = true;
      element.defaultMuted = true;
      element.playsInline = true;
      element.autoplay = true;
      element.controls = false;
      element.loop = false;
      element.setAttribute('playsinline', 'true');
      element.setAttribute('webkit-playsinline', 'true');
      element.setAttribute('muted', 'true');
      element.setAttribute('autoplay', 'true');
      element.setAttribute('aria-hidden', 'true');
      element.style.position = 'fixed';
      element.style.inset = '0';
      element.style.width = '100vw';
      element.style.height = '100vh';
      element.style.objectFit = 'cover';
      element.style.zIndex = '-1';
      element.style.pointerEvents = 'none';
      element.style.backgroundColor = '#000';
      element.style.opacity = '0';
      element.style.transition = 'opacity 0.25s ease';
      element.classList.add('locar-video-feed');
      const target = document.body || document.documentElement;
      target?.prepend(element);
    }
    if (element) {
      element.style.zIndex = '-1';
      element.style.pointerEvents = 'none';
      if (!element.style.opacity) {
        element.style.opacity = '0';
      }
    }
    return element;
  }

  // --- Animation loop ---

  private animate = () => {
    this.animationFrameId = window.requestAnimationFrame(this.animate);
    if (this._orientationStatus === 'sensor' && this.deviceControls?.update) {
      this.deviceControls.update();
    } else if (this._orientationStatus === 'touch') {
      this.applyTouchRotation();
    } else if (this._orientationStatus === 'pending' && this.deviceControls?.update) {
      // While pending, try LocAR controls (they're no-op if no sensor data)
      this.deviceControls.update();
    }
    this.renderer.render(this.scene, this.camera);
  };

  // --- Object placement ---

  private tryPlaceObject(placement: PendingPlacement): boolean {
    if (!this.locationBased) return false;
    try {
      this.locationBased.add(placement.object, placement.lon, placement.lat, placement.altitude);
      return true;
    } catch (error) {
      const message = (error as Error)?.message || String(error);
      if (typeof message === 'string' && message.includes('No initial position determined')) {
        return false;
      }
      console.error('[LocationScene] addAtLatLon でエラーが発生しました', error);
      return true;
    }
  }

  private flushPendingAdds(): void {
    if (!this.pendingAdds.length) return;
    this.pendingAdds = this.pendingAdds.filter((placement) => !this.tryPlaceObject(placement));
  }

  addAtLatLon(object: THREE.Object3D, lat: number, lon: number, altitude?: number): void {
    const height =
      typeof altitude === 'number'
        ? altitude
        : typeof object.position?.y === 'number'
        ? object.position.y
        : 0;
    const placement: PendingPlacement = { object, lat, lon, altitude: height };
    if (!this.tryPlaceObject(placement)) {
      this.pendingAdds.push(placement);
    }
  }

  remove(object: THREE.Object3D): void {
    this.pendingAdds = this.pendingAdds.filter((placement) => placement.object !== object);
    if (object.parent === this.scene) {
      this.scene.remove(object);
    }
  }

  // --- Public API ---

  private smoothGps(sample: {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number | null;
  }): {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number | null;
  } {
    this.gpsSamples.push(sample);
    if (this.gpsSamples.length > GPS_SMOOTHING_WINDOW) {
      this.gpsSamples.shift();
    }

    const len = this.gpsSamples.length;
    if (!len) return sample;

    let lat = 0;
    let lon = 0;
    let acc = 0;
    let alt = 0;
    let altCount = 0;
    for (const s of this.gpsSamples) {
      lat += s.latitude;
      lon += s.longitude;
      acc += s.accuracy;
      if (typeof s.altitude === 'number') {
        alt += s.altitude;
        altCount += 1;
      }
    }

    return {
      latitude: lat / len,
      longitude: lon / len,
      accuracy: acc / len,
      altitude: altCount > 0 ? alt / altCount : null,
    };
  }

  fakeGps(lon: number, lat: number, altitude?: number, accuracy?: number): void {
    this.locationBased?.fakeGps(lon, lat, altitude ?? null, accuracy ?? 0);
  }

  onGpsUpdate(callback: (pos: { latitude: number; longitude: number; accuracy: number; altitude: number | null }) => void): void {
    this.gpsCallbacks.push(callback);
  }

  get isOriginReady(): boolean {
    return this.originReady;
  }

  get orientationStatus(): OrientationStatus {
    return this._orientationStatus;
  }

  onOrientationStatus(callback: (status: OrientationStatus) => void): void {
    this.orientationStatusCallbacks.push(callback);
    if (this._orientationStatus !== 'pending') {
      try { callback(this._orientationStatus); } catch (_e) { /* ignore */ }
    }
  }

  reconnectOrientation(): void {
    if (!this.deviceControls) return;
    try {
      this.deviceControls.disconnect();
    } catch (_e) { /* ignore */ }
    this.deviceControls.connect();
    this.restartOrientationDetection();
    console.log('[LocationScene] DeviceOrientationControls reconnected + watchdog restarted');
  }

  // --- Resize / Dispose ---

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    cancelAnimationFrame(this.animationFrameId);
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);

    try {
      this.locationBased?.stopGps();
    } catch (error) {
      console.warn('[LocationScene] stopGps 実行中にエラー', error);
    }

    try {
      this.deviceControls?.disconnect();
      this.deviceControls?.dispose?.();
    } catch (error) {
      console.warn('[LocationScene] DeviceOrientationControls の破棄に失敗しました', error);
    }

    try {
      this.webcam?.dispose();
    } catch (error) {
      console.warn('[LocationScene] Webcam の破棄に失敗しました', error);
    }

    this.pendingAdds = [];
    this.gpsSamples = [];
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
    if (this.videoElement && this.videoElement.parentElement) {
      this.videoElement.parentElement.removeChild(this.videoElement);
    }
    this.videoElement = null;
  }
}
