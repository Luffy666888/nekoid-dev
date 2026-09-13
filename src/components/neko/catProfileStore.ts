import { useEffect, useState } from "react";
import { getCatAvatar, persistCatAvatar, setCatAvatar } from "./catAvatarStore";
import { getCatName, persistCatName, setCatName } from "./catNameStore";
import {
  getPersistJSON,
  getSessionJSON,
  NEKO_PERSIST_KEYS,
  NEKO_SESSION_KEYS,
  removePersistValue,
  removeSessionValue,
  setPersistJSON,
  setSessionJSON,
} from "./transientSession";

const EVT = "neko:profile-change";

export type CatProfile = {
  cloudId?: string;
  name: string;
  gender: "小公猫" | "小母猫";
  ageStage: "幼猫" | "青年猫" | "成熟猫" | "资深猫";
  avatar?: string;
  avatarObjectKey?: string;
  quiz?: Record<number, "a" | "b" | "c" | null>;
  updatedAt: number;
};

export type CatPersona = {
  cloudId?: string;
  catCloudId?: string;
  name: string;
  type: string;
  mbti: string;
  matchScore: number;
  monologue: string;
  analysis: string;
  corePersonality?: string;
  misunderstanding?: string;
  loveLanguage?: string;
  loveLanguageInsight?: string;
  ownerRole: string;
  ownerRelationship?: string;
  tags: string[];
  traits: Array<{ label: string; value: number }>;
  observations: Array<{ label: string; value: string }>;
  evidence?: Array<{ fact: string; interpretation: string }>;
  dailyMood: string;
  savedAt: number;
};

export function getCatProfile(): CatProfile {
  const profileCache = getSessionJSON<CatProfile>(NEKO_SESSION_KEYS.profile);
  if (profileCache) return profileCache;
  const persistedProfile = getPersistJSON<CatProfile>(NEKO_PERSIST_KEYS.profile);
  if (persistedProfile) return persistedProfile;
  return {
    name: getCatName(),
    gender: "小母猫",
    ageStage: "青年猫",
    avatar: getCatAvatar() ?? undefined,
    updatedAt: Date.now(),
  };
}

export function setCatProfile(profile: CatProfile) {
  const normalized = {
    ...profile,
    name: profile.name.trim() || getCatName(),
    updatedAt: Date.now(),
  };
  setSessionJSON(NEKO_SESSION_KEYS.profile, normalized);
  setCatName(normalized.name);
  if (normalized.avatar) setCatAvatar(normalized.avatar);
  window.dispatchEvent(new CustomEvent(EVT));
}

export function updateCatProfile(patch: Partial<CatProfile>) {
  const next = { ...getCatProfile(), ...patch, updatedAt: Date.now() };
  setCatProfile(next);
  if (getPersistJSON<CatPersona>(NEKO_PERSIST_KEYS.persona)) {
    setPersistJSON(NEKO_PERSIST_KEYS.profile, next);
    persistCatName(next.name);
    if (next.avatar) persistCatAvatar(next.avatar);
  }
}

export function getCatPersona(): CatPersona | null {
  return (
    getSessionJSON<CatPersona>(NEKO_SESSION_KEYS.persona) ||
    getPersistJSON<CatPersona>(NEKO_PERSIST_KEYS.persona)
  );
}

export function setCatPersona(persona: CatPersona) {
  setSessionJSON(NEKO_SESSION_KEYS.persona, { ...persona, savedAt: Date.now() });
  window.dispatchEvent(new CustomEvent(EVT));
}

export function clearCatPersona() {
  removeSessionValue(NEKO_SESSION_KEYS.persona);
  removePersistValue(NEKO_PERSIST_KEYS.persona);
  window.dispatchEvent(new CustomEvent(EVT));
}

export function persistCatResult() {
  const latestAvatar = getCatAvatar();
  const profile = {
    ...getCatProfile(),
    avatar: getCatProfile().avatar ?? latestAvatar ?? undefined,
  };
  const persona = getCatPersona();
  setPersistJSON(NEKO_PERSIST_KEYS.profile, profile);
  if (persona) setPersistJSON(NEKO_PERSIST_KEYS.persona, persona);
  persistCatName(profile.name);
  if (profile.avatar) persistCatAvatar(profile.avatar);
  window.dispatchEvent(new CustomEvent(EVT));
}

export function hydratePersistedCatResult(profile: CatProfile, persona?: CatPersona | null) {
  const normalizedProfile = {
    ...profile,
    name: profile.name.trim() || getCatName(),
    updatedAt: profile.updatedAt || Date.now(),
  };

  setSessionJSON(NEKO_SESSION_KEYS.profile, normalizedProfile);
  setPersistJSON(NEKO_PERSIST_KEYS.profile, normalizedProfile);
  setCatName(normalizedProfile.name);
  persistCatName(normalizedProfile.name);

  if (normalizedProfile.avatar) {
    setCatAvatar(normalizedProfile.avatar);
    persistCatAvatar(normalizedProfile.avatar);
  }

  if (persona) {
    const normalizedPersona = { ...persona, savedAt: persona.savedAt || Date.now() };
    setSessionJSON(NEKO_SESSION_KEYS.persona, normalizedPersona);
    setPersistJSON(NEKO_PERSIST_KEYS.persona, normalizedPersona);
  }

  window.dispatchEvent(new CustomEvent(EVT));
}

export function useCatProfile(): CatProfile {
  const [profile, setProfile] = useState(() => getCatProfile());
  useEffect(() => {
    const h = () => setProfile(getCatProfile());
    window.addEventListener(EVT, h);
    return () => {
      window.removeEventListener(EVT, h);
    };
  }, []);
  return profile;
}

export function useCatPersona(): CatPersona | null {
  const [persona, setPersona] = useState(() => getCatPersona());
  useEffect(() => {
    const h = () => setPersona(getCatPersona());
    window.addEventListener(EVT, h);
    return () => {
      window.removeEventListener(EVT, h);
    };
  }, []);
  return persona;
}
