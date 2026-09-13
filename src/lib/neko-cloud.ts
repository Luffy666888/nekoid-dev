import { useEffect, useState } from "react";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";

import { getCatAvatar } from "@/components/neko/catAvatarStore";
import {
  getCatPersona,
  getCatProfile,
  hydratePersistedCatResult,
  type CatPersona,
  type CatProfile,
} from "@/components/neko/catProfileStore";
import { voicesStore, type Voice } from "@/components/neko/app/voicesStore";
import {
  getSupabaseBrowserClient,
  getSupabasePublicConfig,
  NEKO_MEDIA_BUCKET,
} from "@/lib/supabase/client";
import { isNekoUploadSizeAllowed, NEKO_MAX_UPLOAD_LABEL } from "@/lib/neko-upload-limits";

type CloudAuthState =
  | { status: "unconfigured"; session: null; user: null }
  | { status: "loading"; session: null; user: null }
  | { status: "signed-out"; session: null; user: null }
  | { status: "signed-in"; session: Session; user: User };

type CatRow = {
  id: string;
  user_id: string;
  name: CatProfile["name"];
  gender: CatProfile["gender"];
  age_stage: CatProfile["ageStage"];
  avatar_object_key: string | null;
  quiz: CatProfile["quiz"] | null;
  updated_at: string;
};

type PersonaRow = {
  id: string;
  cat_id: string;
  type: string;
  mbti: string;
  match_score: number;
  monologue: string;
  analysis: string;
  core_personality: string | null;
  misunderstanding: string | null;
  love_language: string | null;
  owner_role: string;
  tags: string[] | null;
  traits: CatPersona["traits"] | null;
  observations: CatPersona["observations"] | null;
  evidence: CatPersona["evidence"] | null;
  daily_mood: string;
  updated_at: string;
};

type VoiceRow = {
  id: string;
  text: string;
  subtext: string | null;
  analysis: string | null;
  analysis_summary: string | null;
  personality_interpretation: string | null;
  share_headline: string | null;
  share_insight: string | null;
  share_tags: string[] | null;
  location: string | null;
  tags: string[] | null;
  media_object_key: string | null;
  media_type: Voice["mediaType"] | null;
  aspect: Voice["aspect"] | null;
  video_duration: string | null;
  grad: string | null;
  local_time_label: string | null;
  created_at: string;
};

export type NekoUserProfile = {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarObjectKey: string | null;
  onboardingCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NekoAccountSummary = {
  profile: NekoUserProfile;
  catCount: number;
  voiceCount: number;
};

type SaveOptions = {
  includeVoices?: boolean;
};

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const PROFILE_COLUMNS =
  "id,email,display_name,avatar_object_key,onboarding_completed_at,created_at,updated_at";

function requireSupabaseClient(): SupabaseClient {
  const client = getSupabaseBrowserClient();
  if (!client) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }
  return client;
}

async function requireSupabaseUser(client: SupabaseClient): Promise<User> {
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("SUPABASE_NOT_SIGNED_IN");
  return data.user;
}

function randomId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function isUuid(value: string | undefined) {
  return Boolean(
    value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
  );
}

