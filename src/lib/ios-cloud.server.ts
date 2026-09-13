import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { NEKO_MAX_UPLOAD_BYTES, NEKO_MAX_UPLOAD_LABEL } from "@/lib/neko-upload-limits";
import { NEKO_MEDIA_BUCKET } from "@/lib/supabase/client";

type EnvLike = Record<string, string | undefined>;

type IOSUser = {
  id: string;
  email?: string | null;
};

type JsonRecord = Record<string, unknown>;

type CatRow = {
  id: string;
  name: string;
  gender: string;
  age_stage: string;
  avatar_object_key: string | null;
  quiz?: Record<string, string> | null;
  updated_at: string | null;
};

type PersonaRow = {
  id: string;
  cat_id: string;
  type: string;
  mbti: string;
  match_score: number;
  monologue: string;
  analysis: string;
  owner_role: string;
  tags: string[] | null;
  traits: Array<{ label: string; value: number }> | null;
  observations: Array<{ label: string; value: string }> | null;
  daily_mood: string;
  provider?: string | null;
  model?: string | null;
  updated_at?: string | null;
};

type VoiceRow = {
  id: string;
  text: string;
  analysis: string | null;
  analysis_summary: string | null;
  personality_interpretation: string | null;
  share_headline: string | null;
  share_insight: string | null;
  share_tags: string[] | null;
  location: string | null;
  tags: string[] | null;
  media_object_key: string | null;
  media_type: string | null;
  aspect: string | null;
  video_duration: string | null;
  grad: string | null;
  local_time_label: string | null;
  created_at: string | null;
};

const CAT_COLUMNS = "id,name,gender,age_stage,avatar_object_key,quiz,updated_at";
const PERSONA_COLUMNS =
  "id,cat_id,type,mbti,match_score,monologue,analysis,owner_role,tags,traits,observations,daily_mood,provider,model,updated_at";
const VOICE_COLUMNS =
  "id,text,analysis,analysis_summary,personality_interpretation,share_headline,share_insight,share_tags,location,tags,media_object_key,media_type,aspect,video_duration,grad,local_time_label,created_at";
const PROFILE_COLUMNS =
  "id,email,display_name,avatar_object_key,onboarding_completed_at,created_at,updated_at";

export class IOSCloudError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function getEnvValue(env: unknown, name: string) {
  const workerValue = (env as EnvLike | undefined)?.[name];
  if (workerValue) return workerValue;
  return typeof process !== "undefined" ? process.env[name] : undefined;
}

function requireSupabaseConfig(env: unknown) {
  const url = getEnvValue(env, "SUPABASE_URL") || getEnvValue(env, "VITE_SUPABASE_URL");
  const publishableKey =
    getEnvValue(env, "SUPABASE_PUBLISHABLE_KEY") ||
    getEnvValue(env, "VITE_SUPABASE_PUBLISHABLE_KEY");

  if (!url || !publishableKey) {
    throw new IOSCloudError(500, "supabase_not_configured", "云端服务暂时不可用，请稍后再试。");
  }

  return { url, publishableKey };
}

function createRequestClient(env: unknown, accessToken: string) {
  const { url, publishableKey } = requireSupabaseConfig(env);
  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

function randomId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function mediaProxyUrl(requestOrigin: string, objectKey: string | null | undefined) {
  if (!objectKey) return undefined;
  const url = new URL("/api/ios/cloud/media", requestOrigin);
  url.searchParams.set("objectKey", objectKey);
  return url.toString();
}

function requireOwnedObjectKey(user: IOSUser, value: unknown) {
  const objectKey = cleanString(value);
  if (!objectKey) {
    throw new IOSCloudError(400, "missing_media_key", "图片地址已失效，请刷新后再试。");
  }

  if (
    objectKey.startsWith("/") ||
    objectKey.includes("\\") ||
    objectKey.includes("..") ||
    objectKey.includes("//")
  ) {
    throw new IOSCloudError(400, "invalid_media_key", "图片地址格式异常，请刷新后再试。");
  }

  if (!objectKey.startsWith(`${user.id}/`)) {
    throw new IOSCloudError(403, "media_forbidden", "没有权限查看这张图片。");
  }

  return objectKey;
}

function contentTypeForObjectKey(objectKey: string) {
  const lower = objectKey.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  return "image/jpeg";
}

function cleanStringList(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => String(item).trim())
        .filter(Boolean)
        .slice(0, 12)
    : [];
}

