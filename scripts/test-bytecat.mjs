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

test("prompt debug logs redact image data urls", async () => {
  const infos = [];
  const api = loadAIServer("neko-ai", {
    env: { ...env, NEKO_AI_DEBUG_PROMPTS: "true" },
    logger: {
      info(...args) {
        infos.push(args.join(" "));
      },
      error() {},
    },
    internals: ["callChatCompletion"],
    fetch: async (_url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.messages[1].content[1].image_url.url, imageDataUrl);
      return Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });
    },
  });

  await api.callChatCompletion(
    "bytecat",
    [
      { role: "system", content: "Return JSON" },
      {
        role: "user",
        content: [
          { type: "text", text: "Check image" },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
    { model: "gpt-5.6-terra", modelMode: "vision" },
  );

  const debugLog = infos.find((entry) => entry.includes("NEKO AI prompt debug"));
  assert.ok(debugLog);
  assert.match(debugLog, /data:image\/png;base64,<redacted \d+ chars>/);
  assert.equal(debugLog.includes("aW1hZ2U="), false);
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
const forbiddenNekoCopy = [
  "仪式感",
  "施压",
  "掌控节奏",
  "节奏掌控",
  "秩序感",
  "克制讨关注",
  "高度敏锐",
  "策略性靠近",
  "精准表达",
  "端庄定点",
  "稳态陪伴",
  "低频高质",
  "眼神催促",
  "眼神施压",
];

function assertPlainNekoCopy(values) {
  for (const value of values.filter(Boolean)) {
    for (const forbidden of forbiddenNekoCopy) {
      assert.equal(
        String(value).includes(forbidden),
        false,
        `${value} should not contain ${forbidden}`,
      );
    }
  }
}

const personaStage1Fixture = {
  behaviorProfile: {
    sociability: 64,
    curiosity: 72,
    caution: 66,
    attachmentExpression: 61,
    independence: 56,
    boundary: 68,
    environmentalSensitivity: 54,
    interactionPreference: 63,
  },
  coreTraits: [
    {
      trait: "先观察再靠近",
      description: "它遇到新互动时会先看清楚，再决定要不要靠近。",
      supportedBy: ["Q0:a", "Q1:a"],
      confidence: 0.86,
    },
    {
      trait: "靠近有分寸",
      description: "它愿意参与互动，但会保留一点自己的节奏和距离。",
      supportedBy: ["Q3:b", "Q5:a"],
      confidence: 0.82,
    },
    {
      trait: "关注主人",
      description: "它会把注意力放在主人附近，用观察表达亲近。",
      supportedBy: ["Q2:b", "Q6:a"],
      confidence: 0.8,
    },
    {
      trait: "好奇但不冒进",
      description: "它会对目标保持兴趣，不过更习惯先确认再行动。",
      supportedBy: ["Q1:a", "Q4:b"],
      confidence: 0.78,
    },
  ],
  unsupportedClaims: [],
};

const personaStage2Fixture = {
  misunderstanding: {
    claim: "它不是没兴趣",
    explanation: "它安静看着时不一定是在走神，更多是在确认眼前互动是否适合靠近。",
    supportedBy: ["trait:先观察再靠近"],
    confidence: 0.84,
  },
  affection: {
    claim: "它用关注表达亲近",
    explanation: "它表达喜欢不一定靠一直贴着你，更像是把注意力放在你身上再慢慢回应。",
    supportedBy: ["trait:关注主人"],
    confidence: 0.82,
  },
  ownerRelationship: {
    claim: "你是它放心观察的人",
    explanation: "你在它眼里像一个稳定参照，它会保留节奏，也愿意在你附近确认变化。",
    supportedBy: ["trait:靠近有分寸"],
    confidence: 0.81,
  },
};

const personaStage3Fixture = {
  persona: {
    personaTitle: "会先看清楚",
    mbti: "INTJ-A",
    summary: "它习惯先看清楚眼前变化，再按自己的节奏靠近互动。",
  },
  insights: {
    misunderstanding: {
      title: "你可能一直误会它的一件事",
      conclusion: "它不是对互动没兴趣，只是常常先停下来确认，再决定要不要靠近。",
    },
    affection: {
      title: "它表达喜欢的方式",
      conclusion: "它表达喜欢不一定靠一直贴着你，更像是把注意力放在你身上再慢慢回应。",
    },
    relationship: {
      title: "在它眼里，你的位置",
      conclusion: "你像它可以放心观察的参照，它会保留自己的节奏，也愿意在你附近。",
    },
  },
  bondSummary: {
    title: "团子和你的关系",
    quote: "你是它可以放心观察，也愿意回到附近的人。",
  },
};

function canonicalPersonaResult(api) {
  return {
    ...structuredClone(personaStage3Fixture),
    dimensions: api.personaDimensionsFromBehavior(personaStage1Fixture.behaviorProfile),
  };
}

test("persona result protocol accepts the complete canonical result", () => {
  const api = loadAIServer("neko-ai", {
    internals: ["validatePersonaResultProtocol", "personaDimensionsFromBehavior"],
  });
  assert.equal(api.validatePersonaResultProtocol(canonicalPersonaResult(api)), true);
});

test("persona result protocol rejects missing, duplicate and invalid dimensions", () => {
  const api = loadAIServer("neko-ai", {
    internals: ["validatePersonaResultProtocol", "personaDimensionsFromBehavior"],
  });
  const missing = canonicalPersonaResult(api);
  missing.dimensions.pop();
  assert.equal(api.validatePersonaResultProtocol(missing), false);

  const duplicate = canonicalPersonaResult(api);
  duplicate.dimensions[3] = structuredClone(duplicate.dimensions[0]);
  assert.equal(api.validatePersonaResultProtocol(duplicate), false);

  const invalidDirection = canonicalPersonaResult(api);
  invalidDirection.dimensions[0].direction = "mostly_left";
  assert.equal(api.validatePersonaResultProtocol(invalidDirection), false);

  const invalidStrength = canonicalPersonaResult(api);
  invalidStrength.dimensions[0].strength = "very_strong";
  assert.equal(api.validatePersonaResultProtocol(invalidStrength), false);
});

test("persona result protocol rejects missing insights, missing bond and excess copy", () => {
  const api = loadAIServer("neko-ai", {
    internals: ["validatePersonaResultProtocol", "personaDimensionsFromBehavior"],
  });
  const missingInsight = canonicalPersonaResult(api);
  delete missingInsight.insights.affection;
  assert.equal(api.validatePersonaResultProtocol(missingInsight), false);

  const missingBond = canonicalPersonaResult(api);
  delete missingBond.bondSummary;
  assert.equal(api.validatePersonaResultProtocol(missingBond), false);

  const longTitle = canonicalPersonaResult(api);
  longTitle.persona.personaTitle = "这是一个明显超过十四个中文字符的人格标题";
  assert.equal(api.validatePersonaResultProtocol(longTitle), false);

  const longSummary = canonicalPersonaResult(api);
  longSummary.persona.summary = "它".repeat(51);
  assert.equal(api.validatePersonaResultProtocol(longSummary), false);

  const longInsight = canonicalPersonaResult(api);
  longInsight.insights.relationship.conclusion = "它".repeat(61);
  assert.equal(api.validatePersonaResultProtocol(longInsight), false);

  const longQuote = canonicalPersonaResult(api);
  longQuote.bondSummary.quote = "它".repeat(41);
  assert.equal(api.validatePersonaResultProtocol(longQuote), false);
});

test("persona result protocol rejects provider extra fields", () => {
  const api = loadAIServer("neko-ai", {
    internals: ["validatePersonaResultProtocol", "personaDimensionsFromBehavior"],
  });
  const extra = canonicalPersonaResult(api);
  extra.providerNote = "unexpected";
  assert.equal(api.validatePersonaResultProtocol(extra), false);
});

test("insufficient evidence maps to conservative center and weak dimensions", () => {
  const api = loadAIServer("neko-ai", {
    internals: ["validatePersonaResultProtocol", "personaDimensionsFromBehavior"],
  });
  const neutral = api.personaDimensionsFromBehavior({
    sociability: 50,
    curiosity: 50,
    caution: 50,
    attachmentExpression: 50,
    independence: 50,
    boundary: 50,
    environmentalSensitivity: 50,
    interactionPreference: 50,
  });
  assert.deepEqual(
    Array.from(neutral, (dimension) => [dimension.direction, dimension.strength]),
    Array(4).fill(["center", "weak"]),
  );
});

test("invalid persona result retries and recovers on the next provider", async () => {
  let calls = 0;
  const validatingApi = loadAIServer("neko-ai", {
    env,
    logger,
    internals: [
      "callFirstAvailableJson",
      "validatePersonaResultProtocol",
      "personaDimensionsFromBehavior",
    ],
    fetch: async () => {
      calls++;
      const valid = canonicalPersonaResult(validatingApi);
      const payload = calls === 1 ? { ...valid, dimensions: valid.dimensions.slice(0, 3) } : valid;
      return calls === 1
        ? Response.json({ choices: [{ message: { content: JSON.stringify(payload) } }] })
        : geminiResponse(JSON.stringify(payload));
    },
  });
  const result = await validatingApi.callFirstAvailableJson(
    () => [
      { role: "system", content: "Return JSON" },
      { role: "user", content: "Generate persona" },
    ],
    { modelMode: "text", validate: validatingApi.validatePersonaResultProtocol },
  );
  assert.equal(calls, 2);
  assert.equal(validatingApi.validatePersonaResultProtocol(result.parsed), true);
  assert.equal(result.model, "gemini-3.7-flash");
});

function promptTextFromBody(body) {
  const content = body.messages?.[1]?.content;
  return Array.isArray(content) ? (content[0]?.text ?? "") : String(content ?? "");
}

function personaPipelineFixtureForPrompt(prompt) {
  if (prompt.includes("Stage 3")) return personaStage3Fixture;
  if (prompt.includes("Stage 2")) return personaStage2Fixture;
  if (prompt.includes("Stage 1")) return personaStage1Fixture;
  throw new Error(`Unknown persona pipeline prompt: ${prompt.slice(0, 80)}`);
}

test("video clip analysis sends extracted frames and returns structured observation", async () => {
  let calls = 0;
  const api = loadAIServer("neko-ai", {
    env,
    logger,
    fetch: async (_url, init) => {
      calls++;
      const body = JSON.parse(init.body);
      assert.equal(body.model, "gpt-5.6-terra");
      assert.equal(body.max_tokens, 720);
      assert.equal(body.temperature, 0.45);
      const content = body.messages[1].content;
      assert.equal(content.filter((part) => part.type === "image_url").length, 3);
      assert.ok(content[0].text.includes("抽帧顺序"));
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                clipId: "clip-1",
                label: "玩耍",
                duration: "00:08",
                containsCat: true,
                summary: "它先盯着玩具看了一会，后面身体有准备靠近的趋势。",
                movement: "从停住观察到身体微微前移，像是在评估要不要出爪。",
                behaviorSignals: ["盯着玩具", "先看再动", "准备靠近"],
                personalityEvidence: [
                  {
                    fact: "前后帧里注意力持续放在同一个目标上。",
                    interpretation: "说明它不是随便路过，而是在观察后决定动作。",
                  },
                ],
                confidence: "high",
              }),
            },
          },
        ],
      });
    },
  });
  const result = await api.analyzeCatVideoClipServer({
    profile: mergedProfile,
    clipId: "clip-1",
    label: "玩耍",
    duration: "00:08",
    frames: [
      { imageDataUrl, timestampLabel: "00:01", position: "start" },
      { imageDataUrl, timestampLabel: "00:04", position: "middle" },
      { imageDataUrl, timestampLabel: "00:07", position: "end" },
    ],
  });
  assert.equal(calls, 1);
  assert.equal(result.containsCat, true);
  assert.equal(result.confidence, "high");
  assert.deepEqual(Array.from(result.behaviorSignals), ["盯着玩具", "先看再动", "准备靠近"]);
  assert.equal(result.personalityEvidence.length, 1);
});

