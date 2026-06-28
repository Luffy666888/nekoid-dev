import { useEffect, useState } from "react";
import { getPersistString, getSessionString, NEKO_PERSIST_KEYS, NEKO_SESSION_KEYS, setPersistString, setSessionString } from "./transientSession";

const EVT = "neko:avatar-change";

export function setCatAvatar(dataUrl: string) {
  setSessionString(NEKO_SESSION_KEYS.avatar, dataUrl);
  window.dispatchEvent(new CustomEvent(EVT));
}

export function getCatAvatar(): string | null {
  return getSessionString(NEKO_SESSION_KEYS.avatar) || getPersistString(NEKO_PERSIST_KEYS.avatar);
}

export function getCurrentSessionCatAvatar(): string | null {
  return getSessionString(NEKO_SESSION_KEYS.avatar);
}

export function persistCatAvatar(dataUrl: string) {
  setPersistString(NEKO_PERSIST_KEYS.avatar, dataUrl);
  window.dispatchEvent(new CustomEvent(EVT));
}

export function useCatAvatar(): string | null {
  const [v, setV] = useState<string | null>(null);
  useEffect(() => {
    setV(getCatAvatar());
    const h = () => setV(getCatAvatar());
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, []);
  return v;
}
