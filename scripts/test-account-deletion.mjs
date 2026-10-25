import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import ts from "typescript";

const require = createRequire(import.meta.url);
const userID = "11111111-1111-4111-8111-111111111111";
const otherID = "22222222-2222-4222-8222-222222222222";
const env = {
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_PUBLISHABLE_KEY: "public-test-key",
  SUPABASE_SERVICE_ROLE_KEY: "private-admin-test-key",
  MEDIA_STORAGE_PROVIDER: "supabase",
};
const pendingFlag = "neko_account_deletion_pending";
const deletionPath = "/api/ios/cloud/account/delete";

// Execute the actual API, SDK, auth/deletion orchestration and storage signing.
// Only network I/O and unrelated AI/RPC handlers are replaced.
function loadServer(request) {
  const modules = new Map();
  const load = (name) => {
    if (modules.has(name)) return modules.get(name);
    const filename = new URL(`../src/lib/${name}.ts`, import.meta.url);
    const source = readFileSync(filename, "utf8");
    const exports = {};
    modules.set(name, exports);
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(
      output,
      {
        exports,
        require(id) {
          if (id === "@supabase/supabase-js") {
            const sdk = require(id);
            return {
              ...sdk,
              createClient: (url, key, options) =>
                sdk.createClient(url, key, {
                  ...options,
                  global: { ...options?.global, fetch: request },
                }),
            };
          }
          if (id === "@/lib/supabase/client") return { NEKO_MEDIA_BUCKET: "neko-media" };
          if (/catface.functions|neko-ai.functions/.test(id)) {
            return { setCatFaceWorkerEnv() {}, setNekoAIWorkerEnv() {} };
          }
          if (id === "./ios-cloud.server") {
            return {
              IOSCloudError: class extends Error {},
              handleIOSCloudRequest: () => ({ readOnly: true }),
            };
          }
          if (id.startsWith("./")) return load(id.slice(2));
          throw new Error(`Unexpected import: ${id}`);
        },
        process: { env: {} },
        fetch: request,
        URL,
        Headers,
        Response,
        Request,
        AbortSignal,
        AbortController,
        TextEncoder,
        Uint8Array,
        ArrayBuffer,
        Blob,
        crypto: webcrypto,
        console: { error() {} },
        Error,
        setTimeout,
        clearTimeout,
      },
      { filename: filename.pathname },
    );
    return exports;
  };
  return { api: load("ios-api.server"), media: load("media-storage.server") };
}

