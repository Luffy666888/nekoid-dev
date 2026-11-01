import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { open } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

// Provisioning is deliberately separate from the public login endpoints.
// Dry-run by default. Credentials are written only to an exclusive 0600 file.
export async function provisionReviewLogin(env, { apply = false, existingUserId } = {}) {
  const phone = env.NEKO_REVIEW_LOGIN_PHONE?.trim();
  const code = env.NEKO_REVIEW_LOGIN_CODE?.trim();
  const expiresAt = env.NEKO_REVIEW_LOGIN_EXPIRES_AT?.trim();
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  if (!/^\+861\d{10}$/.test(phone ?? "") || !/^\d{6}$/.test(code ?? "")) {
    throw new Error(
      "Set a single E.164 review phone and a six-digit review code in server environment variables.",
    );
  }
  if (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) {
    throw new Error("Set NEKO_REVIEW_LOGIN_EXPIRES_AT to a future ISO-8601 review deadline.");
  }
  if (!url || !key) throw new Error("Missing server-side Supabase admin configuration.");
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
    },
  });
  let existing = null;
  let complete = false;
  for (let page = 1; page <= 1000; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error(`Cannot inspect Auth users (status ${error.status ?? "unknown"}).`);
    existing = data.users.find((user) => user.phone?.replace(/^\+/, "") === phone.slice(1));
    if (existing || data.users.length < 100) {
      complete = true;
      break;
    }
  }
  if (!complete) throw new Error("Auth user scan incomplete; no changes made.");
  if (
    existing &&
    (existing.role !== "authenticated" || existing.app_metadata?.neko_account_deletion_pending)
  ) {
    throw new Error("Refusing to use a privileged or deletion-pending account for review.");
  }
  const plan = {
    exists: Boolean(existing),
    userId: existing?.id ?? null,
    alreadyMarkedForReview: existing?.app_metadata?.neko_app_review === true,
    expiresAt,
  };
  if (!apply) return { plan };
  // Explicit UUID opt-in prevents an operator from accidentally resetting a real
  // user's password after mistyping the review phone. No business data is touched.
  if (existing && existingUserId !== existing.id) {
    throw new Error(
      "Existing account found. Inspect the dry-run and pass --existing-user-id=<exact UUID> to opt in.",
    );
  }
  if (!existing && existingUserId)
    throw new Error("Expected existing user was not found; no changes made.");
  const password = randomBytes(48).toString("base64url");
  const { data, error } = existing
    ? await client.auth.admin.updateUserById(existing.id, {
        password,
        phone_confirm: true,
        app_metadata: { ...existing.app_metadata, neko_app_review: true },
      })
    : await client.auth.admin.createUser({
        phone,
        password,
        phone_confirm: true,
        app_metadata: { neko_app_review: true },
      });
  if (error || !data.user?.id)
    throw new Error(`Review account provisioning failed (status ${error?.status ?? "unknown"}).`);
  if (
    data.user.phone?.replace(/^\+/, "") !== phone.slice(1) ||
    data.user.role !== "authenticated"
  ) {
    throw new Error("Provisioned identity did not match; do not enable review login.");
  }
  return {
    plan: { ...plan, userId: data.user.id },
    env: {
      // Enable only after testing the provisioned configuration with the server.
      NEKO_REVIEW_LOGIN_ENABLED: "false",
      NEKO_REVIEW_LOGIN_PHONE: phone,
      NEKO_REVIEW_LOGIN_CODE: code,
      NEKO_REVIEW_LOGIN_PASSWORD: password,
      NEKO_REVIEW_LOGIN_USER_ID: data.user.id,
      NEKO_REVIEW_LOGIN_EXPIRES_AT: expiresAt,
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const existingUserId = args.find((arg) => arg.startsWith("--existing-user-id="))?.split("=")[1];
  const output = args.find((arg) => arg.startsWith("--output="))?.slice("--output=".length);
  if (args.some((arg) => arg !== "--apply" && !/^--(?:existing-user-id|output)=/.test(arg))) {
    throw new Error(
      "Use --apply, --existing-user-id=<UUID> and --output=<absolute protected env file>.",
    );
  }
  if (apply && (!output || !isAbsolute(output)))
    throw new Error("--apply requires an absolute --output path.");
  // Reserve output before any mutation and never overwrite an existing secret file.
  const file = apply ? await open(output, "wx", 0o600) : null;
  try {
    const result = await provisionReviewLogin(process.env, { apply, existingUserId });
    if (file) {
      await file.writeFile(
        Object.entries(result.env)
          .map(([key, value]) => `${key}=${value}`)
          .join("\n") + "\n",
      );
    }
    console.log(
      JSON.stringify({
        ...result.plan,
        applied: apply,
        enabled: false,
        output: apply ? output : undefined,
      }),
    );
  } finally {
    await file?.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