function cleanQuiz(value: unknown) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, answer]) => [key, String(answer)])
      .filter(([key, answer]) => key && (answer === "a" || answer === "b")),
  );
}

function fallbackDisplayName(user: IOSUser) {
  return user.email?.split("@")[0] || "喵懂用户";
}

function isoToMs(value: string | null | undefined) {
  const ms = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(ms) ? ms : Date.now();
}

function msToIso(value: unknown) {
  const ms = typeof value === "number" && Number.isFinite(value) ? value : Date.now();
  return new Date(ms).toISOString();
}

function formatTimeLabel(value: string | null | undefined) {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) return "刚刚";
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
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

function decodeDataURL(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) {
    throw new IOSCloudError(400, "invalid_media_data", "媒体读取失败，请换一个文件再试。");
  }

  const mime = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const raw = match[3] ?? "";
  const binary = isBase64 ? atob(raw) : decodeURIComponent(raw);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  if (bytes.byteLength > NEKO_MAX_UPLOAD_BYTES) {
    throw new IOSCloudError(413, "media_too_large", `图片不能超过 ${NEKO_MAX_UPLOAD_LABEL}`);
  }

  return {
    blob: new Blob([bytes], { type: mime }),
    mime,
    extension: extFromMime(mime),
  };
}

async function uploadDataUrl(
  client: SupabaseClient,
  userId: string,
  objectPath: string,
  dataUrl: unknown,
  currentObjectKey?: string | null,
) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    return currentObjectKey ?? undefined;
  }

  const upload = decodeDataURL(dataUrl);
  const objectKey = `${userId}/${objectPath}.${upload.extension}`;
  const { error } = await client.storage.from(NEKO_MEDIA_BUCKET).upload(objectKey, upload.blob, {
    cacheControl: "3600",
    contentType: upload.mime,
    upsert: true,
  });

  if (error) {
    throw new IOSCloudError(500, "storage_upload_failed", error.message);
  }

  return objectKey;
}

function mapProfileRow(row: JsonRecord, user: IOSUser) {
  return {
    id: String(row.id ?? user.id),
    email: typeof row.email === "string" ? row.email : (user.email ?? null),
    displayName:
      typeof row.display_name === "string" ? row.display_name : fallbackDisplayName(user),
  };
}

async function mapCatRow(row: CatRow, requestOrigin: string) {
  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    ageStage: row.age_stage,
    avatarObjectKey: row.avatar_object_key ?? undefined,
    avatarURL: mediaProxyUrl(requestOrigin, row.avatar_object_key),
    updatedAt: row.updated_at ?? undefined,
  };
}

function mapPersonaRow(row: PersonaRow | null | undefined) {
  if (!row) return null;
  return {
    type: row.type,
    mbti: row.mbti,
    matchScore: row.match_score,
    monologue: row.monologue,
    analysis: row.analysis,
    ownerRole: row.owner_role,
    tags: row.tags ?? [],
    traits: row.traits ?? [],
    observations: row.observations ?? [],
    dailyMood: row.daily_mood,
    provider: row.provider ?? "server",
    model: row.model ?? "neko-id-server-persona",
  };
}

async function mapVoiceRow(row: VoiceRow, requestOrigin: string) {
  return {
    cloudId: row.id,
    time: row.local_time_label || formatTimeLabel(row.created_at),
    grad: row.grad || "linear-gradient(135deg, oklch(0.9 0.06 280), oklch(0.92 0.05 320))",
    text: row.text,
    location: row.location ?? undefined,
    tags: row.tags ?? [],
    createdAt: isoToMs(row.created_at),
    mediaObjectKey: row.media_object_key ?? undefined,
    mediaType: row.media_type ?? "photo",
    aspect: row.aspect ?? "3:4",
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
    mediaURL: mediaProxyUrl(requestOrigin, row.media_object_key),
  };
}

