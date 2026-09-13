import test from "node:test";
import assert from "node:assert/strict";
import { loadAIServer } from "./bytecat-test-loader.mjs";

const env = {
  AI_PROVIDER: "bytecat",
  AI_REQUIRE_REAL: "true",
  BYTECAT_API_KEY: "test-gpt-key",
  BYTECAT_GEMINI_API_KEY: "test-gemini-key",
  BYTECAT_BASE_URL: "https://gpt.example/v1/",
  BYTECAT_GEMINI_BASE_URL: "https://gemini.example/v1beta/",
  BYTECAT_MODEL: "gpt-5.6-luna",
  BYTECAT_VISION_MODEL: "gpt-5.6-terra",
  BYTECAT_TEXT_FALLBACK_MODELS: "gemini-3.7-flash",
  BYTECAT_VISION_FALLBACK_MODELS: "gemini-3.7-flash",
};
const logger = { info() {}, error() {} };
const imageDataUrl = "data:image/png;base64,aW1hZ2U=";
const geminiResponse = (text, extra = {}) =>
  Response.json({
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ thought: true, text: 'Example {"isCat":true}' }, { text }] },
        ...extra,
      },
    ],
  });

for (const name of ["neko-ai", "catface"]) {
  test(`${name}: ignores Gemini thoughts and rejects empty or truncated output`, () => {
    const api = loadAIServer(name, { internals: ["extractGeminiText"] });
    assert.equal(
      api.extractGeminiText({
        candidates: [
          {
            content: {
              parts: [{ thought: true, text: '{"wrong":true}' }, { text: '{"ok":true}' }],
            },
          },
        ],
      }),
      '{"ok":true}',
    );
    assert.throws(() => api.extractGeminiText({ candidates: [] }), /no answer/);
    assert.throws(
      () =>
        api.extractGeminiText({
          candidates: [{ content: { parts: [{ thought: true, text: "thinking" }] } }],
        }),
      /no answer/,
    );
    assert.throws(
      () =>
        api.extractGeminiText({
          candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{}" }] } }],
        }),
      /incomplete/,
    );
  });
}

