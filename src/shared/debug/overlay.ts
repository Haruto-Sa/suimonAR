/**
 * Phase 0 検証用デバッグオーバーレイ。`?debug=1` で有効(開発サーバーでは常時)。
 * ライブ計測値の表示と、「誤差を記録」「結果をコピー」ボタンを提供する。
 */

export function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).get('debug') === '1') return true;
  return Boolean(import.meta.env?.DEV);
}

export type DebugOverlay = {
  setRow(key: string, value: string): void;
  onRecordResidual(cb: () => void): void;
  onCopyResults(cb: () => void): void;
  flash(message: string): void;
  destroy(): void;
};

export function createDebugOverlay(): DebugOverlay {
  const panel = document.createElement('div');
  panel.id = 'phase0-debug-overlay';
  panel.style.cssText = [
    'position:fixed', 'top:72px', 'left:8px', 'z-index:15000',
    'min-width:210px', 'max-width:280px', 'padding:8px 10px',
    'border-radius:10px', 'background:rgba(5,10,18,0.82)',
    'border:1px solid rgba(255,255,255,0.18)', 'color:#9fe0a8',
    "font-family:ui-monospace,'SF Mono',Menlo,monospace", 'font-size:11px',
    'line-height:1.55', 'pointer-events:auto', 'white-space:pre',
  ].join(';');

  const rowsEl = document.createElement('div');
  panel.appendChild(rowsEl);

  const flashEl = document.createElement('div');
  flashEl.style.cssText = 'color:#ffd76a;min-height:14px;margin-top:2px;white-space:normal;';
  panel.appendChild(flashEl);

  const buttonBar = document.createElement('div');
  buttonBar.style.cssText = 'display:flex;gap:6px;margin-top:6px;';
  const makeButton = (label: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = [
      'flex:1', 'padding:6px 4px', 'border-radius:8px', 'cursor:pointer',
      'border:1px solid rgba(255,255,255,0.25)', 'background:rgba(255,255,255,0.1)',
      'color:#fff', 'font-size:11px', 'font-weight:700',
    ].join(';');
    buttonBar.appendChild(b);
    return b;
  };
  const residualBtn = makeButton('実物に向けて誤差記録');
  const copyBtn = makeButton('結果をコピー');
  panel.appendChild(buttonBar);

  document.body.appendChild(panel);

  const rows = new Map<string, string>();
  let flashTimer: ReturnType<typeof setTimeout> | null = null;

  const render = () => {
    rowsEl.textContent = Array.from(rows.entries())
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
  };

  return {
    setRow(key, value) {
      rows.set(key, value);
      render();
    },
    onRecordResidual(cb) {
      residualBtn.addEventListener('click', cb);
    },
    onCopyResults(cb) {
      copyBtn.addEventListener('click', cb);
    },
    flash(message) {
      flashEl.textContent = message;
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = setTimeout(() => { flashEl.textContent = ''; }, 4000);
    },
    destroy() {
      panel.remove();
    },
  };
}

/** クリップボードへコピー(execCommand フォールバック付き、location-ar と同パターン)。 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return true;
  } catch (error) {
    console.warn('[debug] クリップボードへのコピーに失敗しました', error);
    return false;
  }
}