test("merged persona preserves four traits and the updated generation settings", async () => {
  let calls = 0;
  const api = loadAIServer("neko-ai", {
    env,
    logger,
    fetch: async (_url, init) => {
      calls++;
      const body = JSON.parse(init.body);
      if (calls === 1) {
        assert.equal(body.max_tokens, 1200);
        assert.equal(body.temperature, 0.12);
      } else if (calls === 2) {
        assert.equal(body.max_tokens, 820);
        assert.equal(body.temperature, 0.42);
      } else {
        assert.equal(body.max_tokens, 920);
        assert.equal(body.temperature, 0.5);
      }
      const stage1 = {
        behaviorProfile: {
          sociability: 62,
          curiosity: 70,
          caution: 76,
          attachmentExpression: 68,
          independence: 62,
          boundary: 72,
          environmentalSensitivity: 74,
          interactionPreference: 58,
        },
        coreTraits: [
          {
            trait: "好奇但谨慎",
            description: "它对变化有兴趣，但通常先确认安全再靠近。",
            supportedBy: ["Q2:B", "Q5:A"],
            confidence: 0.84,
          },
          {
            trait: "亲近但有边界",
            description: "它在意主人，也希望自己决定互动距离。",
            supportedBy: ["Q6:A", "Q8:C"],
            confidence: 0.82,
          },
        ],
        unsupportedClaims: [],
      };
      const stage2 = {
        misunderstanding: {
          claim: "它不是没兴趣，只是在先看清楚。",
          explanation: "它坐着不动时，注意力可能已经放在眼前，只是要先确认节奏，再决定要不要靠近。",
          supportedBy: ["trait:好奇但谨慎", "Q2:B"],
          confidence: 0.82,
        },
        affection: {
          claim: "它表达喜欢时，会靠近你但保留边界。",
          explanation: "它可能会待在你附近、看你的反应，但接触多久和距离多近，更想由自己决定。",
          supportedBy: ["trait:亲近但有边界", "Q8:C"],
          confidence: 0.82,
        },
        ownerRelationship: {
          claim: "你是它可以安心观察的人。",
          explanation: "你不一定是它时时刻刻黏住的人，但很可能是它会确认、也愿意回到附近的人。",
          supportedBy: ["trait:亲近但有边界"],
          confidence: 0.78,
        },
      };
      const stage3 = {
        persona: {
          personaTitle: "谨慎小探长",
          mbti: "INTJ-A",
          summary: "它习惯先确认情况，再按自己的节奏靠近。",
        },
        insights: {
          misunderstanding: { title: "你可能一直误会它的一件事", conclusion: "它不是不想参与，只是习惯先把局面看明白；坐着不动时，注意力可能早已放在眼前。" },
          affection: { title: "它表达喜欢的方式", conclusion: "如果它平时也经常这样，它可能更习惯把你放在视线里，用关注而不是紧贴表达亲近。" },
          relationship: { title: "在它眼里，你的位置", conclusion: "你可能不是它时时刻刻都要黏着的人，但很可能是它默认会在、可以放心观察周围的人。" },
        },
        bondSummary: { title: "团子和你的关系", quote: "你是它可以放心观察，也愿意回到附近的人。" },
      };
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify(calls === 1 ? stage1 : calls === 2 ? stage2 : stage3),
            },
          },
        ],
      });
    },
  });
  const result = await api.generateCatPersonaServer({ profile: mergedProfile });
  assert.equal(calls, 3);
  assert.equal(result.type, "先看再行动");
  assert.deepEqual(Array.from(result.tags), [
    "先观察再靠近",
    "边界感强",
    "喜欢待在附近",
    "不爱强抱",
  ]);
  assert.equal(result.tags.length, 4);
  assert.equal(result.traits.length, 4);
  assert.ok(result.evidence.length >= 2);
  assertPlainNekoCopy([result.type, ...result.tags, result.analysis, result.corePersonality]);
});

