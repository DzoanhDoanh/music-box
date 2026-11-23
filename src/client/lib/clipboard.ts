/**
 * Copies text even where the async Clipboard API is missing (plain HTTP on a LAN IP,
 * older in-app browsers). Resolves false instead of throwing so callers can show a hint.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path (permission denied, insecure context…).
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Pulls a room code out of a pasted invite link or free text ("abc 123" → "ABC123"). */
export function extractRoomCode(value: string): string {
  const trimmed = value.trim();
  try {
    const code = new URL(trimmed).searchParams.get('code');
    if (code) return code.replace(/[^a-z0-9]/gi, '').toUpperCase();
  } catch {
    // Not a URL; treat as a typed code.
  }
  return trimmed.replace(/[^a-z0-9]/gi, '').toUpperCase();
}
