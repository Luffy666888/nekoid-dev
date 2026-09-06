import { useSyncExternalStore } from "react";
import { getPersistJSON, NEKO_PERSIST_KEYS, setPersistJSON } from "../transientSession";

export type Voice = {
  cloudId?: string;
  time: string;
  grad: string;
  text: string;
  location?: string;
  tags?: string[];
  createdAt?: number;
  media?: string;
  mediaObjectKey?: string;
  mediaType?: "photo" | "video";
  aspect?: "9:16" | "4:5" | "3:4" | "1:1";
  videoDuration?: string;
  analysis?:
    | string
    | {
        summary: string;
        personalityInterpretation: string;
      };
  share?: {
    headline: string;
    insight: string;
    tags: string[];
  };
};

export function voiceAnalysisText(voice?: Voice | null): string | undefined {
  if (!voice?.analysis) return undefined;
  if (typeof voice.analysis === "string") return voice.analysis;
  return [voice.analysis.summary, voice.analysis.personalityInterpretation].filter(Boolean).join("\n\n");
}

const CAT_GRADIENTS = [
  "linear-gradient(135deg, oklch(0.92 0.05 320), oklch(0.9 0.06 0))",
  "linear-gradient(135deg, oklch(0.9 0.06 280), oklch(0.92 0.05 320))",
  "linear-gradient(135deg, oklch(0.93 0.04 60), oklch(0.9 0.06 0))",
  "linear-gradient(135deg, oklch(0.9 0.06 260), oklch(0.93 0.04 200))",
];

function voiceKey(v: Voice) {
  if (v.cloudId) return `cloud:${v.cloudId}`;
  return [v.createdAt ?? "", v.text ?? "", v.media?.slice(0, 96) ?? ""].join("|");
}

function normalizeVoices(list: Voice[]) {
  const seen = new Set<string>();
  return list.filter((voice) => {
    if (!voice?.text) return false;
    const key = voiceKey(voice);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

let voices: Voice[] = normalizeVoices(getPersistJSON<Voice[]>(NEKO_PERSIST_KEYS.voices) ?? []);

const listeners = new Set<() => void>();
const emit = () => {
  setPersistJSON(NEKO_PERSIST_KEYS.voices, voices);
  listeners.forEach((l) => l());
};

export const voicesStore = {
  get: () => voices,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  removeAt: (i: number) => {
    voices = voices.filter((_, idx) => idx !== i);
    emit();
  },
  removeMany: (indexes: Set<number>) => {
    voices = voices.filter((_, idx) => !indexes.has(idx));
    emit();
  },
  clear: () => {
    voices = [];
    emit();
  },
  replaceAll: (list: Voice[]) => {
    voices = normalizeVoices(list);
    emit();
  },
  replaceAt: (i: number, v: Voice) => {
    voices = voices.map((item, idx) => (idx === i ? v : item));
    emit();
  },
  prepend: (v: Voice) => {
    const key = voiceKey(v);
    voices = [v, ...voices.filter((item) => voiceKey(item) !== key)];
    emit();
  },
};

if (typeof window !== "undefined") {
  setPersistJSON(NEKO_PERSIST_KEYS.voices, voices);
}

export function useVoices(): Voice[] {
  return useSyncExternalStore(voicesStore.subscribe, voicesStore.get, voicesStore.get);
}

export { CAT_GRADIENTS };
