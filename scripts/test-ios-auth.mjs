import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
// Synthetic fixtures only; never put real review credentials in the repository.
const phone = "+8613800000000";
const otherPhone = "+8613800000001";
const code = "654321";
const userId = "11111111-1111-4111-8111-111111111111";
const baseEnv = {
  SUPABASE_URL: "https://auth.test",
  SUPABASE_PUBLISHABLE_KEY: "public-test-key",
};
const env = {
  ...baseEnv,
  NEKO_REVIEW_LOGIN_ENABLED: "true",
  NEKO_REVIEW_LOGIN_PHONE: phone,
  NEKO_REVIEW_LOGIN_CODE: code,
  NEKO_REVIEW_LOGIN_PASSWORD: "random-server-only-password-for-tests-42",
  NEKO_REVIEW_LOGIN_USER_ID: userId,
  NEKO_REVIEW_LOGIN_EXPIRES_AT: "2099-01-01T00:00:00Z",
};

function fixture({ mutateUser, authError, pending } = {}) {
  const calls = [];
  const logs = [];
  let now = Date.parse("2026-11-01T00:00:00Z");
  const user = {
    id: userId,
    phone: phone.slice(1),
    role: "authenticated",
    app_metadata: { neko_app_review: true },
  };
  mutateUser?.(user);
  const responseData = {
    access_token: "access-token",
    refresh_token: "refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    user,
  };
  const request = async (input, init = {}) => {
    const url = new URL(input);
    const body = init.body ? JSON.parse(init.body) : {};
    const headers = new Headers(init.headers);
    calls.push({ path: url.pathname, grant: url.searchParams.get("grant_type"), body, headers });
    assert.equal(headers.get("apikey"), baseEnv.SUPABASE_PUBLISHABLE_KEY);
    assert.ok(!url.pathname.includes("/admin/"), "login must never use Auth admin APIs");
    if (pending) await pending;
    if (authError) return Response.json(authError, { status: 400 });
    if (url.pathname === "/auth/v1/otp") return Response.json({});
    return Response.json(responseData);
  };
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(new URL("../src/lib/ios-auth.server.ts", import.meta.url), "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
    ).outputText,
    {
      exports,
      require(id) {
        assert.equal(id, "@supabase/supabase-js");
        const sdk = require(id);
        return {
          createClient: (url, key, options) =>
            sdk.createClient(url, key, {
              ...options,
              global: { fetch: request, ...options?.global },
            }),
        };
      },
      fetch: request,
      process: { env: {} },
      Date: class extends Date {
        static now() {
          return now;
        }
      },
      AbortSignal,
      console: { error: (...args) => logs.push(args) },
    },
  );
  return {
    calls,
    logs,
    advance: (ms) => {
      now += ms;
    },
    send: (number = phone, config = env) =>
      exports.handleIOSAuthRequest("/api/ios/auth/phone-otp", { phone: number }, config),
    verify: (token = code, number = phone, config = env) =>
      exports.handleIOSAuthRequest("/api/ios/auth/phone-verify", { phone: number, token }, config),
    refresh: () =>
      exports.handleIOSAuthRequest(
        "/api/ios/auth/refresh",
        { refreshToken: "existing-refresh-token" },
        env,
      ),
  };
}

const expectCode = (code) => (error) => error.code === code;

test("only the exact normalized review phone skips SMS and gets a real user session", async () => {
  for (const input of [phone, phone.slice(1), phone.slice(3), " +86 138-0000-0000 "]) {
    const f = fixture();
    assert.equal((await f.send(input)).sent, true);
    assert.equal(f.calls.length, 0);
    const session = await f.verify(code, input);
    assert.equal(session.accessToken, "access-token");
    assert.equal(session.refreshToken, "refresh-token");
    assert.equal(session.user.id, userId);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].grant, "password");
    assert.deepEqual(f.calls[0].body, {
      phone,
      password: env.NEKO_REVIEW_LOGIN_PASSWORD,
      gotrue_meta_security: {},
    });
    assert.ok(!JSON.stringify(session).includes(env.NEKO_REVIEW_LOGIN_PASSWORD));
    assert.equal(f.logs.length, 0);
  }
});

test("every other number still sends SMS and verifies with Supabase, even with review code", async () => {
  const f = fixture();
  await f.send(otherPhone);
  await f.verify(code, otherPhone);
  assert.deepEqual(
    f.calls.map((c) => c.path),
    ["/auth/v1/otp", "/auth/v1/verify"],
  );
  assert.equal(f.calls[1].body.phone, otherPhone);
  assert.equal(f.calls[1].body.type, "sms");
  assert.equal(f.calls[1].body.token, code);
});