test("persona uses video observations as text and does not resend video frames", async () => {
  let calls = 0;
  const api = loadAIServer("neko-ai", {
    env,
    logger,
    fetch: async (_url, init) => {
      calls++;
      const body = JSON.parse(init.body);
      if (calls === 1) {
        const content = body.messages[1].content;
        assert.equal(content.filter((part) => part.type === "image_url").length, 1);
        assert.ok(content[0].text.includes("结构化视频观察"));
        assert.ok(content[0].text.includes("盯着玩具"));
      }
      const stage1 = {
        behaviorProfile: {
          sociability: 56,
          curiosity: 76,
          caution: 72,
          attachmentExpression: 62,
          independence: 60,
          boundary: 68,
          environmentalSensitivity: 70,
          interactionPreference: 58,
        },
        coreTraits: [
          {
            trait: "视频里也会先观察",
            description: "视频线索显示它会把注意力放在目标上，再慢慢决定动作。",
            supportedBy: ["video:clip-1", "Q2:B"],
            confidence: 0.78,
          },
          {
            trait: "好奇但谨慎",
            description: "它对目标有兴趣，但会先确认再靠近。",
            supportedBy: ["Q2:B", "Q5:A"],
            confidence: 0.82,
          },
        ],
        unsupportedClaims: [],
      };
      const stage2 = {
        misunderstanding: {
          claim: "它不是对互动没兴趣。",
          explanation: "它常常先停下来观察，确认安全和节奏后，才会把注意力真正放出来。",
          supportedBy: ["trait:视频里也会先观察"],
          confidence: 0.78,
        },
        affection: {
          claim: "它表达亲近时，会先把注意力放在你和互动上。",
          explanation: "它表达亲近不一定靠一直贴着你，更像是先观察互动，等时机合适再靠近。",
          supportedBy: ["trait:好奇但谨慎"],
          confidence: 0.76,
        },
        ownerRelationship: {
          claim: "你是能让它安心观察的人。",
          explanation:
            "你对它来说可能是那个可以让它安心观察的人，它会保留自己的节奏，也会回应你制造的小互动。",
          supportedBy: ["trait:视频里也会先观察"],
          confidence: 0.74,
        },
      };
      const stage3 = {
        persona: {
          personaTitle: "先看再动",
          mbti: "INFP-A",
          summary: "它遇到想玩的东西时，会先看清楚再行动。",
        },
        insights: {
          misunderstanding: { title: "你可能一直误会它的一件事", conclusion: "它不是对互动没兴趣，只是常常先停下来观察，确认安全和节奏后才会把注意力真正放出来。" },
          affection: { title: "它表达喜欢的方式", conclusion: "它表达亲近不一定靠一直贴着你，更像是把注意力放在你和眼前互动上，等时机合适再靠近。" },
          relationship: { title: "在它眼里，你的位置", conclusion: "你对它来说可能是那个可以让它安心观察的人，它会保留自己的节奏，但也会回应你制造的小互动。" },
        },
        bondSummary: { title: "团子和你的关系", quote: "你是它可以安心观察，也愿意回应互动的人。" },
      };
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify(calls === 1 ? stage1 : calls === 2 ? stage2 : stage3),
            },
          },
        ],
      });
    },
  });
  const result = await api.generateCatPersonaServer({
    profile: mergedProfile,
    imageDataUrl,
    videoObservations: [
      {
        clipId: "clip-1",
        label: "玩耍",
        duration: "00:08",
        containsCat: true,
        summary: "它先盯着玩具看了一会，后面身体有准备靠近的趋势。",
        movement: "从停住观察到身体微微前移，像是在评估要不要出爪。",
        behaviorSignals: ["盯着玩具", "先看再动", "准备靠近"],
        personalityEvidence: [
          {
            fact: "前后帧里注意力持续放在同一个目标上。",
            interpretation: "说明它是在观察后决定动作。",
          },
        ],
        confidence: "high",
      },
    ],
  });
  assert.equal(calls, 3);
  assert.equal(result.type, "先看再行动");
  assert.ok(result.evidence.length >= 2);
});

