// Copies text to the clipboard. Resolves false when the browser refuses (no
// clipboard API, or no permission), so the caller confirms only a real copy.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
