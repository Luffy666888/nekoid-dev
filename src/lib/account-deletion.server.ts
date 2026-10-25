import { createClient } from "@supabase/supabase-js";
import { removeAccountMedia } from "./media-storage.server";

export const ACCOUNT_DELETION_PATH = "/api/ios/cloud/account/delete";
export const ACCOUNT_DELETION_PENDING = "neko_account_deletion_pending";

export class AccountDeletionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function envValue(env: unknown, name: string) {
  return (
    (env as Record<string, string | undefined> | undefined)?.[name] ||
    (typeof process !== "undefined" ? process.env[name] : undefined)
  );
}

// Only the user returned by Auth's /user endpoint may be passed here. Never take
// an account ID, object prefix, or administrator credential from the request body.
export async function deleteCurrentAccount(
  env: unknown,
  accessToken: string,
  user: { id: string },
  body: unknown,
) {
  const payload = body as Record<string, unknown> | null;
  if (!payload || payload.confirmation !== "DELETE" || Object.keys(payload).length !== 1) {
    throw new AccountDeletionError(
      400,
      "deletion_confirmation_required",
      "请确认注销当前账号后再继续。",
    );
  }
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(user.id)) {
    throw new AccountDeletionError(401, "invalid_auth", "登录状态已过期，请重新登录。");
  }
  const url = envValue(env, "SUPABASE_URL") || envValue(env, "VITE_SUPABASE_URL");
  const secret = envValue(env, "SUPABASE_SERVICE_ROLE_KEY") || envValue(env, "SUPABASE_SECRET_KEY");
  if (!url || !secret) {
    throw new AccountDeletionError(
      503,
      "account_deletion_not_configured",
      "账号注销服务尚未启用，请稍后再试。",
    );
  }
  const admin = createClient(url, secret, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });

  // Durable, server-owned flag: stop new writes/media authorizations while a
  // partial deletion is retried. It cannot be set through user_metadata.
  const { error: markError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { [ACCOUNT_DELETION_PENDING]: true },
  });
  if (markError) {
    throw new AccountDeletionError(
      503,
      "account_deletion_unavailable",
      "暂时无法开始注销，请稍后重试。",
    );
  }

  let stage = "media_cleanup";
  try {
    // Delete objects first: Auth refuses to delete owners of Supabase objects.
    // Prefix listing also catches replaced avatars and abandoned uploads.
    await removeAccountMedia(admin, env, user.id);
    for (const [table, ownerColumn] of [
      ["cat_voices", "user_id"],
      ["cat_personas", "user_id"],
      ["cats", "user_id"],
      ["profiles", "id"],
    ]) {
      stage = `data_cleanup_${table}`;
      const { error } = await admin.from(table).delete().eq(ownerColumn, user.id);
      if (error) throw new Error("Account data cleanup failed");
    }
    stage = "session_revocation";
    const { error: signOutError } = await admin.auth.admin.signOut(accessToken, "global");
    // Retrying after a lost response may encounter an already-revoked session.
    if (signOutError && ![401, 403, 404].includes(signOutError.status ?? 0)) {
      throw new Error("Account session revocation failed");
    }
    stage = "auth_deletion";
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id, false);
    if (deleteError) throw new Error("Auth account cleanup failed");
    return { deleted: true };
  } catch {
    console.error("NEKO account deletion incomplete", { stage });
    // Don't remove the durable flag or report success after a partial cleanup.
    // Read-only account screens and this endpoint stay available for retry.
    throw new AccountDeletionError(
      503,
      "account_deletion_incomplete",
      "注销尚未完成，部分数据可能已删除。请保持登录并再次点击注销以完成清理。",
    );
  }
}