test("persona drift check keeps 六六 stable across five same-input runs", async () => {
  let stage3Calls = 0;
  const liuliuProfile = {
    ...mergedProfile,
    name: "六六",
    quiz: {
      0: "b",
      1: "a",
      2: "b",
      3: "a",
      4: "b",
      5: "a",
      6: "b",
      7: "a",
    },
  };
  const stableStage1 = {
    behaviorProfile: {
      sociability: 58,
      curiosity: 68,
      caution: 72,
      attachmentExpression: 66,
      independence: 60,
      boundary: 70,
      environmentalSensitivity: 71,
      interactionPreference: 59,
    },
    coreTraits: [
      {
        trait: "亲近但有边界",
        description: "它在意和人的关系，同时希望自己决定靠近和接触的距离。",
        supportedBy: ["Q3:A", "Q6:B"],
        confidence: 0.84,
      },
      {
        trait: "先观察再行动",
        description: "遇到变化或互动时，它更习惯先看清楚，再决定下一步。",
        supportedBy: ["Q1:A", "Q4:B"],
        confidence: 0.82,
      },
    ],
    unsupportedClaims: [],
  };
  const stableStage2 = {
    misunderstanding: {
      claim: "它不是不亲人，只是需要自己决定距离。",
      explanation: "它愿意靠近你，但不一定喜欢被持续抱住。能自己决定距离，对它也是信任的一部分。",
      supportedBy: ["trait:亲近但有边界"],
      confidence: 0.82,
    },
    affection: {
      claim: "它会靠近你，也保留一点自己的边界。",
      explanation: "它可能会待在你附近、看你的反应；接触多久、距离多近，它更想自己决定。",
      supportedBy: ["trait:亲近但有边界"],
      confidence: 0.82,
    },
    ownerRelationship: {
      claim: "你是它可以放心靠近的人。",
      explanation: "你不一定是它时时刻刻黏住的人，但很可能是它愿意回到附近的人。",
      supportedBy: ["trait:先观察再行动"],
      confidence: 0.8,
    },
  };
  const driftingStage3 = [
    {
      personaTitle: "边界感亲近派",
      mbti: "INFJ-A",
      tags: ["边界感强", "喜欢待在附近", "先观察再靠近", "不爱强抱"],
    },
    {
      personaTitle: "好奇谨慎型",
      mbti: "ENFP-A",
      tags: ["对新东西好奇", "会先看清楚", "主动靠近", "表达得很清楚"],
    },
    {
      personaTitle: "热情有分寸型",
      mbti: "ENTP-A",
      tags: ["喜欢互动", "主动靠近", "熟了会更黏", "看着镜头"],
    },
    {
      personaTitle: "慢热观察型",
      mbti: "ISFP-T",
      tags: ["先不靠近", "安静坐着", "会先看清楚", "想靠近又犹豫"],
    },
    {
      personaTitle: "主动亲近型",
      mbti: "ESFJ-A",
      tags: ["主动靠近", "喜欢找你玩", "表达得很清楚", "喜欢互动"],
    },
  ];
  const api = loadAIServer("neko-ai", {
    env: { ...env, NEKO_PERSONA_DEBUG: "true" },
    logger,
    fetch: async (_url, init) => {
      const body = JSON.parse(init.body);
      const prompt = promptTextFromBody(body);
      if (prompt.includes("Stage 3")) {
        const variant = driftingStage3[Math.min(stage3Calls, driftingStage3.length - 1)];
        stage3Calls++;
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  persona: {
                    personaTitle: variant.personaTitle,
                    mbti: variant.mbti,
                    summary: "它愿意靠近熟悉的人，也希望自己决定互动距离。",
                  },
                  insights: {
                    misunderstanding: { title: "你可能一直误会它的一件事", conclusion: "它不是不亲人，只是更希望自己决定距离；靠近你和保留边界可以同时存在。" },
                    affection: { title: "它表达喜欢的方式", conclusion: "它表达喜欢时，会待在你附近看你的反应，也会选择自己舒服的接触方式。" },
                    relationship: { title: "在它眼里，你的位置", conclusion: "你像一个让它安心的人，它愿意回到你附近，也希望你尊重它的节奏。" },
                  },
                  bondSummary: { title: "六六和你的关系", quote: "你是它愿意靠近，也能尊重它节奏的人。" },
                }),
              },
            },
          ],
        });
      }
      if (prompt.includes("Stage 2")) {
        return Response.json({ choices: [{ message: { content: JSON.stringify(stableStage2) } }] });
      }
      if (prompt.includes("Stage 1")) {
        assert.equal(body.temperature, 0.12);
        return Response.json({ choices: [{ message: { content: JSON.stringify(stableStage1) } }] });
      }
      throw new Error(`Unknown persona prompt: ${prompt.slice(0, 80)}`);
    },
  });

  const results = [];
  let previousPersona = null;
  for (let index = 0; index < 5; index++) {
    const result = await api.generateCatPersonaServer({
      profile: liuliuProfile,
      previousPersona,
    });
    results.push(result);
    previousPersona = result;
  }

  assert.equal(stage3Calls, 5);
  assert.equal(new Set(results.map((result) => result.type)).size, 1);
  assert.equal(new Set(results.map((result) => result.mbti)).size, 1);
  assert.ok(results.every((result) => result.tags.slice(0, 3).includes("边界感强")));
  for (const result of results.slice(1)) {
    assert.equal(result.generation.evalResult.consistency.anchored, true);
    assert.equal(result.generation.evalResult.consistency.behaviorAverageDifference, 0);
    assert.equal(result.generation.evalResult.consistency.quizChanges, 0);
  }
});

