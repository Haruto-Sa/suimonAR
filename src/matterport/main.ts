const startBtn = document.getElementById('start-btn') as HTMLButtonElement | null;
const message = document.getElementById('message') as HTMLElement | null;

const MATTERPORT_HOST_PATTERN = /^https:\/\/(my\.matterport\.com|mpembed\.com)\//i;

function setMessage(text: string): void {
  if (!message) return;
  message.textContent = text;
}

function validateMatterportUrl(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (MATTERPORT_HOST_PATTERN.test(parsed.href) || parsed.hostname.endsWith('.matterport.com')) {
    return parsed.href;
  }
  return null;
}

function getTargetUrl(): string | null {
  if (typeof document === 'undefined') return null;
  return validateMatterportUrl(document.body?.dataset?.matterportUrl);
}

function init(): void {
  const targetUrl = getTargetUrl();
  if (!startBtn) return;

  if (!targetUrl) {
    startBtn.disabled = true;
    setMessage('Matterport URL の設定が無効です。`matterport.html` の `data-matterport-url` を確認してください。');
    return;
  }

  startBtn.addEventListener('click', () => {
    setMessage('Matterport を開いています...');
    window.location.assign(targetUrl);
  });
}

init();
