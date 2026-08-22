import { useEffect, useState } from "react";
import { getPersistString, getSessionString, NEKO_PERSIST_KEYS, NEKO_SESSION_KEYS, setPersistString, setSessionString } from "./transientSession";

const EVT = "neko:name-change";
const DEFAULT_NAME = "糯米团";

export function setCatName(name: string) {
  setSessionString(NEKO_SESSION_KEYS.name, name || DEFAULT_NAME);
  window.dispatchEvent(new CustomEvent(EVT));
}

export function getCatName(): string {
  return getSessionString(NEKO_SESSION_KEYS.name) || getPersistString(NEKO_PERSIST_KEYS.name) || DEFAULT_NAME;
}

export function persistCatName(name: string) {
  setPersistString(NEKO_PERSIST_KEYS.name, name || DEFAULT_NAME);
  window.dispatchEvent(new CustomEvent(EVT));
}

export function useCatName(): string {
  const [v, setV] = useState<string>(DEFAULT_NAME);
  useEffect(() => {
    setV(getCatName());
    const h = () => setV(getCatName());
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, []);
  return v;
}