test("persona and voice labels rewrite AI-ish phrases into plain cat-owner language", () => {
  const api = loadAIServer("neko-ai", {
    internals: ["normalizePersonaForProfile", "normalizeVoiceForProfile"],
  });
  const persona = api.normalizePersonaForProfile(
    {
      name: "团子",
      type: "仪式感极强的眼神催促者",
      mbti: "INTJ-A",
      matchScore: 88,
      monologue: "让我先看看，再决定要不要靠近。",
      analysis: "它会用眼神施压，也有一点克制讨关注。",
      corePersonality: "高度敏锐，策略性靠近。",
      loveLanguageInsight: "低频高质互动。",
      ownerRelationship: "喜欢稳态陪伴。",
      ownerRole: "喜欢稳态陪伴。",
      misunderstanding: "它不是在端庄定点，只是安静坐着等你发现。",
      tags: ["眼神施压", "端庄定点", "克制讨关注", "低频高质互动"],
      traits: ["观察欲", "边界感", "主人关注度", "行动派程度"].map((label) => ({
        label,
        value: 72,
      })),
      observations: [],
      evidence: [],
      dailyMood: "",
      savedAt: 0,
    },
    mergedProfile,
  );
  assert.equal(persona.type, "会用眼神表达");
  assert.deepEqual(Array.from(persona.tags), [
    "会用眼神表达",
    "安静坐着等你",
    "安静等你发现",
    "不常主动但会认真回应",
  ]);
  assertPlainNekoCopy([
    persona.type,
    ...persona.tags,
    persona.analysis,
    persona.corePersonality,
    persona.loveLanguageInsight,
    persona.ownerRelationship,
    persona.misunderstanding,
  ]);

  const voice = api.normalizeVoiceForProfile(
    {
      text: "你先别急，我看一下。",
      subtext: "喜欢挑你视线必经的动线上端正坐好，用直球眼神确认你的注意力。",
      analysis: {
        observation: "它没有大声叫，只是眼神施压。",
        personalityInterpretation: "这是一种稳态陪伴。",
      },
      mood: "正在观察",
      tags: ["眼神施压", "端庄定点", "低频高质互动"],
      share: {
        insight: "它通过策略性靠近和精准表达确认你的反应。",
        tags: ["克制讨关注", "策略性靠近", "精准表达"],
      },
    },
    mergedProfile,
  );
  assert.deepEqual(Array.from(voice.tags), [
    "会用眼神表达",
    "安静坐着等你",
    "不常主动但会认真回应",
  ]);
  assert.deepEqual(Array.from(voice.share.tags), ["安静等你发现", "先观察再靠近", "表达得很清楚"]);
  assertPlainNekoCopy([
    ...voice.tags,
    ...voice.share.tags,
    voice.subtext,
    voice.analysis.observation,
    voice.analysis.personalityInterpretation,
    voice.share.insight,
  ]);
});

const voicePersonaFixture = {
  persona: {
    mbti: "ISTP-A",
    personaTitle: "独立探索型",
    summary: "喜欢自己先弄明白，也会在想互动时主动靠近。",
  },
  dimensions: [
    { key: "social", direction: "center", strength: "weak" },
    { key: "exploration", direction: "left", strength: "strong" },
    { key: "companionship", direction: "right", strength: "strong" },
    { key: "boundary", direction: "center_right", strength: "medium" },
  ],
};