test("chat deadline covers the response body after headers arrive", async () => {
  const api = loadAIServer("neko-ai", {
    env: { ...env, BYTECAT_TEXT_TIMEOUT_MS: "25" },
    logger,
    internals: ["callChatCompletion"],
    fetch: async (_url, { signal }) =>
      new Response(
        new ReadableStream({
          start(controller) {
            signal.addEventListener(
              "abort",
              () => controller.error(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          },
        }),
      ),
  });
  await assert.rejects(
    api.callChatCompletion("bytecat", [], { model: "gpt-5.5", modelMode: "text" }),
    /timeout after 25ms/,
  );
});

test("chat timeout switches to Gemini with its own key, native payload and image", async () => {
  const calls = [];
  const api = loadAIServer("neko-ai", {
    env,
    logger,
    internals: ["callFirstAvailableJson"],
    fetch: async (url, init) => {
      calls.push(url);
      if (calls.length === 1) throw new DOMException("Aborted", "AbortError");
      assert.equal(url, "https://gemini.example/v1beta/models/gemini-3.7-flash:generateContent");
      assert.equal(init.headers["x-goog-api-key"], "test-gemini-key");
      assert.equal(init.headers.Authorization, undefined);
      const body = JSON.parse(init.body);
      assert.equal(body.systemInstruction.parts[0].text, "Return JSON");
      assert.equal(body.contents[0].parts[1].inlineData.mimeType, "image/png");
      assert.equal(body.contents[0].parts[1].inlineData.data, "aW1hZ2U=");
      return geminiResponse('{"ok":true}');
    },
  });
  const result = await api.callFirstAvailableJson(
    () => [
      { role: "system", content: "Return JSON" },
      {
        role: "user",
        content: [
          { type: "text", text: "Check image" },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
    { modelMode: "vision" },
  );
  assert.equal(result.model, "gemini-3.7-flash");
  assert.equal(result.parsed.ok, true);
  assert.equal(calls.length, 2);
});

test("cat presence timeout still attempts backup; a real negative stays negative", async () => {
  let calls = 0;
  const api = loadAIServer("catface", {
    env,
    logger,
    fetch: async () => {
      if (++calls === 1) throw new DOMException("Aborted", "AbortError");
      return geminiResponse('{"isCat":false}');
    },
  });
  const result = await api.detectCatFaceServer({ imageDataUrl, mode: "presence" });
  assert.equal(calls, 2);
  assert.equal(result.isCat, false);
  assert.equal(result.reason, undefined);
});

test("invalid detection JSON falls back instead of treating it as no cat", async () => {
  let calls = 0;
  const api = loadAIServer("catface", {
    env,
    logger,
    fetch: async () =>
      ++calls === 1
        ? Response.json({ choices: [{ message: { content: "{}" } }] })
        : geminiResponse('{"isCat":true}'),
  });
  const result = await api.detectCatFaceServer({ imageDataUrl });
  assert.equal(calls, 2);
  assert.equal(result.isCat, true);
});

test("valid JSON with missing business fields attempts the next model", async () => {
  let calls = 0;
  const api = loadAIServer("neko-ai", {
    env,
    logger,
    internals: ["callFirstAvailableJson"],
    fetch: async () =>
      ++calls === 1
        ? Response.json({ choices: [{ message: { content: "{}" } }] })
        : geminiResponse('{"text":"hello","analysis":"photo"}'),
  });
  const result = await api.callFirstAvailableJson(() => [], {
    modelMode: "text",
    validate: (parsed) => typeof parsed.text === "string" && typeof parsed.analysis === "string",
  });
  assert.equal(calls, 2);
  assert.equal(result.model, "gemini-3.7-flash");
});

test("primary deadline is shorter while backups retain their full deadline", async () => {
  const api = loadAIServer("neko-ai", {
    env: { ...env, BYTECAT_PRIMARY_TIMEOUT_MS: "8000", BYTECAT_VISION_TIMEOUT_MS: "22000" },
    internals: ["getChatTimeoutMs"],
  });
  assert.equal(await api.getChatTimeoutMs("bytecat", "vision", undefined, "gpt-5.6-terra"), 8000);
  assert.equal(
    await api.getChatTimeoutMs("bytecat", "vision", undefined, "gemini-3.7-flash"),
    22000,
  );
  const short = loadAIServer("neko-ai", {
    env: { ...env, BYTECAT_PRIMARY_TIMEOUT_MS: "8000", BYTECAT_VISION_TIMEOUT_MS: "1000" },
    internals: ["getChatTimeoutMs"],
  });
  assert.equal(await short.getChatTimeoutMs("bytecat", "vision", undefined, "gpt-5.6-terra"), 1000);
});

test("both text and vision have all four requested backups without duplicates", async () => {
  for (const name of ["catface", "neko-ai"]) {
    const api = loadAIServer(name, { env, internals: ["getProviderModels"] });
    for (const mode of name === "neko-ai" ? ["text", "vision"] : ["vision"]) {
      const models = await api.getProviderModels("bytecat", mode);
      for (const model of ["gpt-5.6-sol", "gpt-5.5", "gemini-3-flash-preview", "gemini-3.7-flash"])
        assert.ok(models.includes(model), `${name} ${mode} ${model}`);
      assert.equal(new Set(models).size, models.length);
    }
  }
});

const mergedProfile = { name: "团子", gender: "小母猫", ageStage: "青年猫", updatedAt: 0 };

test("merged persona preserves four traits and the updated generation settings", async () => {
  let calls = 0;
  const api = loadAIServer("neko-ai", {
    env,
    logger,
    fetch: async (_url, init) => {
      calls++;
      const body = JSON.parse(init.body);
      assert.equal(body.max_tokens, 1000);
      assert.equal(body.temperature, 0.62);
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: "团子",
                type: "谨慎小探长",
                mbti: "INTJ-A",
                matchScore: 88,
                monologue: "让我先看看，再决定要不要靠近。",
                analysis: "它坐着看向镜头，前爪并拢，像是在确认眼前的变化。",
                ownerRole: "如果平时也经常这样，它可能习惯先观察你的反应。",
                tags: ["观察优先", "保留距离", "前爪并拢", "关注镜头", "心动不动", "小小探长"],
                traits: ["观察欲", "边界感", "主人关注度", "行动派程度"].map((label) => ({
                  label,
                  value: 72,
                })),
                observations: [
                  { label: "前爪并拢", value: "可能正在等待" },
                  { label: "看向镜头", value: "注意当前互动" },
                ],
              }),
            },
          },
        ],
      });
    },
  });
  const result = await api.generateCatPersonaServer({ profile: mergedProfile });
  assert.equal(calls, 1);
  assert.equal(result.tags.length, 6);
  assert.equal(result.traits.length, 4);
  assert.equal(result.observations.length, 2);
});