test("disabled, missing and expired configuration keep normal SMS authentication", async () => {
  for (const config of [
    baseEnv,
    { ...env, NEKO_REVIEW_LOGIN_ENABLED: "false" },
    { ...env, NEKO_REVIEW_LOGIN_EXPIRES_AT: "2026-10-31T23:59:59Z" },
  ]) {
    const f = fixture();
    await f.send(phone, config);
    await f.verify(code, phone, config);
    assert.deepEqual(
      f.calls.map((c) => c.path),
      ["/auth/v1/otp", "/auth/v1/verify"],
    );
  }
});

test("wrong and malformed review codes fail without SMS fallback or password exchange", async () => {
  for (const token of ["000000", "12345", "6543217", null, 654321, ""]) {
    const f = fixture();
    await assert.rejects(f.verify(token), expectCode("invalid_otp"));
    assert.equal(f.calls.length, 0);
  }
});

test("five failed attempts block the account for 15 minutes; requesting a code cannot reset it", async () => {
  const f = fixture();
  for (let i = 0; i < 5; i++) await assert.rejects(f.verify("000000"), expectCode("invalid_otp"));
  await assert.rejects(f.verify(), expectCode("review_login_rate_limited"));
  await assert.rejects(f.send(), expectCode("review_login_rate_limited"));
  assert.equal(f.calls.length, 0);
  f.advance(15 * 60 * 1000);
  assert.equal((await f.verify()).user.id, userId);
});

test("send has a 60-second cooldown and successful login resets failed attempts", async () => {
  const f = fixture();
  await f.send();
  await assert.rejects(f.send(), expectCode("review_login_rate_limited"));
  f.advance(60000);
  await f.send();
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < 4; i++) await assert.rejects(f.verify("000000"));
    await f.verify();
  }
});

test("simultaneous verification cannot bypass the in-flight guard", async () => {
  let release;
  const f = fixture({
    pending: new Promise((resolve) => {
      release = resolve;
    }),
  });
  const first = f.verify();
  await assert.rejects(f.verify(), expectCode("review_login_rate_limited"));
  release();
  await first;
  assert.equal(f.calls.length, 1);
});

test("incomplete active config fails closed only for the configured number", async () => {
  for (const key of [
    "NEKO_REVIEW_LOGIN_CODE",
    "NEKO_REVIEW_LOGIN_PASSWORD",
    "NEKO_REVIEW_LOGIN_USER_ID",
    "NEKO_REVIEW_LOGIN_EXPIRES_AT",
  ]) {
    const f = fixture();
    const config = { ...env, [key]: "" };
    await assert.rejects(f.send(phone, config), expectCode("review_login_not_configured"));
    await assert.rejects(f.verify(code, phone, config), expectCode("review_login_not_configured"));
    await f.send(otherPhone, config);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].path, "/auth/v1/otp");
  }
});

test("a different UUID, phone, elevated role, absent trusted marker or deleted account cannot log in", async () => {
  for (const mutateUser of [
    (u) => {
      u.id = "22222222-2222-4222-8222-222222222222";
    },
    (u) => {
      u.phone = otherPhone.slice(1);
    },
    (u) => {
      u.role = "service_role";
    },
    (u) => {
      u.app_metadata = {};
      u.user_metadata = { neko_app_review: true };
    },
    (u) => {
      u.app_metadata.neko_account_deletion_pending = true;
    },
  ]) {
    const f = fixture({ mutateUser });
    await assert.rejects(f.verify(), expectCode("review_login_unavailable"));
  }
});

test("upstream failures never return a synthetic session or leak credentials into logs", async () => {
  const f = fixture({
    authError: { message: `${phone} ${code} ${env.NEKO_REVIEW_LOGIN_PASSWORD}` },
  });
  await assert.rejects(f.verify(), expectCode("review_login_unavailable"));
  const logs = JSON.stringify(f.logs);
  for (const secret of [phone, code, env.NEKO_REVIEW_LOGIN_PASSWORD])
    assert.ok(!logs.includes(secret));
});

test("refresh continues using the original Supabase refresh flow", async () => {
  const f = fixture();
  const session = await f.refresh();
  assert.equal(session.user.id, userId);
  assert.equal(f.calls[0].grant, "refresh_token");
  assert.equal(f.calls[0].body.refresh_token, "existing-refresh-token");
});
