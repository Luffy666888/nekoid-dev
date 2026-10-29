import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(name, internals = []) {
  const filename = new URL(`../src/lib/${name}.ts`, import.meta.url);
  const source = readFileSync(filename, "utf8") + `\nexport { ${internals.join(", ")} };`;
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports,
    require(id) {
      if (id === "./persona-questionnaire") return load("persona-questionnaire");
      if (id === "./voice-analysis") return load("voice-analysis");
      if (id === "@supabase/supabase-js") return require(id);
      if (id === "@/lib/media-storage.server" || id === "@/lib/neko-upload-limits") return {};
      throw new Error(`Unexpected import: ${id}`);
    },
  }, { filename: filename.pathname });
  return exports;
}
const api = load("persona-questionnaire");
const plain = value => JSON.parse(JSON.stringify(value));

test("snapshot parsing distinguishes unknown, invalid, empty and partially answered quizzes", () => {
  for (const input of [null, undefined, [], "a", { 0: "d" }, { bad: "a" }]) {
    assert.equal(api.parseQuestionnaireAnswers(input), null);
  }
  assert.deepEqual(plain(api.parseQuestionnaireAnswers({})), {});
  assert.deepEqual(plain(api.parseQuestionnaireAnswers({ 0: "A", 1: null, 2: "b" })), { 0: "a", 2: "b" });
});

test("storage preserves exact snapshots without debug metadata and never inherits stale inputs", () => {
  const answers = { 0: "a", 4: "c", 7: "b" };
  const stored = plain(api.personaGenerationInputForStorage({ questionnaireAnswers: answers }));
  assert.deepEqual(stored, { questionnaireAnswers: answers });
  assert.deepEqual(plain(api.storedPersonaQuestionnaireAnswers(stored)), answers);
  const legacy = { generation: { rawInputs: { profile: { quiz: answers }, photo: { provided: true } } } };
  assert.deepEqual(plain(api.personaQuestionnaireAnswers(legacy)), answers);
  const cleared = api.personaGenerationInputForStorage({ ...legacy, questionnaireAnswers: {} });
  assert.deepEqual(plain(api.storedPersonaQuestionnaireAnswers(cleared)), {});
  assert.equal(api.personaQuestionnaireAnswers({ ...legacy, questionnaireAnswers: null }), null);
  assert.equal(api.storedPersonaQuestionnaireAnswers(api.personaGenerationInputForStorage({})), null);
});

test("actual iOS save/read mapping round-trips snapshots through the existing JSON column", async () => {
  const cloud = load("ios-cloud.server", ["upsertPersona", "mapPersonaRow", "fetchPersona"]);
  const { createClient } = require("@supabase/supabase-js");
  let stored;
  let reads = 0;
  const client = createClient("https://supabase.test", "test-public-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, init) => {
      const request = new Request(url, init);
      const endpoint = new URL(request.url);
      assert.equal(endpoint.pathname, "/rest/v1/cat_personas");
      assert.ok(endpoint.searchParams.get("select").includes("generation_input"));
      if (request.method === "POST") {
        const payload = await request.json();
        assert.equal(payload.user_id, "test-owner");
        assert.equal(payload.cat_id, "test-cat");
        stored = { ...payload, id: "test-persona" };
        return Response.json(stored);
      }
      reads++;
      assert.equal(endpoint.searchParams.get("cat_id"), "eq.test-cat");
      return Response.json([stored]);
    } },
  });
  for (const answers of [{ 0: "a", 7: "c" }, {}, undefined]) {
    const saved = await cloud.upsertPersona(client, { id: "test-owner" }, "test-cat", { type: "观察型", mbti: "ISFP-A", questionnaireAnswers: answers });
    const restored = await cloud.fetchPersona(client, "test-cat");
    assert.deepEqual(plain(saved).questionnaireAnswers, answers);
    assert.deepEqual(plain(restored).questionnaireAnswers, answers);
    assert.equal("generation_input" in restored, false, "Only answers, not full debug input, may be returned to iOS");
  }
  assert.equal(reads, 3);
  assert.equal(cloud.mapPersonaRow({ ...stored, generation_input: null }).questionnaireAnswers, undefined);
});