function fixture({ failAt, bucketExists = true } = {}) {
  const calls = [];
  const rows = Object.fromEntries(
    ["cat_voices", "cat_personas", "cats", "profiles"].map((table) => [
      table,
      new Set([userID, otherID]),
    ]),
  );
  const objects = new Set([
    `${userID}/orphan.jpg`,
    `${userID}/cats/cat/avatar.jpg`,
    `${otherID}/keep.jpg`,
  ]);
  const user = { id: userID, app_metadata: {}, user_metadata: { [pendingFlag]: true } };
  let deleted = false;
  let revoked = false;
  const fetch = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body) : {};
    const headers = new Headers(init.headers);
    calls.push({ path: url.pathname, method, body, headers, query: url.searchParams });
    if (url.pathname === "/auth/v1/user") {
      if (deleted || headers.get("authorization") !== "Bearer user-token")
        return Response.json({ message: "not authenticated" }, { status: 401 });
      return Response.json(user);
    }
    if (failAt?.(url.pathname, method))
      return Response.json({ message: "failure", error: "failure" }, { status: 500 });
    if (url.pathname === `/auth/v1/admin/users/${userID}`) {
      assert.equal(headers.get("authorization"), `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`);
      if (method === "PUT") {
        Object.assign(user.app_metadata, body.app_metadata);
        return Response.json({ ...user });
      }
      assert.equal(method, "DELETE");
      assert.equal(body.should_soft_delete, false);
      assert.equal(revoked, true);
      assert.ok(![...objects].some((key) => key.startsWith(`${userID}/`)));
      deleted = true;
      return Response.json({ ...user });
    }
    if (url.pathname === "/auth/v1/logout") {
      assert.equal(url.searchParams.get("scope"), "global");
      revoked = true;
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/storage/v1/bucket/neko-media") {
      return bucketExists
        ? Response.json({ id: "neko-media" })
        : Response.json({ message: "Bucket not found", statusCode: "404" }, { status: 404 });
    }
    if (url.pathname === "/storage/v1/object/list/neko-media") {
      assert.ok(body.prefix === userID || body.prefix.startsWith(`${userID}/`));
      assert.equal(body.offset, 0);
      const items = new Map();
      for (const key of objects) {
        const prefix = `${body.prefix}/`;
        if (!key.startsWith(prefix)) continue;
        const suffix = key.slice(prefix.length);
        const folder = suffix.includes("/");
        const name = suffix.split("/")[0];
        items.set(name, { name, id: folder ? null : key, metadata: folder ? null : {} });
      }
      // Deliberately small pages test deletion without offset skipping.
      return Response.json([...items.values()].slice(0, 1));
    }
    if (url.pathname === "/storage/v1/object/neko-media" && method === "DELETE") {
      for (const key of body.prefixes) {
        assert.ok(key.startsWith(`${userID}/`));
        objects.delete(key);
      }
      return Response.json([]);
    }
    if (url.pathname.startsWith("/rest/v1/") && method === "DELETE") {
      const table = url.pathname.split("/").at(-1);
      assert.equal(url.searchParams.get(table === "profiles" ? "id" : "user_id"), `eq.${userID}`);
      rows[table].delete(userID);
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request ${method} ${url}`);
  };
  return {
    calls,
    rows,
    objects,
    user,
    fetch,
    get deleted() {
      return deleted;
    },
  };
}

function request(path = deletionPath, body = { confirmation: "DELETE" }, token = "user-token") {
  return new Request(`https://api.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("hard-deletes only the authenticated account, clears nested/orphan media and revokes sessions", async () => {
  const state = fixture();
  const { api } = loadServer(state.fetch);
  const response = await api.handleIOSAPIRequest(request(), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, data: { deleted: true } });
  assert.equal(state.deleted, true);
  for (const table of Object.values(state.rows)) assert.deepEqual([...table], [otherID]);
  assert.deepEqual([...state.objects], [`${otherID}/keep.jpg`]);
  const rejected = await api.handleIOSAPIRequest(request("/api/ios/cloud/state", {}), env);
  assert.equal(
    rejected.status,
    401,
    "a still-unexpired JWT cannot access data after Auth deletion",
  );
});

test("missing/wrong authentication, missing confirmation and supplied target IDs perform no writes", async () => {
  for (const [body, token, status] of [
    [{ confirmation: "DELETE" }, null, 401],
    [{ confirmation: "DELETE" }, "forged", 401],
    [{}, "user-token", 400],
    [{ confirmation: true }, "user-token", 400],
    [{ confirmation: "DELETE", userId: otherID }, "user-token", 400],
  ]) {
    const state = fixture();
    const { api } = loadServer(state.fetch);
    assert.equal(
      (await api.handleIOSAPIRequest(request(deletionPath, body, token), env)).status,
      status,
    );
    assert.ok(state.calls.every((call) => call.method === "GET"));
  }
});

test("admin config is server-only and missing key fails before marking or deleting", async () => {
  const state = fixture();
  const { api } = loadServer(state.fetch);
  const response = await api.handleIOSAPIRequest(request(), {
    ...env,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
  });
  assert.equal(response.status, 503);
  assert.ok(state.calls.every((call) => call.method === "GET"));
  assert.ok(!JSON.stringify(await response.json()).includes(env.SUPABASE_SERVICE_ROLE_KEY));
});

test("every cleanup failure stays incomplete and a second request resumes safely", async () => {
  for (const stage of [
    "/storage/v1/bucket/neko-media",
    "/storage/v1/object/list/neko-media",
    "/storage/v1/object/neko-media",
    "/rest/v1/cat_voices",
    "/rest/v1/cat_personas",
    "/rest/v1/cats",
    "/rest/v1/profiles",
    "/auth/v1/logout",
    `/auth/v1/admin/users/${userID}`,
  ]) {
    let failing = true;
    const state = fixture({
      failAt: (path, method) =>
        failing && path === stage && !(path.includes("admin/users") && method === "PUT"),
    });
    const { api } = loadServer(state.fetch);
    const response = await api.handleIOSAPIRequest(request(), env);
    assert.equal(response.status, 503, stage);
    assert.equal((await response.json()).ok, false);
    assert.equal(state.deleted, false);
    assert.equal(state.user.app_metadata[pendingFlag], true);
    failing = false;
    assert.equal((await api.handleIOSAPIRequest(request(), env)).status, 200, `retry ${stage}`);
    assert.equal(state.deleted, true);
    assert.ok(state.objects.has(`${otherID}/keep.jpg`));
  }
});

