# sumionAR（ロケーションAR + マーカーAR + Matterport デモ）

**デモサイト:** [`https://haruto-sa.github.io/sumionAR/`](https://haruto-sa.github.io/sumionAR/)  

位置情報ベース AR（LocAR.js + three.js）、HiroマーカーAR、Matterport 埋め込み表示をまとめたプロジェクトです。

- **ロケーション AR（確認用）**: `location-ar-check.html` で `public/config/locations.yaml` を読み込み、調整値のYAMLコピーが可能  
- **ロケーション AR（デモ用）**: `location-ar-demo.html` で `public/config/locations.yaml` を読み込み、地点選択だけで表示を切り替え  
- **ロケーション AR（本番用）**: `location-ar-prod.html` で `public/config/locations-heiRiver.yaml` を読み込み、最小UIで表示  
- **マーカー AR**: `marker-ar.html` で Hiro マーカーに `suimon-kousin.glb` のみを表示  
- **マーカー印刷ページ**: `marker-print.html` で A4 印刷用の Hiro マーカーを表示  
- **Matterport**: `matterport.html` で指定URLを `iframe` 埋め込み表示  
- **地点マップ**: トップページ下部の OpenStreetMap で `locations.yaml` の地点を一覧表示

---

## 現在のプロジェクト構成

```text
ARjs/
├── index.html               # トップページ（3 モード選択 + OpenStreetMap 地点マップ）
├── location-ar-check.html   # ロケーションAR（確認用）
├── location-ar-demo.html    # ロケーションAR（デモ用）
├── location-ar-prod.html    # ロケーションAR（本番用）
├── location-ar.html         # 旧URL互換（checkへリダイレクト）
├── heiRiver-ar.html         # 旧URL互換（prodへリダイレクト）
├── marker-print.html        # Hiroマーカー印刷ページ
├── matterport.html          # Matterport 埋め込みページ
├── marker-ar.html           # Hiro マーカー AR（Suimon固定）
├── styles.css               # 共通スタイル
├── public/
│   ├── assets/
│   │   └── markers/
│   │       ├── hiro.png
│   │       └── pattern-marker.patt
│   └── config/
│       ├── locations.yaml        # 固定地点の座標・名称・アイコン・高度
│       ├── locations-heiRiver.yaml
│       └── models.yaml           # 使用する 3D モデル定義
├── src/
│   ├── location/
│   │   ├── core.ts          # LocAR.js + three.js の共通 3D シーン制御
│   │   └── uiToggle.ts      # UI 最小化ボタン
│   ├── location-ar/
│   │   └── main.ts          # 固定地点 AR のメインロジック
│   ├── matterport/
│   │   └── main.ts          # （旧実装）Matterport 起動ロジック
│   ├── marker-ar/
│   │   └── main.ts          # Hiro マーカー AR（Suimon固定）
│   └── models/
│       ├── Duck.glb
│       ├── suimon-kousin.glb
│       ├── wankosoba.glb
│       └── index.ts         # 3D モデル URL エントリ
├── package.json
├── tsconfig.json
├── vite.config.mjs          # Vite 設定（全 HTML を input に登録）
└── .gitignore
```

---

## セットアップ

### 前提

- Node.js 18 以上（LTS 系推奨）
- npm（Node 同梱のもので OK）

### 依存パッケージのインストール

```bash
cd /path/to/ARjs
npm install
```

### 開発サーバー起動

```bash
npm run dev
```

`vite.config.mjs` でポート `8000` と `base: '/sumionAR/'` を設定しているため、ブラウザで:

- `http://localhost:8000/` → トップページ（`index.html`）

を開いて確認します。  
カメラ / 位置情報を使うので、**HTTPS または localhost** でアクセスしてください。

### 本番ビルド

```bash
npm run build
```

`dist/` 以下に静的ファイルが生成されます。GitHub Pages などの静的ホスティングにそのまま配置できます。

---

## 機能別の使い方

### 1. ロケーション AR（確認用 `location-ar-check.html` / デモ用 `location-ar-demo.html` / 本番用 `location-ar-prod.html`）

- 確認用: `public/config/locations.yaml` を読み込み、右上の調整UIと「設定コピー」を使って配置値を詰めます
- デモ用: `public/config/locations.yaml` を読み込み、地点選択だけを切り替えて表示します。サイズ / 向き / 東西南北オフセットは YAML の値で固定です
- 本番用: `public/config/locations-heiRiver.yaml` を読み込み、最小UIで表示します（デバッグ調整UIなし）
- 確認用でコピーしたYAML断片は、`locations-heiRiver.yaml` の `locations:` 配下へそのまま貼り付け可能です

**表示モード**

- `GPSモード`: LocAR.js で緯度経度に固定表示。GPS/コンパス誤差の影響を受ける
- `高精度ARモード (WebXR)`: 開始時の現在地と対象地点から ENU 差分を算出し、以後は WebXR のトラッキングで近距離移動（前後/上下）を反映
- WebXR 非対応端末は GPSモードを継続
- 高精度AR開始ボタンは確認用ページのみ表示

**右上パネル（地点 / モデル調整）**

- **確認用はSuimon固定**: モデル切り替えなし
- **地点選択**: `locations.yaml` の地点を切り替え
- **デモ用は地点選択のみ**: 位置補正、回転、サイズ変更は不可
- **表示モード**: 現在モード表示。確認用では「高精度AR開始 (WebXR)」ボタンも表示
- **モデル高さ / サイズ / 向き / 東西・南北オフセット**: 確認用のみスライダー・数値入力で調整可能

**右下パネル（位置情報表示）**

- 現在地 / GPS 精度 / 高度 / 対象地点 / 距離 / 方位

### 2. マーカー AR（`marker-ar.html`）

- トップページ「マーカーベースAR」カードから遷移
- Hiro マーカー検出時に `suimon-kousin.glb` のみを表示します（モデル切り替えなし）
- マーカーパネルは「しまう / 表示」で開閉できます
- ピンチ操作と `+/-` ボタンでモデルの拡大縮小ができます
- `marker-print.html` から A4 向け印刷ができます

### 3. Matterport（`matterport.html`）

- トップページ「Matterport」カードから遷移
- ページ内 `iframe` で Matterport 公開 URL を埋め込み表示
- 左上の「← ホームに戻る」ボタンで元のトップページへ戻る

---

## 設定ファイル

### `public/config/locations.yaml`

固定地点一覧。最小サンプル:

```yaml
locations:
  - id: example
    name: "サンプル地点"
    latitude: 35.681236
    longitude: 139.767125
    altitude: 0          # 省略時は 0m（地面投影）
    baseAltitudeMeters: 0
    realHeightMeters: 8.5
    defaultSize: 1.0     # realHeightMeters 指定時は倍率
    icon: "📍"
    color: "#4e9bff"
```

指定可能なフィールド:

| フィールド | 必須 | 説明 |
|---|---|---|
| `latitude` | はい | 緯度 (WGS84) |
| `longitude` | はい | 経度 (WGS84) |
| `altitude` | いいえ | 高度 (m)。最優先で使用 |
| `baseAltitudeMeters` | いいえ | 高度 (m)。`altitude` 未指定時に使用 |
| `realHeightMeters` | いいえ | モデル実寸の高さ (m)。指定時は実寸基準スケーリング |
| `id` | いいえ | 地点識別子 |
| `name` | いいえ | 表示名 |
| `icon` | いいえ | 絵文字アイコン |
| `color` | いいえ | テーマカラー |
| `defaultSize` | いいえ | モデルサイズ。`realHeightMeters` 指定時は倍率（推奨 1.0） |
| `defaultHeight` | いいえ | モデル高さ (m) |
| `defaultRotationY` | いいえ | Y 軸回転 (度) |
| `model` | いいえ | GLB ファイル名 |

地点を追加すると `location-ar-check.html` の地点選択と `index.html` のマップに自動反映されます。

### `public/config/models.yaml`

使用する 3D モデル（Duck / Suimon / Wankosoba など）の定義用ファイルです。  
GLB ファイル自体は `src/models/` に置き、ビルド時に Vite により解決されます。

---

## 表示整合化での改善

### 以前の課題

1. GPS+方位のみでは、近距離の前後移動/上下移動（しゃがむ等）の追従が弱く、モデルが張り付き気味に見える
2. モデル実寸の基準が曖昧で、地点ごとのサイズ整合が取りにくい

### 修正内容

- `GPSモード`（LocAR）と `高精度ARモード`（WebXR）を切り替え可能にした
- `realHeightMeters` による実寸スケーリングと `baseAltitudeMeters` フォールバックを追加
- GPS更新に移動平均を導入し、ジッタを抑制
- GPS高度が取得できる場合はカメラ高度へ反映し、高度未取得時は UI に明示

---

## ドキュメント

より詳しい説明やトラブルシューティングは `doc/manual/` 以下を参照してください。

- `doc/manual/TROUBLESHOOTING.md` – よくある問題と対処  
- `doc/manual/SERVER_LOG_README.md` – ログ付き HTTP サーバーの説明  
- `doc/manual/setup-ioscheck.md` – iOS / スマホでの動作確認手順  
- `doc/manual/githubUpload.md` – GitHub Pages へのアップロード手順

---

## 技術スタック / ライブラリ

- AR.js / A-Frame（マーカー AR）
- three.js + WebXR
- LocAR.js（位置情報ベース AR）
- Vite + TypeScript

### ライセンス表記（主要ライブラリ）

- three.js — MIT License (c) 2010-2025 Mr.doob and contributors
- A-Frame — MIT License
- AR.js — MIT License
- LocAR.js — MIT License

このリポジトリ自体はデモ / 学習目的で作成されています。  
再利用や商用利用の際は、上記ライブラリおよびその他依存パッケージのライセンスも併せて確認してください。