test("voice validator covers intent evidence, persona tone, missing persona and weak evidence", () => {
  const api = loadAIServer("neko-ai", {
    internals: ["validateVoiceGenerationOutput"],
  });
  const cases = [
    ["高探索+独立玩玩具", ["猫独自盯着羽毛玩具", "前爪伸向玩具"], "想抓", "这根羽毛先别动，我想自己试试从哪边下爪。", voicePersonaFixture],
    ["高陪伴看主人", ["猫抬头看向主人", "身体靠近主人"], "想让主人参与", "你也过来一点，这件事我想让你一起看看。", null],
    ["高边界被抱", ["猫被人抱着", "身体向外侧转开"], "想保持距离", "先把手松一点，我想自己决定站在哪里。", null],
    ["谨慎面对陌生物", ["猫与纸箱保持距离", "视线停在纸箱上"], "想观察", "这个箱子先放着，我要再看清楚一点。", null],
    ["探索型闻新物体", ["猫鼻子靠近新物体", "正在嗅闻"], "想靠近", "这个味道没见过，让我靠近一点再确认。", null],
    ["独立型自己玩", ["猫独自用前爪拍球", "旁边没有人手"], "想自己处理", "这个球我自己会处理，你先看着就好。", voicePersonaFixture],
    ["陪伴型看主人", ["猫看向主人", "停在主人身旁"], "想获得关注", "我都站到你旁边了，你是不是该看我一眼。", null],
    ["证据不足", ["猫坐着看向镜头"], "想观察", "我先看一会，弄清楚这个小方块在做什么。", null],
    ["没有人格档案", ["猫趴着闭上眼睛"], "想休息", "这里刚好安静，我先把这一觉睡完。", null],
    ["画面与活泼人格冲突", ["猫蜷缩着睡觉", "眼睛闭着"], "想休息", "现在先别安排节目，我只想安静睡一会。", voicePersonaFixture],
  ];
  for (const [name, visibleObservations, currentIntent, voiceLine, persona] of cases) {
    assert.equal(
      api.validateVoiceGenerationOutput(
        {
          visibleObservations,
          currentIntent,
          voiceLine,
          subtext: "它这一刻的注意力很具体，没有急着做更多动作。",
          analysis: {
            observation: visibleObservations.join("，"),
            personalityInterpretation: "当前画面优先，既有人格只影响它表达这件事的语气。",
          },
          mood: currentIntent,
          tags: ["看着眼前", "按自己节奏", "还没着急"],
        },
        persona,
      ),
      true,
      name,
    );
  }

  const invalid = {
    visibleObservations: ["猫很谨慎，也很独立"],
    currentIntent: "想观察",
    voiceLine: "作为一只独立探索型的猫，我展现出了很强的探索欲。",
    subtext: "它正在观察。",
    analysis: { observation: "猫坐着。", personalityInterpretation: "它很谨慎。" },
    mood: "观察中",
    tags: ["观察", "谨慎", "独立"],
  };
  assert.equal(api.validateVoiceGenerationOutput(invalid, voicePersonaFixture), false);
});

test("same cat voice candidates keep a stable independent tone across five generations", () => {
  const api = loadAIServer("neko-ai", { internals: ["validateVoiceGenerationOutput"] });
  const lines = [
    "这个球我自己会处理，你先看着就好。",
    "先别替我拿，我想自己试试它会滚到哪里。",
    "它又跑远了，我自己过去把它找回来。",
    "你把球放下就行，剩下的我来研究。",
    "先让我自己玩明白，想叫你时我会抬头。",
  ];
  for (const voiceLine of lines) {
    assert.equal(
      api.validateVoiceGenerationOutput(
        {
          visibleObservations: ["猫独自用前爪拍球", "旁边没有人手"],
          currentIntent: "想自己处理",
          voiceLine,
          subtext: "它专注在球上，没有转头寻找人的帮助。",
          analysis: {
            observation: "猫独自用前爪拍球，注意力停在球上。",
            personalityInterpretation: "这种自己先试的表达，和它偏独立的互动方式一致。",
          },
          mood: "自己研究",
          tags: ["拍着小球", "自己先试", "暂时不求助"],
        },
        voicePersonaFixture,
      ),
      true,
      voiceLine,
    );
  }
});