async function loadOrCreateProfile(client: SupabaseClient, user: IOSUser) {
  const { data: existing, error: selectError } = await client
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();

  if (selectError) throw new IOSCloudError(500, "profile_load_failed", selectError.message);
  if (existing) return mapProfileRow(existing as JsonRecord, user);

  const { data, error } = await client
    .from("profiles")
    .insert({
      id: user.id,
      email: user.email ?? null,
      display_name: fallbackDisplayName(user),
    })
    .select(PROFILE_COLUMNS)
    .single();

  if (error) throw new IOSCloudError(500, "profile_create_failed", error.message);
  return mapProfileRow(data as JsonRecord, user);
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

  const { data, error: fallbackError } = await client
    .from(table)
    .select("id")
    .eq("user_id", userId)
    .limit(1000);
  if (fallbackError) return 0;
  return data?.length ?? 0;
}

async function fetchAccountSummary(client: SupabaseClient, user: IOSUser) {
  const [profile, catCount, voiceCount] = await Promise.all([
    loadOrCreateProfile(client, user),
    countOwnedRows(client, "cats", user.id),
    countOwnedRows(client, "cat_voices", user.id),
  ]);

  return { profile, catCount, voiceCount };
}

async function fetchActiveCatRow(client: SupabaseClient, user: IOSUser) {
  const { data, error } = await client
    .from("cats")
    .select(CAT_COLUMNS)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new IOSCloudError(500, "cat_load_failed", error.message);
  return data as CatRow | null;
}

async function fetchPersona(client: SupabaseClient, catId: string) {
  const { data, error } = await client
    .from("cat_personas")
    .select(PERSONA_COLUMNS)
    .eq("cat_id", catId)
    .maybeSingle();
  if (error) throw new IOSCloudError(500, "persona_load_failed", error.message);
  return mapPersonaRow(data as PersonaRow | null);
}

async function fetchVoices(
  client: SupabaseClient,
  user: IOSUser,
  catId: string,
  requestOrigin: string,
) {
  const { data, error } = await client
    .from("cat_voices")
    .select(VOICE_COLUMNS)
    .eq("cat_id", catId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw new IOSCloudError(500, "voices_load_failed", error.message);
  return Promise.all(((data ?? []) as VoiceRow[]).map((row) => mapVoiceRow(row, requestOrigin)));
}

async function fetchCloudState(client: SupabaseClient, user: IOSUser, requestOrigin: string) {
  await loadOrCreateProfile(client, user);
  const catRow = await fetchActiveCatRow(client, user);
  if (!catRow) {
    return { profile: null, persona: null, voices: [] };
  }

  const [profile, persona, voices] = await Promise.all([
    mapCatRow(catRow, requestOrigin),
    fetchPersona(client, catRow.id),
    fetchVoices(client, user, catRow.id, requestOrigin),
  ]);

  return { profile, persona, voices };
}

async function markOnboardingCompleted(client: SupabaseClient, user: IOSUser) {
  await loadOrCreateProfile(client, user);
  const { error } = await client
    .from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) throw new IOSCloudError(500, "profile_update_failed", error.message);
}