function cleanStringList(value: string[] | undefined) {
  return (value ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function extFromMime(mime: string) {
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("webm")) return "webm";
  return "bin";
}

async function uploadDataUrl(
  client: SupabaseClient,
  userId: string,
  objectPath: string,
  dataUrl: string | undefined | null,
  currentObjectKey?: string,
) {
  if (!dataUrl?.startsWith("data:")) return currentObjectKey;

  const response = await fetch(dataUrl);
  const blob = await response.blob();
  if (!isNekoUploadSizeAllowed(blob.size)) {
    throw new Error(`NEKO_UPLOAD_TOO_LARGE: ${NEKO_MAX_UPLOAD_LABEL}`);
  }
  const mime = blob.type || dataUrl.match(/^data:([^;]+)/)?.[1] || "application/octet-stream";
  const ext = extFromMime(mime);
  const objectKey = `${userId}/${objectPath}.${ext}`;

  const { error } = await client.storage.from(NEKO_MEDIA_BUCKET).upload(objectKey, blob, {
    cacheControl: "3600",
    contentType: mime,
    upsert: true,
  });

  if (error) throw error;
  return objectKey;
}

async function signedMediaUrl(client: SupabaseClient, objectKey: string | null | undefined) {
  if (!objectKey) return undefined;
  const { data, error } = await client.storage
    .from(NEKO_MEDIA_BUCKET)
    .createSignedUrl(objectKey, SIGNED_URL_TTL_SECONDS);
  if (error) return undefined;
  return data.signedUrl;
}

function msToIso(ms: number | undefined) {
  return new Date(ms && Number.isFinite(ms) ? ms : Date.now()).toISOString();
}

function isoToMs(value: string | null | undefined) {
  const ms = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(ms) ? ms : Date.now();
}

function formatTimeLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "刚刚";
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export function isNekoCloudConfigured() {
  return Boolean(getSupabasePublicConfig());
}

function fallbackDisplayName(user: User) {
  const metadataName = typeof user.user_metadata?.name === "string" ? user.user_metadata.name : "";
  return metadataName.trim() || user.email?.split("@")[0] || "喵一下用户";
}

function mapProfileRow(row: Record<string, unknown>): NekoUserProfile {
  return {
    id: String(row.id),
    email: typeof row.email === "string" ? row.email : null,
    displayName: typeof row.display_name === "string" ? row.display_name : null,
    avatarObjectKey: typeof row.avatar_object_key === "string" ? row.avatar_object_key : null,
    onboardingCompletedAt:
      typeof row.onboarding_completed_at === "string" ? row.onboarding_completed_at : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
  };
}

async function loadOrCreateNekoUserProfile(client: SupabaseClient, user: User) {
  const { data: existingProfile, error: selectError } = await client
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existingProfile) return mapProfileRow(existingProfile as Record<string, unknown>);

  const { data, error } = await client
    .from("profiles")
    .insert({
      id: user.id,
      email: user.email ?? null,
      display_name: fallbackDisplayName(user),
    })
    .select(PROFILE_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: racedProfile, error: racedSelectError } = await client
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("id", user.id)
        .single();

      if (racedSelectError) throw racedSelectError;
      return mapProfileRow(racedProfile as Record<string, unknown>);
    }

    throw error;
  }

  return mapProfileRow(data as Record<string, unknown>);
}

async function countOwnedRows(
  client: SupabaseClient,
  table: "cats" | "cat_voices",
  userId: string,
) {
  const { count, error } = await client
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (!error) return count ?? 0;

  console.warn(`NEKO account ${table} count failed`, error);
  const { data, error: fallbackError } = await client
    .from(table)
    .select("id")
    .eq("user_id", userId)
    .limit(1000);

  if (fallbackError) {
    console.warn(`NEKO account ${table} fallback count failed`, fallbackError);
    return 0;
  }

  return data?.length ?? 0;
}

export function useNekoCloudAuth(): CloudAuthState {
  const [state, setState] = useState<CloudAuthState>(() =>
    isNekoCloudConfigured()
      ? { status: "loading", session: null, user: null }
      : { status: "unconfigured", session: null, user: null },
  );

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setState({ status: "unconfigured", session: null, user: null });
      return;
    }

    let live = true;

    client.auth.getSession().then(({ data }) => {
      if (!live) return;
      const session = data.session;
      setState(
        session
          ? { status: "signed-in", session, user: session.user }
          : { status: "signed-out", session: null, user: null },
      );
    });

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setState(
        session
          ? { status: "signed-in", session, user: session.user }
          : { status: "signed-out", session: null, user: null },
      );
    });

    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return state;
}

