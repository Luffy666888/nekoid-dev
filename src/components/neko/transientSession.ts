const PREFIX = "neko:session:";
const PERSIST_PREFIX = "neko:persist:";

export const NEKO_SESSION_KEYS = {
  avatar: `${PREFIX}avatar`,
  name: `${PREFIX}name`,
  profile: `${PREFIX}profile`,
  persona: `${PREFIX}persona`,
  photoDraft: `${PREFIX}onboarding:photo`,
  videoDraft: `${PREFIX}onboarding:videos`,
  publishPhoto: `${PREFIX}publish:photo`,
  publishScene: `${PREFIX}publish:scene`,
  publishVoice: `${PREFIX}publish:voice`,
  voices: `${PREFIX}voices`,
} as const;

export const NEKO_PERSIST_KEYS = {
  avatar: `${PERSIST_PREFIX}avatar`,
  name: `${PERSIST_PREFIX}name`,
  profile: `${PERSIST_PREFIX}profile`,
  persona: `${PERSIST_PREFIX}persona`,
  voices: `${PERSIST_PREFIX}voices`,
} as const;

function canUseSessionStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getSessionString(key: string): string | null {
  if (!canUseSessionStorage()) return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setSessionString(key: string, value: string) {
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {}
}

export function removeSessionValue(key: string) {
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {}
}

export function getSessionJSON<T>(key: string): T | null {
  const raw = getSessionString(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setSessionJSON<T>(key: string, value: T) {
  setSessionString(key, JSON.stringify(value));
}

export function getPersistString(key: string): string | null {
  if (!canUseLocalStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setPersistString(key: string, value: string) {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

export function removePersistValue(key: string) {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {}
}

export function getPersistJSON<T>(key: string): T | null {
  const raw = getPersistString(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setPersistJSON<T>(key: string, value: T) {
  setPersistString(key, JSON.stringify(value));
}

export function clearNekoSessionCache() {
  if (!canUseSessionStorage()) return;
  Object.values(NEKO_SESSION_KEYS).forEach((key) => removeSessionValue(key));
}