for (const structured of [false, true]) {
  test(`merged voice accepts ${structured ? "structured" : "text"} analysis and produces share fields`, async () => {
    let calls = 0;
    const api = loadAIServer("neko-ai", {
      env,
      logger,
      fetch: async (_url, init) => {
        calls++;
        const body = JSON.parse(init.body);
        assert.equal(body.max_tokens, 620);
        assert.equal(body.temperature, 0.62);
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  text: "你举着那个小方块，我先坐好看看。",
                  subtext: "它没有急着靠近，还在观察眼前的变化。",
                  analysis: structured
                    ? {
                        observation: "前爪并拢，眼睛看向镜头。",
                        personalityInterpretation: "可能习惯先看清楚再行动。",
                      }
                    : "前爪并拢，眼睛看向镜头，可能正在等待熟悉的互动。",
                  mood: "正在观察",
                  tags: ["先看清楚", "端正坐好", "暂不靠近"],
                }),
              },
            },
          ],
        });
      },
    });
    const result = await api.generateCatVoiceServer({
      profile: mergedProfile,
      persona: null,
      imageDataUrl,
    });
    assert.equal(calls, 1);
    assert.ok(result.analysis.observation);
    assert.ok(result.analysis.personalityInterpretation);
    assert.ok(result.share.headline && result.share.insight && result.share.tags.length);
  });
}

test("default generation and detection order tries both Gemini backups before other GPTs", async () => {
  const defaultEnv = {
    ...env,
    BYTECAT_TEXT_FALLBACK_MODELS: "",
    BYTECAT_VISION_FALLBACK_MODELS: "",
  };
  for (const name of ["neko-ai", "catface"]) {
    const api = loadAIServer(name, { env: defaultEnv, internals: ["getProviderModels"] });
    for (const mode of name === "neko-ai" ? ["text", "vision"] : ["vision"]) {
      const models = await api.getProviderModels("bytecat", mode);
      assert.deepEqual(Array.from(models.slice(0, 3)), [
        mode === "text" ? "gpt-5.6-luna" : "gpt-5.6-terra",
        "gemini-3.7-flash",
        "gemini-3-flash-preview",
      ]);
    }
  }
});

const fallbackPersona = {
  name: "团子",
  type: "先看再行动",
  monologue: "让我先坐好看看，再决定要不要靠近。",
  analysis: "前爪并拢，视线停在镜头上，可能还在观察眼前的互动。",
  tags: ["观察优先", "保留距离", "前爪并拢", "关注镜头", "心动不动", "小小探长"],
  traits: ["观察欲", "边界感", "好奇心", "行动力"].map((label) => ({ label, value: 72 })),
  observations: [
    { label: "前爪并拢", value: "可能正在等待" },
    { label: "看向镜头", value: "注意当前互动" },
  ],
};

