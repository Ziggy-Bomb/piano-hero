// The Anthropic API key lives ONLY in localStorage — never in the zustand
// store, so it can never ride along in a progress export.

const KEY = "piano.anthropicApiKey";

export function getApiKey(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setApiKey(key: string): void {
  localStorage.setItem(KEY, key.trim());
}

export function clearApiKey(): void {
  localStorage.removeItem(KEY);
}
