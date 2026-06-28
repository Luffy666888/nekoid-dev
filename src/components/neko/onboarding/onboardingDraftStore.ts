import { getSessionJSON, NEKO_SESSION_KEYS, setSessionJSON } from "../transientSession";

export type PhotoDraft = {
  name: string;
  gender: "m" | "f" | null;
  age: 0 | 1 | 2 | 3 | null;
  avatar: string | null;
  verified: boolean;
};

export type VideoDraftClip = {
  id: string;
  thumb?: string;
  gradient: string;
  duration: string;
  label: string;
};

const DEFAULT_PHOTO_DRAFT: PhotoDraft = {
  name: "",
  gender: null,
  age: null,
  avatar: null,
  verified: false,
};

export function getPhotoDraft(): PhotoDraft {
  return getSessionJSON<PhotoDraft>(NEKO_SESSION_KEYS.photoDraft) ?? DEFAULT_PHOTO_DRAFT;
}

export function setPhotoDraft(patch: Partial<PhotoDraft>) {
  setSessionJSON(NEKO_SESSION_KEYS.photoDraft, { ...getPhotoDraft(), ...patch });
}

export function getVideoDraft(): VideoDraftClip[] {
  return getSessionJSON<VideoDraftClip[]>(NEKO_SESSION_KEYS.videoDraft) ?? [];
}

export function setVideoDraft(clips: VideoDraftClip[]) {
  setSessionJSON(NEKO_SESSION_KEYS.videoDraft, clips);
}