test("voice diagnostics identify each rule without changing acceptance or exposing text", () => {
  const api = loadAIServer("neko-ai", {
    internals: ["inspectVoiceGenerationOutput", "validateVoiceGenerationOutput"],
  });
  const valid = {
    visibleObservations: ["猫坐着看向镜头"],
    currentIntent: "想观察",
    voiceLine: "这个箱子先放着，我要再看清楚一点。",
    subtext: "它先留意眼前的东西，没有急着行动。",
    analysis: { observation: "猫坐着看向镜头。", personalityInterpretation: "以当前画面为准。" },
    mood: "观察中",
    tags: ["看着眼前", "先看再动", "还没着急"],
  };
  const cases = [
    ["visible_observations_missing", { visibleObservations: ["猫很谨慎"] }],
    ["current_intent_invalid", { currentIntent: "private-invalid-intent" }],
    ["voice_line_too_short", { voiceLine: "看看" }],
    ["voice_line_too_long", { voiceLine: "看".repeat(36) }],
    ["voice_line_too_many_sentences", { voiceLine: "先看看。再等等。等你过来。" }],
    ["voice_line_forbidden_terms", { voiceLine: "让我先控制一下营业的节奏。" }],
    ["voice_line_generic_template", { voiceLine: "有你在我就安心，继续坐这里吧。" }],
    ["voice_line_contains_mbti", { voiceLine: "我是ISTP-A，先把箱子放着吧。" }, voicePersonaFixture],
    ["voice_line_contains_persona_title", { voiceLine: "我是独立探索型，先把箱子放着吧。" }, voicePersonaFixture],
    ["voice_line_persona_conflict", { voiceLine: "你别走，我先看清楚这个箱子。" }, voicePersonaFixture],
    ["subtext_missing", { subtext: "" }],
    ["analysis_observation_missing", { analysis: { ...valid.analysis, observation: "" } }],
    ["analysis_personality_interpretation_missing", { analysis: { ...valid.analysis, personalityInterpretation: "" } }],
    ["tags_not_array", { tags: "private-tags" }],
    ["tag_count_not_three", { tags: ["一个标签"] }],
  ];

  assert.equal(api.inspectVoiceGenerationOutput(valid, null).valid, true);
  assert.deepEqual(Array.from(api.inspectVoiceGenerationOutput(valid, null).reasons), []);
  for (const [reason, patch, persona = null] of cases) {
    const candidate = { ...valid, ...patch };
    const report = api.inspectVoiceGenerationOutput(candidate, persona);
    assert.equal(report.valid, false, reason);
    assert.equal(api.validateVoiceGenerationOutput(candidate, persona), false, reason);
    assert.deepEqual(Array.from(report.reasons), [reason], reason);
    assert.doesNotMatch(JSON.stringify(report), /private-invalid-intent|private-tags|这个箱子|猫很谨慎/);
  }
  const multiple = api.inspectVoiceGenerationOutput({
    ...valid,
    visibleObservations: ["猫很谨慎"],
    voiceLine: "我很开心。",
    tags: [],
  }, null);
  assert.deepEqual(Array.from(multiple.reasons), [
    "visible_observations_missing",
    "voice_line_too_short",
    "voice_line_generic_template",
    "tag_count_not_three",
  ]);
  assert.equal(multiple.metrics.observationInputCount, 1);
  assert.equal(multiple.metrics.observationAcceptedCount, 0);
  assert.equal(multiple.metrics.tagCount, 0);
});

test("voice generation accepts intent without literal evidence keywords on the first model", async () => {
  let calls = 0;
  const logs = [];
  const output = {
    visibleObservations: ["前肢抬起朝向前方", "身体略微前倾"],
    currentIntent: "想抓",
    voiceLine: "先别动，我已经瞄准了，等我够到你。",
    subtext: "它还没有碰到目标，身体已经向前探了。",
    analysis: { observation: "前肢抬起，身体向前倾。", personalityInterpretation: "以当前画面为准。" },
    mood: "准备行动",
    tags: ["抬起前肢", "先瞄准再动", "就差一点"],
  };
  const api = loadAIServer("neko-ai", {
    env: { ...env, BYTECAT_VISION_MODEL: "gemini-3.7-flash" },
    logger: { info: (...args) => logs.push(args), error() {} },
    fetch: async () => {
      calls++;
      assert.equal(calls, 1, "Missing literal keywords must not trigger another model request");
      return geminiResponse(JSON.stringify(output));
    },
  });
  const result = await api.generateCatVoiceServer({
    profile: mergedProfile,
    persona: null,
    imageDataUrl,
  });
  assert.equal(calls, 1);
  assert.equal(result.text, output.voiceLine);
  const events = logs
    .filter(([label]) => label === "NEKO voice validation")
    .map(([, json]) => JSON.parse(json));
  assert.equal(events.length, 1);
  assert.equal(events[0].valid, true);
  assert.equal(events[0].attempt, 1);
  assert.equal(events[0].model, "gemini-3.7-flash");
  assert.deepEqual(events[0].reasons, []);
});

test("invalid voice semantics retry with correlated privacy-safe validation logs", async () => {
  let calls = 0;
  const logs = [];
  const api = loadAIServer("neko-ai", {
    env,
    logger: { info: (...args) => logs.push(args), error() {} },
    fetch: async () => {
      calls++;
      const content =
        calls === 1
          ? {
              visibleObservations: ["猫很谨慎"],
              currentIntent: "想玩",
              voiceLine: "我今天也要开心呀。",
              subtext: "它很开心。",
              analysis: { observation: "猫很谨慎。", personalityInterpretation: "它很谨慎。" },
              mood: "开心",
              tags: ["可爱", "萌宠", "治愈"],
            }
          : {
              visibleObservations: ["猫盯着羽毛玩具", "前爪抬起"],
              currentIntent: "想抓",
              voiceLine: "那根羽毛先别停，我还在找最好下爪的位置。",
              subtext: "它没有马上扑，注意力却一直跟着羽毛移动。",
              analysis: {
                observation: "猫盯着羽毛玩具并抬起前爪。",
                personalityInterpretation: "它更像在等自己觉得合适的时机再行动。",
              },
              mood: "准备出爪",
              tags: ["盯着羽毛", "先看再出手", "想玩但没扑"],
            };
      return calls === 1
        ? Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] })
        : geminiResponse(JSON.stringify(content));
    },
  });
  const result = await api.generateCatVoiceServer({
    profile: mergedProfile,
    persona: null,
    imageDataUrl,
  });
  assert.equal(calls, 2);
  assert.equal(result.text, "那根羽毛先别停，我还在找最好下爪的位置。");
  const events = logs
    .filter(([label]) => label === "NEKO voice validation")
    .map(([, json]) => JSON.parse(json));
  assert.equal(events.length, 2);
  assert.equal(events[0].event, "voice_validation");
  assert.ok(events[0].generationId);
  assert.equal(events[0].generationId, events[1].generationId);
  assert.deepEqual(events.map(({ attempt }) => attempt), [1, 2]);
  assert.deepEqual(events.map(({ valid }) => valid), [false, true]);
  assert.deepEqual(events.map(({ model }) => model), ["gpt-5.6-terra", "gemini-3.7-flash"]);
  assert.deepEqual(events[0].reasons, ["visible_observations_missing", "voice_line_generic_template"]);
  assert.deepEqual(events[1].reasons, []);
  assert.equal(events[0].metrics.observationAcceptedCount, 0);
  for (const event of events) {
    assert.equal(event.provider, "bytecat");
    assert.ok(event.durationMs >= 0);
    assert.ok(event.totalDurationMs >= event.durationMs);
  }
  assert.doesNotMatch(JSON.stringify(events), /data:image|test-gpt-key|test-gemini-key|猫很谨慎|我今天也要开心|那根羽毛/);
});