export async function requestNekoLoginCode(email: string) {
  const client = requireSupabaseClient();
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error("EMAIL_REQUIRED");

  const { error } = await client.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${window.location.origin}/auth/login`,
    },
  });

  if (error) throw error;
  return { email: normalizedEmail };
}

export const requestNekoLoginLink = requestNekoLoginCode;

export async function verifyNekoLoginCode(email: string, token: string) {
  const client = requireSupabaseClient();
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedToken = token.replace(/\D/g, "");
  if (!normalizedEmail) throw new Error("EMAIL_REQUIRED");
  if (normalizedToken.length !== 6) throw new Error("OTP_CODE_INVALID");

  const { data, error } = await client.auth.verifyOtp({
    email: normalizedEmail,
    token: normalizedToken,
    type: "email",
  });

  if (error) throw error;
  return data;
}

export async function signOutNekoCloud() {
  const client = requireSupabaseClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function loadNekoUserProfile() {
  const client = requireSupabaseClient();
  const user = await requireSupabaseUser(client);

  return loadOrCreateNekoUserProfile(client, user);
}

export async function updateNekoUserProfile(displayName: string) {
  const client = requireSupabaseClient();
  const user = await requireSupabaseUser(client);
  const nextDisplayName = displayName.trim().slice(0, 40) || fallbackDisplayName(user);

  const { error: authError } = await client.auth.updateUser({
    data: { name: nextDisplayName },
  });
  if (authError) throw authError;

  const { data, error } = await client
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email ?? null,
        display_name: nextDisplayName,
      },
      { onConflict: "id" },
    )
    .select(PROFILE_COLUMNS)
    .single();

  if (error) throw error;
  return mapProfileRow(data as Record<string, unknown>);
}

export async function loadNekoAccountSummary(): Promise<NekoAccountSummary> {
  const client = requireSupabaseClient();
  const user = await requireSupabaseUser(client);
  const [profile, catCount, voiceCount] = await Promise.all([
    loadOrCreateNekoUserProfile(client, user),
    countOwnedRows(client, "cats", user.id),
    countOwnedRows(client, "cat_voices", user.id),
  ]);

  return {
    profile,
    catCount,
    voiceCount,
  };
}

async function saveProfileAndCat(client: SupabaseClient, user: User, profile: CatProfile) {
  const profileAvatar = profile.avatar ?? getCatAvatar() ?? undefined;
  let cloudId = isUuid(profile.cloudId) ? profile.cloudId! : "";
  let currentAvatarObjectKey = profile.avatarObjectKey;

  if (!cloudId) {
    const { data, error } = await client
      .from("cats")
      .select("id,avatar_object_key")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    const existing = data as Pick<CatRow, "id" | "avatar_object_key"> | null;
    cloudId = existing?.id ?? randomId();
    currentAvatarObjectKey = currentAvatarObjectKey ?? existing?.avatar_object_key ?? undefined;
  }

  const avatarObjectKey = await uploadDataUrl(
    client,
    user.id,
    `cats/${cloudId}/avatar`,
    profileAvatar,
    currentAvatarObjectKey,
  );

  const { error: profileError } = await client.from("profiles").upsert(
    {
      id: user.id,
      email: user.email ?? null,
      display_name: user.user_metadata?.name ?? user.email ?? null,
      avatar_object_key: avatarObjectKey ?? null,
      onboarding_completed_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (profileError) throw profileError;

  const { data, error } = await client
    .from("cats")
    .upsert(
      {
        id: cloudId,
        user_id: user.id,
        name: profile.name,
        gender: profile.gender,
        age_stage: profile.ageStage,
        avatar_object_key: avatarObjectKey ?? null,
        quiz: profile.quiz ?? {},
        is_active: true,
      },
      { onConflict: "id" },
    )
    .select("id,user_id,name,gender,age_stage,avatar_object_key,quiz,updated_at")
    .single();

  if (error) throw error;
  const row = data as CatRow;
  const hydratedProfile: CatProfile = {
    ...profile,
    cloudId: row.id,
    avatar: profileAvatar,
    avatarObjectKey: row.avatar_object_key ?? undefined,
    updatedAt: isoToMs(row.updated_at),
  };

  return hydratedProfile;
}

async function savePersona(
  client: SupabaseClient,
  user: User,
  catId: string,
  persona: CatPersona | null,
) {
  if (!persona) return null;

  const { data, error } = await client
    .from("cat_personas")
    .upsert(
      {
        cat_id: catId,
        user_id: user.id,
        type: persona.type,
        mbti: persona.mbti,
        match_score: persona.matchScore,
        monologue: persona.monologue,
        analysis: persona.analysis,
        core_personality: persona.corePersonality ?? null,
        misunderstanding: persona.misunderstanding ?? null,
        love_language: persona.loveLanguageInsight ?? persona.loveLanguage ?? null,
        owner_role: persona.ownerRelationship ?? persona.ownerRole,
        tags: cleanStringList(persona.tags),
        traits: persona.traits ?? [],
        observations: persona.observations ?? [],
        evidence: persona.evidence ?? [],
        daily_mood: persona.dailyMood,
      },
      { onConflict: "cat_id" },
    )
    .select(
      "id,cat_id,type,mbti,match_score,monologue,analysis,core_personality,misunderstanding,love_language,owner_role,tags,traits,observations,evidence,daily_mood,updated_at",
    )
    .single();

  if (error) throw error;
  const row = data as PersonaRow;
  return {
    ...persona,
    cloudId: row.id,
    catCloudId: row.cat_id,
    savedAt: isoToMs(row.updated_at),
  };
}

async function saveVoice(client: SupabaseClient, user: User, catId: string, voice: Voice) {
  const voiceId = isUuid(voice.cloudId) ? voice.cloudId : randomId();
  const mediaObjectKey = await uploadDataUrl(
    client,
    user.id,
    `voices/${voiceId}/media`,
    voice.media,
    voice.mediaObjectKey,
  );

  const createdAt = msToIso(voice.createdAt);
  const structuredAnalysis = typeof voice.analysis === "object" ? voice.analysis : undefined;
  const { error } = await client.from("cat_voices").upsert(
    {
      id: voiceId,
      cat_id: catId,
      user_id: user.id,
      text: voice.text,
      subtext: voice.subtext ?? null,
      analysis:
        typeof voice.analysis === "string"
          ? voice.analysis
          : [structuredAnalysis?.observation, structuredAnalysis?.personalityInterpretation]
              .filter(Boolean)
              .join("\n\n") || null,
      analysis_summary: structuredAnalysis?.observation ?? null,
      personality_interpretation: structuredAnalysis?.personalityInterpretation ?? null,
      share_headline: voice.share?.headline ?? null,
      share_insight: voice.share?.insight ?? null,
      share_tags: cleanStringList(voice.share?.tags),
      location: voice.location ?? null,
      tags: cleanStringList(voice.tags),
      media_object_key: mediaObjectKey ?? null,
      media_type: voice.mediaType ?? null,
      aspect: voice.aspect ?? null,
      video_duration: voice.videoDuration ?? null,
      grad: voice.grad,
      local_time_label: voice.time,
      created_at: createdAt,
    },
    { onConflict: "id" },
  );

  if (error) throw error;
  return {
    ...voice,
    cloudId: voiceId,
    mediaObjectKey,
    createdAt: isoToMs(createdAt),
  };
}

export async function saveLocalNekoToCloud(options: SaveOptions = {}) {
  const client = requireSupabaseClient();
  const user = await requireSupabaseUser(client);
  const currentProfile = getCatProfile();
  const currentPersona = getCatPersona();

  const savedProfile = await saveProfileAndCat(client, user, currentProfile);
  const savedPersona = await savePersona(client, user, savedProfile.cloudId!, currentPersona);

  if (options.includeVoices !== false) {
    const savedVoices: Voice[] = [];
    for (const voice of voicesStore.get()) {
      savedVoices.push(await saveVoice(client, user, savedProfile.cloudId!, voice));
    }
    voicesStore.replaceAll(savedVoices);
  }

  hydratePersistedCatResult(savedProfile, savedPersona ?? currentPersona);

  return {
    catId: savedProfile.cloudId!,
    voicesCount: options.includeVoices === false ? 0 : voicesStore.get().length,
  };
}

export async function loadNekoFromCloud() {
  const client = requireSupabaseClient();
  const user = await requireSupabaseUser(client);

  const { data: catData, error: catError } = await client
    .from("cats")
    .select("id,user_id,name,gender,age_stage,avatar_object_key,quiz,updated_at")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (catError) throw catError;
  if (!catData) return { restored: false, voicesCount: 0 };

  const cat = catData as CatRow;

  const [{ data: personaData, error: personaError }, { data: voiceData, error: voiceError }] =
    await Promise.all([
      client
        .from("cat_personas")
        .select(
          "id,cat_id,type,mbti,match_score,monologue,analysis,core_personality,misunderstanding,love_language,owner_role,tags,traits,observations,evidence,daily_mood,updated_at",
        )
        .eq("cat_id", cat.id)
        .maybeSingle(),
      client
        .from("cat_voices")
        .select(
          "id,text,subtext,analysis,analysis_summary,personality_interpretation,share_headline,share_insight,share_tags,location,tags,media_object_key,media_type,aspect,video_duration,grad,local_time_label,created_at",
        )
        .eq("cat_id", cat.id)
        .order("created_at", { ascending: false }),
    ]);

  if (personaError) throw personaError;
  if (voiceError) throw voiceError;

  const avatar = await signedMediaUrl(client, cat.avatar_object_key);
  const profile: CatProfile = {
    cloudId: cat.id,
    name: cat.name,
    gender: cat.gender,
    ageStage: cat.age_stage,
    avatar,
    avatarObjectKey: cat.avatar_object_key ?? undefined,
    quiz: cat.quiz ?? undefined,
    updatedAt: isoToMs(cat.updated_at),
  };

  const personaRow = personaData as PersonaRow | null;
  const persona: CatPersona | null = personaRow
    ? {
        cloudId: personaRow.id,
        catCloudId: personaRow.cat_id,
        name: cat.name,
        type: personaRow.type,
        mbti: personaRow.mbti,
        matchScore: personaRow.match_score,
        monologue: personaRow.monologue,
        analysis: personaRow.analysis,
        corePersonality: personaRow.core_personality ?? personaRow.type,
        misunderstanding: personaRow.misunderstanding ?? personaRow.analysis,
        loveLanguage: personaRow.love_language ?? undefined,
        loveLanguageInsight: personaRow.love_language ?? undefined,
        ownerRole: personaRow.owner_role,
        ownerRelationship: personaRow.owner_role,
        tags: personaRow.tags ?? [],
        traits: personaRow.traits ?? [],
        observations: personaRow.observations ?? [],
        evidence: personaRow.evidence ?? [],
        dailyMood: personaRow.daily_mood,
        savedAt: isoToMs(personaRow.updated_at),
      }
    : null;

  const voiceRows = (voiceData ?? []) as VoiceRow[];
  const voices: Voice[] = await Promise.all(
    voiceRows.map(async (row) => ({
      cloudId: row.id,
      time: row.local_time_label || formatTimeLabel(row.created_at),
      grad: row.grad || "linear-gradient(135deg, oklch(0.9 0.06 280), oklch(0.92 0.05 320))",
      text: row.text,
      subtext: row.subtext ?? undefined,
      location: row.location ?? undefined,
      tags: row.tags ?? undefined,
      createdAt: isoToMs(row.created_at),
      media: await signedMediaUrl(client, row.media_object_key),
      mediaObjectKey: row.media_object_key ?? undefined,
      mediaType: row.media_type ?? undefined,
      aspect: row.aspect ?? undefined,
      videoDuration: row.video_duration ?? undefined,
      analysis:
        row.analysis_summary || row.personality_interpretation
          ? {
              observation: row.analysis_summary ?? row.analysis ?? "",
              personalityInterpretation: row.personality_interpretation ?? "",
            }
          : (row.analysis ?? undefined),
      share:
        row.share_headline || row.share_insight || row.share_tags?.length
          ? {
              headline: row.share_headline ?? row.text,
              insight: row.share_insight ?? row.personality_interpretation ?? row.analysis ?? "",
              tags: row.share_tags ?? row.tags ?? [],
            }
          : undefined,
    })),
  );

  hydratePersistedCatResult(profile, persona);
  voicesStore.replaceAll(voices);

  return { restored: true, voicesCount: voices.length };
}

export async function deleteCloudVoice(voice: Voice | null | undefined) {
  if (!voice?.cloudId) return;

  const client = requireSupabaseClient();
  await requireSupabaseUser(client);

  const { error } = await client.from("cat_voices").delete().eq("id", voice.cloudId);
  if (error) throw error;

  if (voice.mediaObjectKey) {
    await client.storage.from(NEKO_MEDIA_BUCKET).remove([voice.mediaObjectKey]);
  }
}
