import type { Voice } from "./voicesStore";
import { getSessionJSON, getSessionString, NEKO_SESSION_KEYS, removeSessionValue, setSessionJSON, setSessionString } from "../transientSession";


export function setPublishScene(scene: string) {
  setSessionString(NEKO_SESSION_KEYS.publishScene, scene);
}

export function getPublishScene(): string {
  return getSessionString(NEKO_SESSION_KEYS.publishScene) || "";
}

export function setPublishVoice(voice: Voice) {
  setSessionJSON(NEKO_SESSION_KEYS.publishVoice, voice);
}

export function getPublishVoice(): Voice | null {
  return getSessionJSON<Voice>(NEKO_SESSION_KEYS.publishVoice);
}

export function clearPublishDraft() {
  removeSessionValue(NEKO_SESSION_KEYS.publishScene);
  removeSessionValue(NEKO_SESSION_KEYS.publishVoice);
}
