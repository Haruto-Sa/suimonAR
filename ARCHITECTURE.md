# アーキテクチャ

## ロケーションベース AR の設計

### 画面張り付き問題と解決策

ロケーション AR が不自然に見える主因は、モデルをカメラ空間へぶら下げる実装か、カメラ更新と同時にモデルの座標まで動かしてしまう実装です。`suimonAR` では次の原則でこれを避けています。

- モデルは必ず `scene.add(model)` でワールド空間へ追加する
- カメラ姿勢の更新とモデル配置を分離する
- GPS は初期原点の決定とカメラ位置更新にのみ使う
- モデルの `position` / `rotation` は配置後に毎フレーム書き換えない

### 座標変換

GPS 座標は `src/utils/geo-converter.ts` で Three.js のローカル座標へ変換します。

```ts
z = -dLat * 111320
x = dLng * 111320 * cos(origin.lat)
y = target.altitude - origin.altitude
```

Three.js の座標系は `X=東`, `Y=上`, `Z=南` として扱います。北方向は負の Z です。

### 二層アーキテクチャ

#### 1. WebXR パス

Android Chrome など `navigator.xr.isSessionSupported('immersive-ar')` が使える環境では `src/location/webxr-session.ts` を通ります。

- `immersive-ar` セッションを開始
- `local-floor` reference space を要求
- 現在地 GPS を原点として `GeoConverter` を生成
- YAML から読んだモデルをワールド空間へ一度だけ配置
- 以後のカメラ追跡は XR セッションに委譲

#### 2. DeviceOrientation フォールバック

iOS Safari など WebXR 非対応環境では `src/location/orientation-fallback.ts` を使います。

- `getUserMedia` で背面カメラを取得し背景に表示
- 初回 GPS で原点を確定し、モデルを一度だけ配置
- `watchPosition` ではカメラ位置だけを更新
- `deviceorientation` からカメラの Quaternion を計算して姿勢を反映

この構成により、WebXR が使えない端末でもモデルをカメラの子にせず表示できます。

### モデルスケール

`src/location/load-gltf.ts` では GLB のバウンディングボックス高さを計算し、`realHeightMeters` がある場合は実寸に合わせてスケールします。

```ts
scale = realHeightMeters / bboxHeight
```

`scale` フィールドは追加倍率として乗算します。

### YAML 設定

`public/config/locations.yaml` は次の 2 層です。

- `origin`: ローカル座標変換の基準点
- `models[]`: モデルファイル、座標、向き、スケール、説明

`public/config/models.yaml` は viewer 用のモデル一覧です。ロケーション AR とは分けて管理します。

### エントリポイント

- `src/location/main.ts`: ロケーション AR 起動判定と UI 制御
- `src/location/webxr-session.ts`: WebXR セッション管理
- `src/location/orientation-fallback.ts`: iOS / 非 WebXR 向けフォールバック
- `src/location/config.ts`: YAML 読み込み
- `src/utils/geo-converter.ts`: GPS からローカル座標への変換
