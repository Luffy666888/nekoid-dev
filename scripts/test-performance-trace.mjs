import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";

function loadAPI({ logs = [], authFetch, cloud = () => ({ saved: true }) } = {}) {
  const cache = new Map();
  const load = (name) => {
    if (cache.has(name)) return cache.get(name);
    const exports = {};
    cache.set(name, exports);
    const source = readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8");
    vm.runInNewContext(
      ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      {
        exports,
        crypto: webcrypto,
        performance,
        Request,
        Response,
        URL,
        Error,
        process: { env: {} },
        fetch:
          authFetch ??
          (() => {
            throw new Error("Unexpected network request");
          }),
        console: {
          info(label, json) {
            if (label === "NEKO perf") logs.push(JSON.parse(json));
          },
          error() {},
        },
        require(id) {
          if (id === "./performance-trace") return load("performance-trace");
          if (id === "./catface.functions")
            return { setCatFaceWorkerEnv() {}, detectCatFaceServer: async () => ({ isCat: true }) };
          if (id === "./neko-ai.functions")
            return {
              setNekoAIWorkerEnv() {},
              generateCatPersonaServer: async (_body, trace) => {
                trace.log("persona_test_handler");
                return { mbti: "ISFP-A" };
              },
            };
          if (id === "./ios-auth.server")
            return { IOSAuthError: class extends Error {}, handleIOSAuthRequest: async () => null };
          if (id === "./account-deletion.server")
            return {
              AccountDeletionError: class extends Error {},
              ACCOUNT_DELETION_PATH: "/api/ios/cloud/account/delete",
              ACCOUNT_DELETION_PENDING: "neko_account_deletion_pending",
            };
          if (id === "./ios-cloud.server")
            return { IOSCloudError: class extends Error {}, handleIOSCloudRequest: cloud };
          throw new Error(`Unexpected import ${id}`);
        },
      },
    );
    return exports;
  };
  return { api: load("ios-api.server"), tracing: load("performance-trace"), logs };
}

test("HTTP IDs correlate with generation, duration headers and JSON shape remain compatible", async () => {
  const { api, logs } = loadAPI();
  const requestID = webcrypto.randomUUID();
  const flowID = webcrypto.randomUUID();
  const response = await api.handleIOSAPIRequest(
    new Request("https://neko.test/api/ios/onboarding/persona", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-neko-request-id": requestID,
        "x-neko-flow-id": flowID,
      },
      body: JSON.stringify({
        privateName: "secret-cat",
        privateImage: "base64-secret",
        quiz: { 0: "b" },
      }),
    }),
    {},
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, data: { mbti: "ISFP-A" } });
  assert.equal(response.headers.get("x-neko-request-id"), requestID);
  assert.match(response.headers.get("server-timing"), /^app;dur=\d+$/);
  assert.ok(Number(response.headers.get("x-neko-server-duration-ms")) >= 0);
  assert.ok(logs.every((event) => event.requestId === requestID && event.flowId === flowID));
  assert.ok(logs.some((event) => event.stage === "body_read"));
  assert.ok(logs.some((event) => event.event === "persona_test_handler"));
  assert.equal(logs.at(-1).event, "http_end");
  assert.doesNotMatch(JSON.stringify(logs), /secret-cat|base64-secret|privateName|quiz/);
});

test("old clients, unsafe IDs, invalid JSON and missing authentication all receive bounded diagnostics", async () => {
  const { api, logs } = loadAPI();
  for (const suppliedID of [undefined, "Bearer super-secret", "a".repeat(400)]) {
    const headers = { "content-type": "application/json" };
    if (suppliedID) headers["x-neko-request-id"] = suppliedID;
    const response = await api.handleIOSAPIRequest(
      new Request("https://neko.test/api/ios/onboarding/persona", {
        method: "POST",
        headers,
        body: "not-json",
      }),
      {},
    );
    assert.equal(response.status, 400);
    assert.match(response.headers.get("x-neko-request-id"), /^[\da-f-]{36}$/);
    assert.equal(logs.at(-1).httpStatus, 400);
  }
  const response = await api.handleIOSAPIRequest(
    new Request("https://neko.test/api/ios/cloud/cat-profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
    {},
  );
  assert.equal(response.status, 401);
  assert.ok(logs.some((event) => event.stage === "auth" && event.outcome === "error"));
  assert.doesNotMatch(JSON.stringify(logs), /super-secret|not-json|Bearer/);
});

test("auth and cloud spans preserve the existing verified-user boundary", async () => {
  const token = "private-session-token";
  const { api, logs } = loadAPI({
    authFetch: async (url, init) => {
      assert.equal(url, "https://supabase.test/auth/v1/user");
      assert.equal(init.headers.authorization, `Bearer ${token}`);
      return Response.json({ id: "owner-id", email: "private@example.test" });
    },
    cloud: async (_path, _body, _env, accessToken, user) => {
      assert.equal(accessToken, token);
      assert.equal(user.id, "owner-id");
      return { saved: true };
    },
  });
  const response = await api.handleIOSAPIRequest(
    new Request("https://neko.test/api/ios/cloud/cat-profile", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: "{}",
    }),
    { SUPABASE_URL: "https://supabase.test", SUPABASE_PUBLISHABLE_KEY: "private-config-key" },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(
    logs.filter((event) => event.event === "span_end").map((event) => event.stage),
    ["body_read", "auth", "cloud_operation"],
  );
  assert.doesNotMatch(JSON.stringify(logs), /private|owner-id|supabase\.test|Bearer/);
});

test("classification only emits fixed categories and independent traces never share counters", async () => {
  const { tracing } = loadAPI();
  const cases = [
    ["timeout after 30000ms", "timeout"],
    ["error 429: private", "rate_limited"],
    ["error 503: private", "upstream_5xx"],
    ["fetch failed", "network"],
    ["JSON missing required fields", "validation"],
    ["Gemini response incomplete: MAX_TOKENS", "incomplete_output"],
    ["private arbitrary error", "other"],
  ];
  for (const [message, expected] of cases)
    assert.equal(tracing.performanceErrorCategory(new Error(message)), expected);
  const a = new tracing.PerformanceTrace("persona");
  const b = new tracing.PerformanceTrace("persona");
  a.modelAttempts++;
  assert.notEqual(a.requestId, b.requestId);
  assert.equal(b.modelAttempts, 0);
  await assert.rejects(a.measure("test", () => Promise.reject(new Error("private"))));
});