test("voice fallback stays conservative when image evidence is unavailable", () => {
  const api = loadAIServer("neko-ai", { internals: ["buildStableVoice"] });
  const result = api.buildStableVoice(mergedProfile, null, imageDataUrl, "");
  assert.equal(result.text, "这个有点意思，我再看一会。");
  assert.match(result.analysis.observation, /证据有限|留意周围/);
  assert.doesNotMatch(result.text, /喜欢|讨厌|想念|嫉妒/);
});

for (const personaMode of ["without persona", "with persona"]) {
  test(`voice observation-intent chain works ${personaMode}`, async () => {
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
                  visibleObservations: ["猫端坐着", "眼睛看向镜头"],
                  currentIntent: "想观察",
                  voiceLine: "你举着那个小方块，我先坐好看看。",
                  subtext: "它没有急着靠近，还在观察眼前的变化。",
                  analysis: {
                    observation: "前爪并拢，眼睛看向镜头。",
                    personalityInterpretation: "可能习惯先看清楚再行动。",
                  },
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
      persona: personaMode === "with persona" ? voicePersonaFixture : null,
      imageDataUrl,
    });
    assert.equal(calls, 1);
    assert.equal(result.tags.length, 3);
    assert.deepEqual(Array.from(result.tags), ["先看清楚", "安静坐着", "先不靠近"]);
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
  personaTitle: "先看再行动",
  mbti: "INFP-A",
  monologue: "让我先坐好看看，再决定要不要靠近。",
  summary: "它习惯先确认情况，再按自己的节奏靠近。",
  insights: {
    misunderstanding:
      "它不是不想参与，只是习惯先把情况看明白；坐着不动时，注意力可能早已放在眼前。",
    affection: "如果平时也经常这样，它可能更习惯把你放在视线里，用关注而不是紧贴表达亲近。",
    ownerRelationship:
      "你可能不是它时时刻刻都要黏着的人，但很可能是它默认会在、可以放心观察周围的人。",
  },
  tags: ["观察优先", "保留距离", "心动不动", "小小探长"],
  traits: ["观察欲", "边界感", "好奇心", "行动力"].map((label) => ({ label, value: 72 })),
};
const fallbackStage1 = {
  behaviorProfile: {
    sociability: 58,
    curiosity: 72,
    caution: 76,
    attachmentExpression: 62,
    independence: 64,
    boundary: 70,
    environmentalSensitivity: 74,
    interactionPreference: 56,
  },
  coreTraits: [
    {
      trait: "好奇但谨慎",
      description: "它对变化有兴趣，但通常先确认安全再靠近。",
      supportedBy: ["Q2:B", "Q5:A"],
      confidence: 0.82,
    },
    {
      trait: "亲近但有边界",
      description: "它愿意靠近熟悉的人，也希望自己决定互动距离。",
      supportedBy: ["Q6:A", "Q8:C"],
      confidence: 0.8,
    },
  ],
  unsupportedClaims: [],
};
const fallbackStage2 = {
  misunderstanding: {
    claim: "它不是不想参与，只是在先看清楚。",
    explanation: fallbackPersona.insights.misunderstanding,
    supportedBy: ["trait:好奇但谨慎"],
    confidence: 0.8,
  },
  affection: {
    claim: "它表达喜欢时，会把你放在视线里。",
    explanation: fallbackPersona.insights.affection,
    supportedBy: ["trait:亲近但有边界"],
    confidence: 0.78,
  },
  ownerRelationship: {
    claim: "你是它可以安心观察的人。",
    explanation: fallbackPersona.insights.ownerRelationship,
    supportedBy: ["trait:亲近但有边界"],
    confidence: 0.76,
  },
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
      if (model === "gemini-3.7-flash") {
        assert.equal(init.headers["x-goog-api-key"], "test-gemini-key");
        assert.equal(body.generationConfig.maxOutputTokens, 2224);
        assert.equal(body.generationConfig.temperature, 0.12);
        return geminiResponse(JSON.stringify({ ok: true }));
      }
      if (model === "gemini-3-flash-preview") {
        assert.equal(init.headers["x-goog-api-key"], "test-gemini-key");
        return geminiResponse(JSON.stringify(fallbackStage1));
      }
      assert.equal(model, "gpt-5.6-luna");
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify(personaPipelineFixtureForPrompt(promptTextFromBody(body))),
            },
          },
        ],
      });
    },
  });
  const result = await api.generateCatPersonaServer({ profile: mergedProfile, imageDataUrl });
  assert.deepEqual(calls, [
    "gpt-5.6-terra",
    "gemini-3.7-flash",
    "gemini-3-flash-preview",
    "gpt-5.6-luna",
    "gpt-5.6-luna",
  ]);
  assert.equal(result.traits.length, 4);
  assert.equal(result.tags.length, 4);
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
          visibleObservations: ["猫端坐着", "眼睛看向镜头"],
          currentIntent: "想观察",
          voiceLine: "你举着那个小方块，我先坐好看看。",
          analysis: {
            observation: "前爪并拢，眼睛看向镜头。",
            personalityInterpretation: "可能习惯先看清楚再行动。",
          },
          subtext: "它还没有急着行动，像是在等你先回应。",
          mood: "正在观察",
          tags: ["端正坐好", "关注镜头", "还没行动"],
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