async function upsertPersona(
  client: SupabaseClient,
  user: IOSUser,
  catId: string,
  persona: unknown,
) {
  if (!persona || typeof persona !== "object") return fetchPersona(client, catId);
  const value = persona as JsonRecord;
  const { data, error } = await client
    .from("cat_personas")
    .upsert(
      {
        cat_id: catId,
        user_id: user.id,
        type: cleanString(value.type, "窗边守望者"),
        mbti: cleanString(value.mbti, "ISFJ-A"),
        match_score: Number(value.matchScore ?? 93),
        monologue: cleanString(value.monologue, "我先观察一下，再决定要不要把小爪爪交给你。"),
        analysis: cleanString(
          value.analysis,
          "它正在用自己的节奏理解世界，也在确认你是可靠的陪伴。",
        ),
        owner_role: cleanString(value.ownerRole, "你是它安心回来的据点。"),
        tags: cleanStringList(value.tags),
        traits: Array.isArray(value.traits) ? value.traits : [],
        observations: Array.isArray(value.observations) ? value.observations : [],
        daily_mood: cleanString(value.dailyMood, "今天好像有点想你"),
        provider: cleanString(value.provider, "ios-native"),
        model: cleanString(value.model, "native-onboarding-v1"),
      },
      { onConflict: "cat_id" },
    )
    .select(PERSONA_COLUMNS)
    .single();

  if (error) throw new IOSCloudError(500, "persona_save_failed", error.message);
  return mapPersonaRow(data as PersonaRow);
}

async function saveCatProfile(
  client: SupabaseClient,
  user: IOSUser,
  body: JsonRecord,
  requestOrigin: string,
) {
  const currentCatId = cleanString(body.currentCatId);

  if (!currentCatId) {
    const existingActiveCat = await fetchActiveCatRow(client, user);
    if (existingActiveCat) {
      const [profile, persona] = await Promise.all([
        mapCatRow(existingActiveCat, requestOrigin),
        fetchPersona(client, existingActiveCat.id),
      ]);

      return { profile, persona };
    }
  }

  const catId = currentCatId || randomId();
  const name = cleanString(body.name, "丸子").slice(0, 40);
  const gender = cleanString(body.gender, "小母猫");
  const ageStage = cleanString(body.ageStage, "青年猫");
  const quiz = cleanQuiz(body.quiz);
  const existing = currentCatId
    ? await client
        .from("cats")
        .select("id,avatar_object_key,quiz")
        .eq("id", currentCatId)
        .eq("user_id", user.id)
        .maybeSingle()
    : null;

  if (existing?.error) throw new IOSCloudError(500, "cat_load_failed", existing.error.message);
  if (currentCatId && !existing?.data) {
    throw new IOSCloudError(404, "cat_not_found", "没有找到这份猫咪档案，请刷新后再试。");
  }

  const existingCat = existing?.data as {
    avatar_object_key?: string | null;
    quiz?: Record<string, string> | null;
  } | null;
  const currentAvatarObjectKey = existingCat?.avatar_object_key ?? null;
  const quizPayload = Object.keys(quiz).length ? quiz : (existingCat?.quiz ?? {});
  const avatarObjectKey = await uploadDataUrl(
    client,
    user.id,
    `cats/${catId}/avatar`,
    body.avatarImageDataUrl,
    currentAvatarObjectKey,
  );

  const { data, error } = await client
    .from("cats")
    .upsert(
      {
        id: catId,
        user_id: user.id,
        name,
        gender,
        age_stage: ageStage,
        avatar_object_key: avatarObjectKey ?? null,
        quiz: quizPayload,
        is_active: true,
      },
      { onConflict: "id" },
    )
    .select(CAT_COLUMNS)
    .single();

  if (error) throw new IOSCloudError(500, "cat_save_failed", error.message);
  if (body.completeOnboarding !== false) {
    await markOnboardingCompleted(client, user);
  }

  const persona = await upsertPersona(client, user, catId, body.persona);
  return {
    profile: await mapCatRow(data as CatRow, requestOrigin),
    persona,
  };
}

