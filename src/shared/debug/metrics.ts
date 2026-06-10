/**
 * Phase 0 検証用の計測データ収集(DOM 非依存)。
 * 判定材料: 粗配置の初期ズレ角(=確定時の補正値)、シルエット合わせの所要時間、
 * 確定後の GPS ドリフトとヨー残差。結果は doc/fieldwork/ipu-result.md へ貼り付ける。
 */

export type GpsSampleRecord = {
  t: number;
  lat: number;
  lon: number;
  accuracy: number;
  altitude: number | null;
};

export type DriftRecord = {
  t: number;
  /** 確定時のGPS位置から現在のGPSサンプルまでの距離(m) */
  gpsDriftMeters: number | null;
  /** 「誤差を記録」で測った正味の追従ズレ角(度)。自動計測不能なので手動。 */
  yawResidualDeg: number | null;
};

export type ConfirmRecord = {
  t: number;
  correctionDeg: number;
  trueBearingDeg: number;
  virtualBearingDeg: number;
  distanceMeters: number;
  gpsAccuracyMeters: number | null;
  lat: number;
  lon: number;
  trackingMode: 'sensor' | 'xr';
};

const MAX_GPS_SAMPLES = 1000;

export class AlignmentMetrics {
  readonly sessionStart = Date.now();
  readonly userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
  targetId: string | null = null;
  gpsSamples: GpsSampleRecord[] = [];
  stage2StartTs: number | null = null;
  confirms: ConfirmRecord[] = [];
  driftSamples: DriftRecord[] = [];

  recordGpsSample(sample: { latitude: number; longitude: number; accuracy: number; altitude: number | null }): void {
    if (this.gpsSamples.length >= MAX_GPS_SAMPLES) return;
    this.gpsSamples.push({
      t: Date.now(),
      lat: sample.latitude,
      lon: sample.longitude,
      accuracy: sample.accuracy,
      altitude: sample.altitude,
    });
  }

  markStage2Start(): void {
    this.stage2StartTs = Date.now();
  }

  markConfirm(record: Omit<ConfirmRecord, 't'>): void {
    this.confirms.push({ t: Date.now(), ...record });
  }

  recordDrift(record: Omit<DriftRecord, 't'>): void {
    this.driftSamples.push({ t: Date.now(), ...record });
  }

  get lastConfirm(): ConfirmRecord | null {
    return this.confirms.length ? this.confirms[this.confirms.length - 1] : null;
  }

  /** ステージ2(合わせ開始→確定)の所要時間(ms)。未確定なら null。 */
  get stage2DurationMs(): number | null {
    const confirm = this.lastConfirm;
    if (!confirm || this.stage2StartTs === null) return null;
    return confirm.t - this.stage2StartTs;
  }

  toJSON(): Record<string, unknown> {
    return {
      sessionStart: new Date(this.sessionStart).toISOString(),
      userAgent: this.userAgent,
      targetId: this.targetId,
      stage2DurationMs: this.stage2DurationMs,
      confirms: this.confirms,
      driftSamples: this.driftSamples,
      gpsSampleCount: this.gpsSamples.length,
      gpsAccuracyStats: this.accuracyStats(),
      gpsSamples: this.gpsSamples,
    };
  }

  private accuracyStats(): { min: number; max: number; mean: number } | null {
    if (!this.gpsSamples.length) return null;
    const acc = this.gpsSamples.map((s) => s.accuracy);
    return {
      min: Math.min(...acc),
      max: Math.max(...acc),
      mean: acc.reduce((a, b) => a + b, 0) / acc.length,
    };
  }

  /** doc/fieldwork/ipu-result.md にそのまま貼れる Markdown 断片を返す。 */
  toMarkdownSnippet(): string {
    const confirm = this.lastConfirm;
    const stats = this.accuracyStats();
    const duration = this.stage2DurationMs;
    const residuals = this.driftSamples.filter((d) => d.yawResidualDeg !== null);
    const lines = [
      `## 計測結果 (${new Date(this.sessionStart).toLocaleString('ja-JP')})`,
      '',
      `- 端末: ${this.userAgent}`,
      `- 対象: ${this.targetId ?? '(未設定)'}`,
      `- GPS精度: ${stats ? `min ${stats.min.toFixed(1)}m / mean ${stats.mean.toFixed(1)}m / max ${stats.max.toFixed(1)}m (${this.gpsSamples.length}サンプル)` : 'データなし'}`,
      `- 粗配置の初期ズレ角(=確定時補正値): ${confirm ? `${confirm.correctionDeg.toFixed(1)}°` : '未確定'}`,
      `- 確定時の距離: ${confirm ? `${confirm.distanceMeters.toFixed(1)}m` : '--'} / GPS精度: ${confirm?.gpsAccuracyMeters != null ? `${confirm.gpsAccuracyMeters.toFixed(1)}m` : '--'}`,
      `- シルエット合わせ所要時間: ${duration !== null ? `${(duration / 1000).toFixed(1)}秒` : '--'}`,
      `- トラッキング方式: ${confirm?.trackingMode ?? '--'}`,
      `- 確定回数(合わせ直し含む): ${this.confirms.length}`,
      '',
      '### 確定後のズレ記録',
      ...(residuals.length
        ? residuals.map((d) => {
            const dt = confirm ? ((d.t - confirm.t) / 1000).toFixed(0) : '?';
            return `- 確定 +${dt}秒: ヨー残差 ${d.yawResidualDeg!.toFixed(1)}°${d.gpsDriftMeters !== null ? ` / GPSドリフト ${d.gpsDriftMeters.toFixed(1)}m` : ''}`;
          })
        : ['- (記録なし)']),
      '',
    ];
    return lines.join('\n');
  }
}
