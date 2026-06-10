import { describe, it, expect } from 'vitest';
import * as jsyaml from 'js-yaml';
import {
  fileNameToModelKind,
  normalizeLocation,
  parseLocationsYaml,
  parseTargetsYaml,
} from './locations';

const FIXTURE = `
locations:
  - id: heigawa-suimon
    name: "閉伊川水門"
    latitude: 39.6395435045501
    longitude: 141.96414846972124
    baseAltitudeMeters: 0
    realHeightMeters: 8.5
    defaultHeight: 10
    defaultSize: 10.0
    defaultRotationY: -2
    offsetEast: 0
    offsetNorth: 0
    model: "suimon-kousin.glb"
    icon: "🚪"
    color: "#4e9bff"
  - id: ipu-test-1
    name: "県立大 検証用"
    latitude: 39.802
    longitude: 141.135
    realHeightMeters: 12
    model: "box"
    box: { width: 30, depth: 15, height: 12 }
  - id: broken
    name: "座標なし"
`;

describe('parseLocationsYaml', () => {
  it('locations 配列を正規化し、無効エントリは除外する', () => {
    const result = parseLocationsYaml(FIXTURE, jsyaml);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('heigawa-suimon');
    expect(result[0].modelFile).toBe('suimon-kousin.glb');
    expect(result[0].realHeightMeters).toBe(8.5);
    expect(result[0].rotationYDeg).toBe(-2);
    expect(result[0].box).toBeNull();
  });

  it('box スキーマを読み取る', () => {
    const result = parseLocationsYaml(FIXTURE, jsyaml);
    const ipu = result[1];
    expect(ipu.modelFile).toBe('box');
    expect(ipu.box).toEqual({ width: 30, depth: 15, height: 12 });
  });

  it('models: キーや配列直書きも受け付ける(レガシー)', () => {
    const viaModels = parseLocationsYaml('models:\n  - lat: 1\n    lon: 2\n', jsyaml);
    expect(viaModels).toHaveLength(1);
    expect(viaModels[0].lat).toBe(1);
    const viaArray = parseLocationsYaml('- latitude: 3\n  longitude: 4\n', jsyaml);
    expect(viaArray[0].lon).toBe(4);
  });
});

describe('normalizeLocation', () => {
  it('レガシー別名 (rotationY / sizeMeters / height) を解決する', () => {
    const cfg = normalizeLocation({ lat: 1, lon: 2, rotationY: 45, sizeMeters: 5, height: 3 });
    expect(cfg?.rotationYDeg).toBe(45);
    expect(cfg?.sizeMeters).toBe(5);
    expect(cfg?.height).toBe(3);
  });

  it('model オブジェクト形式 (kind/glb) を解決する', () => {
    const cfg = normalizeLocation({ lat: 1, lon: 2, model: { kind: 'duck' } });
    expect(cfg?.modelFile).toBe('Duck.glb');
  });

  it('不正な box は null に落とす', () => {
    expect(normalizeLocation({ lat: 1, lon: 2, box: { width: 0, depth: 1, height: 1 } })?.box).toBeNull();
    expect(normalizeLocation({ lat: 1, lon: 2, box: { width: 1 } })?.box).toBeNull();
  });
});

describe('fileNameToModelKind', () => {
  it('既知GLBはkindへ、box や未知ファイルは null', () => {
    expect(fileNameToModelKind('suimon-kousin.glb')).toBe('suimon');
    expect(fileNameToModelKind('path/to/Duck.glb')).toBe('duck');
    expect(fileNameToModelKind('box')).toBeNull();
    expect(fileNameToModelKind('unknown.glb')).toBeNull();
    expect(fileNameToModelKind(null)).toBeNull();
  });
});

describe('parseTargetsYaml', () => {
  it('targets 配列を正規化する', () => {
    const yaml = 'targets:\n  - latitude: 1\n    longitude: 2\n    name: "A"\n    icon: "🌊"\n';
    const targets = parseTargetsYaml(yaml, jsyaml);
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('A');
    expect(targets[0].icon).toBe('🌊');
  });
});