async function updateAvatar(
  client: SupabaseClient,
  user: IOSUser,
  body: JsonRecord,
  requestOrigin: string,
) {
  const catId = cleanString(body.catId);
  if (!catId) throw new IOSCloudError(400, "missing_cat_id", "猫咪档案状态异常，请刷新后再试。");

  const { data: existing, error: loadError } = await client
    .from("cats")
    .select("id,avatar_object_key")
    .eq("id", catId)
    .eq("user_id", user.id)
    .single();

  if (loadError) throw new IOSCloudError(404, "cat_not_found", loadError.message);
  const avatarObjectKey = await uploadDataUrl(
    client,
    user.id,
    `cats/${catId}/avatar`,
    body.avatarImageDataUrl,
    (existing as { avatar_object_key?: string | null }).avatar_object_key,
  );

  const { data, error } = await client
    .from("cats")
    .update({ avatar_object_key: avatarObjectKey ?? null })
    .eq("id", catId)
    .eq("user_id", user.id)
    .select(CAT_COLUMNS)
    .single();

  if (error) throw new IOSCloudError(500, "avatar_update_failed", error.message);
  return await mapCatRow(data as CatRow, requestOrigin);
}

async function updateUserProfile(client: SupabaseClient, user: IOSUser, body: JsonRecord) {
  const displayName =
    cleanString(body.displayName, fallbackDisplayName(user)).slice(0, 40) ||
    fallbackDisplayName(user);
  const { data, error } = await client
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email ?? null,
        display_name: displayName,
      },
      { onConflict: "id" },
    )
    .select(PROFILE_COLUMNS)
    .single();

  if (error) throw new IOSCloudError(500, "profile_update_failed", error.message);
  return mapProfileRow(data as JsonRecord, user);
}

async function saveVoice(
  client: SupabaseClient,
  user: IOSUser,
  body: JsonRecord,
  requestOrigin: string,
) {
  const catId = cleanString(body.catId);
  const voice = (body.voice && typeof body.voice === "object" ? body.voice : {}) as JsonRecord;
  const voiceId = cleanString(voice.cloudId) || randomId();
  if (!catId) throw new IOSCloudError(400, "missing_cat_id", "猫咪档案状态异常，请刷新后再试。");
  if (!cleanString(voice.text))
    throw new IOSCloudError(400, "missing_voice_text", "心声内容为空，请重新识别后再试。");

  const mediaObjectKey = await uploadDataUrl(
    client,
    user.id,
    `voices/${voiceId}/media`,
    body.imageDataUrl,
    cleanString(voice.mediaObjectKey),
  );
  const createdAt = msToIso(voice.createdAt);
  const analysis =
    voice.analysis && typeof voice.analysis === "object" ? (voice.analysis as JsonRecord) : {};
  const share = voice.share && typeof voice.share === "object" ? (voice.share as JsonRecord) : {};
  const legacyAnalysis = typeof voice.analysis === "string" ? cleanString(voice.analysis) : "";
  const analysisSummary = cleanString(analysis.observation || analysis.summary);
  const personalityInterpretation = cleanString(analysis.personalityInterpretation);
  const { data, error } = await client
    .from("cat_voices")
    .upsert(
      {
        id: voiceId,
        cat_id: catId,
        user_id: user.id,
        text: cleanString(voice.text),
        analysis:
          legacyAnalysis ||
          [analysisSummary, personalityInterpretation].filter(Boolean).join("\n\n") ||
          null,
        analysis_summary: analysisSummary || null,
        personality_interpretation: personalityInterpretation || null,
        share_headline: cleanString(share.headline) || null,
        share_insight: cleanString(share.insight) || null,
        share_tags: cleanStringList(share.tags),
        location: cleanString(voice.location) || null,
        tags: cleanStringList(voice.tags),
        media_object_key: mediaObjectKey ?? null,
        media_type: cleanString(voice.mediaType, "photo"),
        aspect: cleanString(voice.aspect, "3:4"),
        video_duration: cleanString(voice.videoDuration) || null,
        grad: cleanString(
          voice.grad,
          "linear-gradient(135deg, oklch(0.9 0.06 280), oklch(0.92 0.05 320))",
        ),
        local_time_label: cleanString(voice.time, "刚刚"),
        created_at: createdAt,
      },
      { onConflict: "id" },
    )
    .select(VOICE_COLUMNS)
    .single();

  if (error) throw new IOSCloudError(500, "voice_save_failed", error.message);
  return await mapVoiceRow(data as VoiceRow, requestOrigin);
}