test("updated persona falls through Terra timeout and incomplete Gemini 3.7 result to Preview", async () => {
  const calls = [];
  const api = loadAIServer("neko-ai", {
    env,
    logger,
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      const model = body.model ?? new URL(url).pathname.split("/").at(-1).split(":")[0];
      calls.push(model);
      if (model === "gpt-5.6-terra") throw new DOMException("Aborted", "AbortError");
      assert.equal(init.headers["x-goog-api-key"], "test-gemini-key");
      assert.equal(body.generationConfig.maxOutputTokens, 2024);
      assert.equal(body.generationConfig.temperature, 0.62);
      if (model === "gemini-3.7-flash")
        return geminiResponse(
          JSON.stringify({ ...fallbackPersona, traits: fallbackPersona.traits.slice(0, 3) }),
        );
      assert.equal(model, "gemini-3-flash-preview");
      return geminiResponse(JSON.stringify(fallbackPersona));
    },
  });
  const result = await api.generateCatPersonaServer({ profile: mergedProfile, imageDataUrl });
  assert.deepEqual(calls, ["gpt-5.6-terra", "gemini-3.7-flash", "gemini-3-flash-preview"]);
  assert.equal(result.traits.length, 4);
  assert.equal(result.tags.length, 6);
});

test("updated voice uses Preview after upstream failure and a thought-only Gemini 3.7 reply", async () => {
  const calls = [];
  const api = loadAIServer("neko-ai", {
    env,
    logger,
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      const model = body.model ?? new URL(url).pathname.split("/").at(-1).split(":")[0];
      calls.push(model);
      if (model === "gpt-5.6-terra")
        return Response.json({ error: "unavailable" }, { status: 503 });
      if (model === "gemini-3.7-flash")
        return Response.json({
          candidates: [
            { content: { parts: [{ thought: true, text: '{"text":"not an answer"}' }] } },
          ],
        });
      assert.equal(model, "gemini-3-flash-preview");
      assert.equal(body.generationConfig.maxOutputTokens, 1644);
      assert.equal(body.generationConfig.temperature, 0.62);
      return geminiResponse(
        JSON.stringify({
          text: "你举着那个小方块，我先坐好看看。",
          analysis: "前爪并拢，眼睛看向镜头，可能正在等待熟悉的互动。",
          subtext: "它还没有急着行动，像是在等你先回应。",
          tags: ["端正坐好", "关注镜头"],
        }),
      );
    },
  });
  const result = await api.generateCatVoiceServer({
    profile: mergedProfile,
    persona: null,
    imageDataUrl,
  });
  assert.deepEqual(calls, ["gpt-5.6-terra", "gemini-3.7-flash", "gemini-3-flash-preview"]);
  assert.ok(result.analysis.observation && result.analysis.personalityInterpretation);
  assert.ok(result.share.headline && result.share.insight && result.share.tags.length);
});

test("cat presence reaches Preview after a primary timeout and Gemini 3.7 rate limit", async () => {
  const calls = [];
  const api = loadAIServer("catface", {
    env,
    logger,
    fetch: async (url, init) => {
      const model =
        JSON.parse(init.body).model ?? new URL(url).pathname.split("/").at(-1).split(":")[0];
      calls.push(model);
      if (model === "gpt-5.6-terra") throw new DOMException("Aborted", "AbortError");
      if (model === "gemini-3.7-flash")
        return Response.json({ error: "rate limited" }, { status: 429 });
      assert.equal(model, "gemini-3-flash-preview");
      return geminiResponse('{"isCat":false}');
    },
  });
  const result = await api.detectCatFaceServer({ imageDataUrl, mode: "presence" });
  assert.deepEqual(calls, ["gpt-5.6-terra", "gemini-3.7-flash", "gemini-3-flash-preview"]);
  assert.equal(result.isCat, false);
  assert.equal(result.reason, undefined);
});
