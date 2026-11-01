import test from "node:test";
import assert from "node:assert/strict";
import { provisionReviewLogin } from "./configure-review-login.mjs";

const userId = "11111111-1111-4111-8111-111111111111";
const phone = "+8613800000000";
const config = {
  SUPABASE_URL: "https://provision.test",
  SUPABASE_SERVICE_ROLE_KEY: "server-admin-test-key",
  NEKO_REVIEW_LOGIN_PHONE: phone,
  NEKO_REVIEW_LOGIN_CODE: "654321",
  NEKO_REVIEW_LOGIN_EXPIRES_AT: "2099-01-01T00:00:00Z",
};

async function withAuth(
  { exists = true, role = "authenticated", pending = false, failUpdate = false } = {},
  run,
) {
  const original = globalThis.fetch;
  const calls = [];
  const user = {
    id: userId,
    phone: phone.slice(1),
    role,
    app_metadata: {
      provider: "phone",
      keep: "unchanged",
      ...(pending ? { neko_account_deletion_pending: true } : {}),
    },
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    const body = init.body ? JSON.parse(init.body) : {};
    assert.equal(new Headers(init.headers).get("apikey"), config.SUPABASE_SERVICE_ROLE_KEY);
    calls.push({ path: url.pathname, method: init.method, body });
    if (init.method === "GET")
      return Response.json({ users: exists ? [user] : [], aud: "authenticated" });
    if (failUpdate) return Response.json({ message: "provider failure" }, { status: 400 });
    assert.equal(url.pathname, exists ? `/auth/v1/admin/users/${userId}` : "/auth/v1/admin/users");
    return Response.json({ ...user, app_metadata: { ...user.app_metadata, ...body.app_metadata } });
  };
  try {
    await run({ calls });
  } finally {
    globalThis.fetch = original;
  }
}

test("provisioning dry-run is read-only and prints no credentials", async () => {
  await withAuth({}, async ({ calls }) => {
    const result = await provisionReviewLogin(config);
    assert.equal(result.plan.userId, userId);
    assert.equal(result.env, undefined);
    assert.ok(calls.every((c) => c.method === "GET"));
    for (const secret of [phone, config.NEKO_REVIEW_LOGIN_CODE, config.SUPABASE_SERVICE_ROLE_KEY]) {
      assert.ok(!JSON.stringify(result).includes(secret));
    }
  });
});

test("an existing account cannot be changed without its explicit UUID", async () => {
  for (const existingUserId of [undefined, "other-user"]) {
    await withAuth({}, async ({ calls }) => {
      await assert.rejects(
        provisionReviewLogin(config, { apply: true, existingUserId }),
        /Existing account found/,
      );
      assert.ok(calls.every((c) => c.method === "GET"));
    });
  }
});

test("opted-in provisioning changes only one identity, preserves metadata and stays disabled", async () => {
  await withAuth({}, async ({ calls }) => {
    const result = await provisionReviewLogin(config, { apply: true, existingUserId: userId });
    assert.equal(calls.length, 2);
    const update = calls[1];
    assert.equal(update.method, "PUT");
    assert.equal(update.body.app_metadata.keep, "unchanged");
    assert.equal(update.body.app_metadata.neko_app_review, true);
    assert.equal(update.body.phone_confirm, true);
    assert.equal(update.body.role, undefined);
    assert.match(update.body.password, /^[A-Za-z0-9_-]{64}$/);
    assert.notEqual(update.body.password, config.NEKO_REVIEW_LOGIN_CODE);
    assert.equal(result.env.NEKO_REVIEW_LOGIN_ENABLED, "false");
    assert.equal(result.env.NEKO_REVIEW_LOGIN_USER_ID, userId);
    assert.equal(result.env.NEKO_REVIEW_LOGIN_PASSWORD, update.body.password);
  });
});

test("new review users are created with confirmed phone and no elevated role", async () => {
  await withAuth({ exists: false }, async ({ calls }) => {
    const result = await provisionReviewLogin(config, { apply: true });
    assert.equal(calls[1].method, "POST");
    assert.equal(calls[1].body.phone, phone);
    assert.equal(calls[1].body.role, undefined);
    assert.equal(result.env.NEKO_REVIEW_LOGIN_USER_ID, userId);
  });
});

test("invalid inputs, elevated or deleting accounts and failed updates cannot enable review login", async () => {
  for (const overrides of [{ role: "service_role" }, { pending: true }]) {
    await withAuth(overrides, async ({ calls }) => {
      await assert.rejects(
        provisionReviewLogin(config, { apply: true, existingUserId: userId }),
        /Refusing/,
      );
      assert.ok(calls.every((c) => c.method === "GET"));
    });
  }
  await withAuth({ failUpdate: true }, async () => {
    await assert.rejects(
      provisionReviewLogin(config, { apply: true, existingUserId: userId }),
      /provisioning failed/,
    );
  });
  await assert.rejects(
    provisionReviewLogin({ ...config, NEKO_REVIEW_LOGIN_PHONE: phone + ",other" }),
    /single E.164/,
  );
  await assert.rejects(
    provisionReviewLogin({ ...config, NEKO_REVIEW_LOGIN_EXPIRES_AT: "2020-01-01" }),
    /future/,
  );
});