async function deleteVoices(client: SupabaseClient, user: IOSUser, body: JsonRecord) {
  const catId = cleanString(body.catId);
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
  if (!catId) throw new IOSCloudError(400, "missing_cat_id", "猫咪档案状态异常，请刷新后再试。");
  if (!ids.length) return { deleted: 0 };

  const { data: rows, error: loadError } = await client
    .from("cat_voices")
    .select("id,media_object_key")
    .eq("cat_id", catId)
    .eq("user_id", user.id)
    .in("id", ids);

  if (loadError) throw new IOSCloudError(500, "voice_load_failed", loadError.message);
  const mediaKeys = ((rows ?? []) as Array<{ media_object_key?: string | null }>)
    .map((row) => row.media_object_key)
    .filter(Boolean) as string[];

  const { error } = await client
    .from("cat_voices")
    .delete()
    .eq("cat_id", catId)
    .eq("user_id", user.id)
    .in("id", ids);
  if (error) throw new IOSCloudError(500, "voice_delete_failed", error.message);

  if (mediaKeys.length) {
    await client.storage.from(NEKO_MEDIA_BUCKET).remove(mediaKeys);
  }

  return { deleted: ids.length };
}

async function refreshMediaUrl(_client: SupabaseClient, body: JsonRecord, requestOrigin: string) {
  const objectKey = cleanString(body.objectKey);
  return { mediaURL: mediaProxyUrl(requestOrigin, objectKey) };
}

export async function handleIOSCloudMediaRequest(
  request: Request,
  env: unknown,
  accessToken: string,
  user: IOSUser,
) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/ios/cloud/media") return null;

  const objectKey = requireOwnedObjectKey(user, url.searchParams.get("objectKey"));
  const client = createRequestClient(env, accessToken);
  const { data, error } = await client.storage.from(NEKO_MEDIA_BUCKET).download(objectKey);

  if (error || !data) {
    const message = error?.message ?? "Storage object not found";
    const status = /not found|does not exist/i.test(message) ? 404 : 500;
    throw new IOSCloudError(status, "media_download_failed", message);
  }

  const headers = new Headers({
    "access-control-allow-origin": "*",
    "cache-control": "private, max-age=300",
    "content-type": data.type || contentTypeForObjectKey(objectKey),
  });

  if (typeof data.size === "number") {
    headers.set("content-length", String(data.size));
  }

  return new Response(data, { status: 200, headers });
}

export async function handleIOSCloudRequest(
  pathname: string,
  body: unknown,
  env: unknown,
  accessToken: string,
  user: IOSUser,
  requestOrigin: string,
) {
  if (!pathname.startsWith("/api/ios/cloud/")) return null;

  const client = createRequestClient(env, accessToken);
  const payload = (body && typeof body === "object" ? body : {}) as JsonRecord;

  switch (pathname) {
    case "/api/ios/cloud/state":
      return fetchCloudState(client, user, requestOrigin);
    case "/api/ios/cloud/account-summary":
      return fetchAccountSummary(client, user);
    case "/api/ios/cloud/user-profile":
      return updateUserProfile(client, user, payload);
    case "/api/ios/cloud/cat-profile":
      return saveCatProfile(client, user, payload, requestOrigin);
    case "/api/ios/cloud/avatar":
      return updateAvatar(client, user, payload, requestOrigin);
    case "/api/ios/cloud/voices":
      return payload.catId
        ? fetchVoices(client, user, cleanString(payload.catId), requestOrigin)
        : fetchCloudState(client, user, requestOrigin).then((state) => state.voices);
    case "/api/ios/cloud/voice":
      return saveVoice(client, user, payload, requestOrigin);
    case "/api/ios/cloud/voices/delete":
      return deleteVoices(client, user, payload);
    case "/api/ios/cloud/media-url":
      return refreshMediaUrl(client, payload, requestOrigin);
    default:
      return null;
  }
}
