# ロケーションベース AR の問題分析と解決方針

## 動画から確認できた動作

| 時間 | 画面 | 状態 |
|------|------|------|
| 0:00 | マップタブ | 「現在地」と「閉伊川水門-old」が **離れた位置** に表示。GPS 精度 12m |
| 0:02 | 設定タブ | 「旧配置地点」を選択。YAML 読み込み完了 |
| 0:03 | AR 開始直後 | DeviceOrientation fallback モード。ステータス「YAML座標の固定アンカーへモデルを配置しています...」 |
| 0:04–0:10 | AR 表示中 | **水門モデルがカメラのすぐ目の前に表示**。どの方向を向いてもモデルが画面を占有 |
| 0:10 | AR 終了 | 設定画面に戻る |

## 問題点

### 1. モデルが YAML 座標ではなくユーザー位置付近に表示される

マップ上では「現在地」と「閉伊川水門-old」が明確に離れた位置に表示されているにもかかわらず、AR 表示ではモデルがカメラのすぐ目の前に出現している。

**原因の可能性 A: `placeNearUser: true` が残っている**

`src/location-ar/main.ts` に `placeNearUser: true` が設定されていた場合、`place-models.ts` の以下のロジックにより、モデルは YAML の GPS 座標ではなくカメラの前方 3m に配置される:

```typescript
// nearUserDistanceMeters = 3 の場合
const localPos = {
  x: 0,
  y: 0,
  z: -3,  // カメラの3m前方に固定配置
};
```

→ 前回の修正で `placeNearUser` を削除済みだが、**デプロイされているか要確認**。

**原因の可能性 B: モデルのスケールが過大**

`old-place.yaml` の設定:

```yaml
scale: 10.0
realHeightMeters: 8.5
```

`fitModelScale` の計算: `最終高さ = realHeightMeters × scale = 8.5 × 10 = 85m`

実際の閉伊川水門の高さは約 8.5m だが、`scale: 10.0` により **85m** にスケールされている。ユーザーとモデルの距離が 100–200m 程度の場合、85m の物体はカメラの FOV (65°) のほぼ全体を占める。

→ `scale` の意味が誤解されている可能性。`realHeightMeters` が実寸を指定しているなら `scale: 1.0` が正しい。

### 2. モデル座標 = origin 座標（全設定ファイル共通）

全 3 つの YAML ファイルで、モデルの `lat/lng` と `origin` の `lat/lng` が完全に同一:

| 設定 | origin lat/lng | model lat/lng |
|------|---------------|--------------|
| miyakoSuimon | 39.6395 / 141.9641 | 39.6395 / 141.9641 |
| old-place | 39.2984 / 141.1241 | 39.2984 / 141.1241 |
| Takizawa | 39.8027 / 141.1357 | 39.8027 / 141.1357 |

`GeoConverter.toLocal(model)` は常に `{x:0, y:0, z:0}` を返す。モデルは常に原点に配置され、ユーザーの GPS オフセットとの相対位置で表示距離が決まる。

→ この設計自体は正しいが、テスト時にユーザーがモデル座標の近くにいる場合、モデルが非常に近くに見える。

### 3. DeviceOrientation fallback でのカメラ位置精度

DeviceOrientation fallback モードでは:
- カメラ位置 = `converter.toLocal(userGPS)` ... GPS の更新ごとに再設定
- カメラ回転 = `DeviceOrientationEvent` から直接設定

GPS 精度が 12m の場合、カメラ位置が最大 12m ずれる可能性がある。モデルとの距離が短い（50–100m）場合、この誤差は表示に大きく影響する。

### 4. デバッグ情報が不足

AR 表示中に以下の情報が HUD に表示されない：
- ユーザーとモデルの距離（m）
- モデルの配置座標
- カメラの現在位置（ローカル座標）

問題の切り分けが困難。

---

## 解決策

### A. 最優先: `scale` 値の修正

全 YAML ファイルの `scale` を `1.0` に修正する。`realHeightMeters: 8.5` が実寸を指定しているため、追加のスケール倍率は不要:

```yaml
# before
scale: 10.0
realHeightMeters: 8.5

# after
scale: 1.0
realHeightMeters: 8.5
```

これにより、モデルの高さが 85m → 8.5m になり、100m 先からでも適切な大きさで表示される。

**対象ファイル:**
- `public/config/old-place.yaml`
- `public/config/Takizawa.yaml`
- （miyakoSuimon.yaml は `scale: 1.0` のため修正不要）

### B. `placeNearUser` 修正のデプロイ確認

前回の修正（`placeNearUser: true` → 削除）がデプロイされているか確認する。動画の挙動は旧コード（モデルを前方 3m に固定配置）と一致する可能性がある。

確認方法:
1. ビルドして再デプロイ: `npm run build`
2. Cloudflare Tunnel で提供されているバージョンを確認

### C. HUD にデバッグ距離表示を追加

AR 表示中に「ユーザーとモデル間の距離」を HUD の GPS カードに表示する:

```
GPS: 追跡中 12m / モデルまで 150m
```

実装箇所: `orientation-fallback.ts` の `startGPSWatch` コールバック内で距離を計算し `setGPSStatus` に含める。

### D. 遠距離時のガイド表示（将来改善）

モデルが一定距離以上（例: 500m）離れている場合:
- 3D モデルの代わりに方向インジケータ（矢印 + 距離テキスト）を表示
- モデル自体は非表示にし、近づいたら切り替え

これにより「モデルが見えない」問題と「モデルが遠くて小さすぎる」問題を回避できる。

---

## 推奨対応順序

1. **`scale` 値の修正** → YAML を修正するだけで即座に効果あり
2. **デプロイ確認** → `placeNearUser` 修正が反映されているか確認
3. **距離表示の追加** → デバッグと UX 両方に有効
4. **ガイド表示** → 余裕があれば実装
