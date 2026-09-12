import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { loadAIServer } from "./bytecat-test-loader.mjs";

process.loadEnvFile(".env.local");
const models = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["gpt-5.6-sol", "gpt-5.5", "gemini-3-flash-preview", "gemini-3.7-flash"];
const imageDataUrl = `data:image/jpeg;base64,${(await readFile(new URL("./fixtures/bytecat-cat.jpg", import.meta.url))).toString("base64")}`;
const profile = { name: "团子", gender: "小母猫", ageStage: "青年猫", updatedAt: 0 };
const results = [];
const selectedScenarios = process.env.BYTECAT_TEST_SCENARIOS?.split(",");
const logger = { info() {}, error() {} };
for (const model of models) {
  const env = {
    ...process.env,
    AI_PROVIDER: "bytecat",
    AI_REQUIRE_REAL: "true",
    AI_FALLBACK_PROVIDER: "",
    BYTECAT_MODEL: model,
    BYTECAT_VISION_MODEL: model,
    // Measure each backup with its normal deadline, not the shorter primary deadline.
    BYTECAT_PRIMARY_TIMEOUT_MS: "",
  };
  const scenarios = [
    [
      "text",
      "neko-ai",
      async (api) =>
        JSON.parse(
          await api.callChatCompletion(
            "bytecat",
            [{ role: "user", content: '仅返回 JSON：{"ok":true,"message":"备用模型连接成功"}' }],
            { model, modelMode: "text", maxTokens: 320, temperature: 0 },
          ),
        ),
      (result) => assert.equal(result.ok, true),
    ],
    [
      "cat-face",
      "catface",
      (api) => api.detectCatFaceServer({ imageDataUrl, mode: "face" }),
      (result) => {
        assert.equal(result.isCat, true);
        assert.equal(result.reason, undefined);
      },
    ],
    [
      "cat-presence",
      "catface",
      (api) => api.detectCatFaceServer({ imageDataUrl, mode: "presence" }),
      (result) => {
        assert.equal(result.isCat, true);
        assert.equal(result.reason, undefined);
      },
    ],
    [
      "persona",
      "neko-ai",
      (api) => api.generateCatPersonaServer({ profile, imageDataUrl }),
      (result) => {
        assert.equal(result.name, profile.name);
        assert.ok(
          result.tags.length === 6 && result.traits.length === 4 && result.observations.length >= 2,
        );
      },
    ],
    [
      "voice",
      "neko-ai",
      (api) =>
        api.generateCatVoiceServer({
          profile,
          persona: null,
          imageDataUrl,
          scene: "午后坐在家中看向镜头",
        }),
      (result) => {
        assert.ok(
          result.text && result.analysis?.observation && result.analysis?.personalityInterpretation,
        );
        assert.ok(result.share?.headline && result.share?.insight && result.share?.tags.length);
      },
    ],
  ];
  for (const [scenario, moduleName, run, check] of scenarios) {
    if (selectedScenarios && !selectedScenarios.includes(scenario)) continue;
    const requests = [];
    const start = performance.now();
    const api = loadAIServer(moduleName, {
      env,
      logger,
      internals: moduleName === "neko-ai" ? ["callChatCompletion"] : [],
      fetch: async (url, init) => {
        const body = JSON.parse(init.body);
        const requested =
          body.model ??
          decodeURIComponent(new URL(url).pathname.match(/models\/(.*):generateContent/)[1]);
        // A backup must succeed on its own. Never hide its failure behind another model.
        if (requested !== model) throw new Error("Live test forbids another fallback model");
        const request = {
          model: requested,
          endpoint: new URL(url).origin + new URL(url).pathname,
        };
        requests.push(request);
        const response = await fetch(url, init);
        request.status = response.status;
        const payload = await response.clone().json();
        request.finishReason =
          payload.candidates?.[0]?.finishReason ?? payload.choices?.[0]?.finish_reason;
        const answer =
          payload.candidates?.[0]?.content?.parts
            ?.filter((part) => !part.thought)
            .map((part) => part.text ?? "")
            .join("") ?? payload.choices?.[0]?.message?.content;
        request.answerPreview = typeof answer === "string" ? answer.slice(0, 120) : undefined;
        return response;
      },
    });
    let record;
    try {
      const result = await run(api);
      check(result);
      assert.equal(requests.length, 1);
      record = {
        model,
        scenario,
        ok: true,
        seconds: Number(((performance.now() - start) / 1000).toFixed(2)),
        result: Object.fromEntries(Object.entries(result).filter(([key]) => key !== "media")),
        requests,
      };
    } catch (error) {
      record = {
        model,
        scenario,
        ok: false,
        seconds: Number(((performance.now() - start) / 1000).toFixed(2)),
        error: error.message,
        requests,
      };
    }
    results.push(record);
    console.log(JSON.stringify(record));
  }
}
await mkdir("logs", { recursive: true });
await writeFile(
  process.env.BYTECAT_TEST_REPORT || "logs/bytecat-live-results.json",
  JSON.stringify({ testedAt: new Date().toISOString(), results }, null, 2),
);
if (results.some((result) => !result.ok)) process.exitCode = 1;