test("only server app_metadata blocks writes; pending accounts retain the deletion/retry path", async () => {
  const state = fixture();
  const { api } = loadServer(state.fetch);
  const write = () => api.handleIOSAPIRequest(request("/api/ios/cloud/media-upload", {}), env);
  assert.equal((await write()).status, 200, "user_metadata must not authorize state changes");
  state.user.app_metadata[pendingFlag] = true;
  assert.equal((await write()).status, 409);
  assert.equal(
    (await api.handleIOSAPIRequest(request("/api/ios/cloud/account-summary", {}), env)).status,
    200,
  );
  assert.equal((await api.handleIOSAPIRequest(request(), env)).status, 200);
});

const tosEnv = {
  ...env,
  MEDIA_STORAGE_PROVIDER: "tos",
  TOS_ACCESS_KEY_ID: "test-id",
  TOS_SECRET_ACCESS_KEY: "test-secret",
  TOS_BUCKET: "media",
  TOS_REGION: "cn-shanghai",
  TOS_ENDPOINT: "https://tos.test",
};

test("TOS cleans all versions/markers in bounded batches and never deletes another prefix", async () => {
  const objects = Array.from({ length: 13 }, (_, index) => ({
    Key: `${userID}/avatar.jpg`,
    VersionId: index === 0 ? "null" : String(index),
  }));
  const other = { Key: `${otherID}/keep.jpg`, VersionId: "keep" };
  objects.push(other);
  let active = 0;
  let peak = 0;
  const calls = [];
  const { media } = loadServer(async (url, init) => {
    url = new URL(url);
    calls.push({ url, init });
    assert.match(new Headers(init.headers).get("authorization"), /^TOS4-HMAC-SHA256/);
    if (init.method === "GET") {
      assert.equal(url.searchParams.get("prefix"), `${userID}/`);
      assert.equal(url.searchParams.get("versions"), "");
      const owned = objects.filter((obj) => obj !== other);
      return Response.json({
        Versions: owned.slice(0, 5),
        DeleteMarkers: owned.slice(5, 6),
        IsTruncated: owned.length > 6,
      });
    }
    assert.equal(init.method, "DELETE");
    assert.equal(decodeURIComponent(url.pathname), `/${userID}/avatar.jpg`);
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    const index = objects.findIndex((obj) => obj.VersionId === url.searchParams.get("versionId"));
    assert.ok(index >= 0 && objects[index] !== other);
    objects.splice(index, 1);
    active -= 1;
    return new Response(null, { status: 204 });
  });
  const noLegacyBucket = { storage: { getBucket: async () => ({ error: { statusCode: "404" } }) } };
  await media.removeAccountMedia(noLegacyBucket, tosEnv, userID);
  assert.deepEqual(objects, [other]);
  assert.ok(peak <= 4 && peak > 1);
  assert.equal(calls.filter(({ init }) => init.method === "DELETE").length, 13);
});

test("unsafe owners, malformed listings, foreign object keys and storage failures fail closed", async () => {
  for (const listing of [
    { Versions: [{ Key: `${otherID}/foreign`, VersionId: "1" }], IsTruncated: false },
    { Versions: [{ Key: `${userID}/../foreign`, VersionId: "1" }], IsTruncated: false },
    { Versions: [{ Key: `${userID}/avatar` }], IsTruncated: false },
    {},
    { IsTruncated: true },
  ]) {
    let deletes = 0;
    const { media } = loadServer(async (_url, init) => {
      if (init.method === "DELETE") deletes += 1;
      return Response.json(listing);
    });
    await assert.rejects(media.removeAccountMedia({}, tosEnv, userID));
    assert.equal(deletes, 0);
  }
  const { media } = loadServer(() => {
    throw new Error("Must not reach network");
  });
  for (const owner of ["", "/", "../", userID + "/", "*"])
    await assert.rejects(media.removeAccountMedia({}, tosEnv, owner));
});
