import { useEffect, useState } from "react";
import { getSessionString, NEKO_SESSION_KEYS, removeSessionValue, setSessionString } from "../transientSession";

const EVT = "neko:publish-photo-change";

export function setPublishPhoto(dataUrl: string) {
  setSessionString(NEKO_SESSION_KEYS.publishPhoto, dataUrl);
  window.dispatchEvent(new CustomEvent(EVT));
}

export function getPublishPhoto(): string | null {
  return getSessionString(NEKO_SESSION_KEYS.publishPhoto);
}

export function clearPublishPhoto() {
  removeSessionValue(NEKO_SESSION_KEYS.publishPhoto);
  window.dispatchEvent(new CustomEvent(EVT));
}

export function usePublishPhoto(): string | null {
  const [v, setV] = useState<string | null>(null);
  useEffect(() => {
    setV(getPublishPhoto());
    const h = () => setV(getPublishPhoto());
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, []);
  return v;
}
