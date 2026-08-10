const WRITE_KEY_STORAGE = "aegis-personal-write-key";
export const WRITE_KEY_CHANGED_EVENT = "aegis-write-key-changed";

export function getPersonalWriteKey() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(WRITE_KEY_STORAGE);
}

export function setPersonalWriteKey(key: string) {
  window.localStorage.setItem(WRITE_KEY_STORAGE, key);
  window.dispatchEvent(new Event(WRITE_KEY_CHANGED_EVENT));
}

export function clearPersonalWriteKey() {
  window.localStorage.removeItem(WRITE_KEY_STORAGE);
  window.dispatchEvent(new Event(WRITE_KEY_CHANGED_EVENT));
}

export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const key = getPersonalWriteKey();
  if (key) headers.set("x-aegis-write-key", key);
  return fetch(input, { ...init, headers });
}

export async function verifyPersonalWriteKey(apiUrl: string, key: string) {
  const response = await fetch(`${apiUrl}/api/v1/access/verify`, {
    method: "POST",
    headers: { "x-aegis-write-key": key },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "The write key was rejected.");
  }
}
