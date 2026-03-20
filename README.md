# suimonAR

閉伊川水門（岩手県宮古市）の 3D モデルを AR で表示する Web アプリケーションです。

## 機能

- **マーカーベース AR**: Hiro マーカーを認識して水門モデルを表示
- **モデルビューア**: 3D モデルを閲覧し、iOS Quick Look / Android Scene Viewer で起動
- **ロケーションベース AR**: GPS 座標に基づいて実世界にモデルを固定配置

## 技術スタック

- Vite + TypeScript
- Three.js
- WebXR Device API (`immersive-ar`)
- DeviceOrientation API
- `@google/model-viewer`
- YAML 設定ファイル
- A-Frame + AR.js

## セットアップ

```bash
npm install
npm run dev
```

開発サーバーは `http://localhost:8000` で起動します。`localhost` ではカメラや位置情報を使えますが、実機を別端末から確認する場合は HTTPS トンネルや GitHub Pages を使ってください。

本番ビルド:

```bash
npm run build
```

## ページ構成

| パス | 役割 |
|------|------|
| `/` | トップページ |
| `/marker` | マーカーベース AR への導線 |
| `/marker-ar.html` | Hiro マーカー AR 本体 |
| `/viewer` | `model-viewer` ベースの 3D / ネイティブ AR ビューア |
| `/location` | WebXR + DeviceOrientation ベースのロケーション AR |
| `/matterport.html` | 互換維持用 Matterport ページ |

GitHub Pages では `https://haruto-sa.github.io/sumionAR/` に `/sumionAR/` ベースで配備されます。

## 設定

### `public/config/locations.yaml`

ロケーションベース AR の原点とモデル配置を定義します。

```yaml
origin:
  lat: 39.6395435045501
  lng: 141.96414846972124
  altitude: 0

models:
  - id: heigawa_suimon
    name: "閉伊川水門"
    model: "suimon-kousin.glb"
    usdz: ""
    lat: 39.6395435045501
    lng: 141.96414846972124
    altitude: 0
    heading: -2
    scale: 1.0
    realHeightMeters: 8.5
```

主なフィールド:

| フィールド | 説明 |
|------------|------|
| `origin` | GPS 原点。ローカル座標変換の基準点 |
| `model` | `src/models/` の GLB ファイル名 |
| `usdz` | iOS Quick Look 用 USDZ パス。未指定なら GLB ベースでフォールバック |
| `lat`, `lng`, `altitude` | モデルを置く実座標 |
| `heading` | モデルの向き（度） |
| `scale` | 追加倍率 |
| `realHeightMeters` | 実寸高さ。GLB のバウンディングボックスから実スケールへ合わせる |

### `public/config/models.yaml`

`viewer.html` のモデル選択用設定です。`glb` と任意の `usdz` を定義します。

## ブラウザ対応

| 機能 | Android Chrome | iOS Safari |
|------|----------------|------------|
| マーカー AR | ✅ | ✅ |
| モデルビューア | ✅ Scene Viewer | ✅ Quick Look |
| ロケーション AR | ✅ WebXR `immersive-ar` | ✅ DeviceOrientation フォールバック |

## ディレクトリ構成

```text
ARjs/
├── index.html
├── marker.html
├── viewer.html
├── location.html
├── marker-ar.html
├── marker-print.html
├── matterport.html
├── styles.css
├── public/
│   ├── assets/
│   │   └── markers/
│   └── config/
│       ├── locations.yaml
│       ├── locations-heiRiver.yaml
│       └── models.yaml
├── src/
│   ├── location/
│   │   ├── config.ts
│   │   ├── load-gltf.ts
│   │   ├── main.ts
│   │   ├── orientation-fallback.ts
│   │   ├── scene.ts
│   │   ├── types.ts
│   │   └── webxr-session.ts
│   ├── marker-ar/
│   ├── matterport/
│   ├── models/
│   ├── utils/
│   │   └── geo-converter.ts
│   └── viewer/
│       └── main.ts
├── ARCHITECTURE.md
├── CLAUDE.md
├── package.json
├── tsconfig.json
└── vite.config.mjs
```

## 補足

- ロケーション AR では `camera.add(model)` を使わず、すべて `scene.add(model)` で配置します。
- GPS は原点決定とカメラ位置更新にのみ使い、モデル位置を毎フレーム追従させません。
- iOS では DeviceOrientation の権限許可が必要です。
