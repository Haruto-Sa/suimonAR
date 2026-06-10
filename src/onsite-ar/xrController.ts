/**
 * オンサイトAR の WebXR 追従経路(Android Chrome のみ。iOS Safari は immersive-ar 非対応)。
 * location-ar の XrModeController を簡約・適応したもの(Phase 0 では共有化しない)。
 *
 * 重要な前提: 確定タップをユーザージェスチャとして requestSession を呼ぶ。
 * セッション開始時の端末の物理前方 = βtrue(ターゲットへの真の方位角)であり、
 * XR ローカル座標の −Z がその向きに対応するため、コンパスを一切使わずに
 * アンカーを配置できる。
 */
import * as THREE from 'three';
import { latLonToEastNorth, normalizeDeg180 } from '../shared/geo/geodesy';
import { rotatePointAroundPivotByBearing } from '../shared/alignment/heading';
import {
  type ModelTemplate,
  applyModelTransform,
  prepareModelInstance,
} from '../shared/models/modelTemplate';

const DEG2RAD = Math.PI / 180;

export type XrStartParams = {
  template: ModelTemplate;
  scale: number;
  rotationDeg: number;
  placement: { lat: number; lon: number; altitude: number };
  startPosition: { latitude: number; longitude: number; altitude: number | null };
  /** セッション開始時に端末が物理的に向いている方位角(= βtrue) */
  headingDeg: number;
  onEnded: () => void;
};

export class OnsiteXrController {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private session: XRSession | null = null;
  private anchor: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions: THREE.AnimationAction[] = [];
  private readonly clock = new THREE.Clock();
  private manualEnding = false;
  private onEnded: (() => void) | null = null;

  async start(params: XrStartParams): Promise<void> {
    if (!navigator.xr) throw new Error('WebXR が利用できません');
    if (this.session) throw new Error('すでにXRセッションが開始されています');

    this.onEnded = params.onEnded;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;

    renderer.domElement.style.position = 'fixed';
    renderer.domElement.style.inset = '0';
    renderer.domElement.style.width = '100vw';
    renderer.domElement.style.height = '100vh';
    renderer.domElement.style.zIndex = '2';
    renderer.domElement.style.pointerEvents = 'none';

    const ambient = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1.2);
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(1, 2, 1);
    scene.add(ambient);
    scene.add(directional);

    const xrSession = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.body },
    } as any);

    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.session = xrSession;

    document.body.appendChild(renderer.domElement);
    renderer.xr.setReferenceSpaceType('local-floor');
    await renderer.xr.setSession(xrSession);

    this.placeAnchor(params);

    xrSession.addEventListener('end', () => {
      const userEnded = !this.manualEnding;
      this.cleanup();
      if (userEnded) {
        this.onEnded?.();
      }
    });

    this.clock.getDelta();
    renderer.setAnimationLoop(() => {
      if (!this.scene || !this.camera) return;
      const delta = this.clock.getDelta();
      this.mixer?.update(delta);
      renderer.render(this.scene, this.camera);
    });
  }

  private placeAnchor(params: XrStartParams): void {
    if (!this.scene) return;

    const inst = params.template.root.clone(true);
    applyModelTransform(inst, params.template, {
      scale: params.scale,
      rotationDeg: params.rotationDeg,
      // XR ローカル −Z = セッション開始時の物理前方(βtrue)なので、ワールド回転を相殺
      yawOffsetDeg: -params.headingDeg,
      heightOffset: 0,
    });
    prepareModelInstance(inst);

    if (params.template.animations.length) {
      this.mixer = new THREE.AnimationMixer(inst);
      this.actions = params.template.animations.map((clip) => {
        const action = this.mixer!.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        return action;
      });
    }

    const { east, north } = latLonToEastNorth(
      params.startPosition.latitude,
      params.startPosition.longitude,
      params.placement.lat,
      params.placement.lon
    );
    const userAltitude =
      typeof params.startPosition.altitude === 'number' && Number.isFinite(params.startPosition.altitude)
        ? params.startPosition.altitude
        : 0;
    const up = params.placement.altitude - userAltitude;

    const headingRad = params.headingDeg * DEG2RAD;
    const localX = east * Math.cos(headingRad) - north * Math.sin(headingRad);
    const localForward = east * Math.sin(headingRad) + north * Math.cos(headingRad);

    const anchor = new THREE.Group();
    anchor.position.set(localX, up, -localForward);
    anchor.add(inst);

    this.scene.add(anchor);
    this.anchor = anchor;
  }

  /** 開閉アニメーションの再生(open=true で開く、false で逆再生)。 */
  playOpenClose(open: boolean): void {
    for (const action of this.actions) {
      const duration = action.getClip().duration;
      action.enabled = true;
      action.paused = false;
      if (open) {
        action.timeScale = 1;
        if (action.time >= duration) action.time = 0;
      } else {
        action.timeScale = -1;
        if (action.time <= 0) action.time = duration;
      }
      action.play();
    }
  }

  get hasAnimations(): boolean {
    return this.actions.length > 0;
  }

  /**
   * XR内の再合わせ: ユーザーが実物に向け直した状態で呼ぶと、カメラ前方の
   * 方位にアンカーが来るよう、カメラ位置を中心に水平回転する。
   */
  realignToCameraForward(): void {
    if (!this.renderer || !this.anchor) return;
    const xrCamera = this.renderer.xr.getCamera();
    const camPos = new THREE.Vector3().setFromMatrixPosition(xrCamera.matrixWorld);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(xrCamera.quaternion);
    const toAnchor = this.anchor.position.clone().sub(camPos);

    const forwardAngle = Math.atan2(forward.x, -forward.z) / DEG2RAD;
    const anchorAngle = Math.atan2(toAnchor.x, -toAnchor.z) / DEG2RAD;
    const deltaDeg = normalizeDeg180(forwardAngle - anchorAngle);

    this.anchor.position.copy(
      rotatePointAroundPivotByBearing(this.anchor.position, camPos, deltaDeg)
    );
    this.anchor.rotation.y -= deltaDeg * DEG2RAD;
  }

  async stop(): Promise<void> {
    if (!this.session) return;
    this.manualEnding = true;
    try {
      await this.session.end();
    } catch (error) {
      console.warn('[onsite-xr] セッション終了時エラー', error);
      this.cleanup();
    }
  }

  private cleanup(): void {
    this.manualEnding = false;
    if (this.renderer) {
      this.renderer.setAnimationLoop(null);
      this.renderer.dispose();
      if (this.renderer.domElement.parentElement) {
        this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
      }
    }
    this.mixer = null;
    this.actions = [];
    this.anchor = null;
    this.session = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
  }

  get isActive(): boolean {
    return !!this.session;
  }
}
