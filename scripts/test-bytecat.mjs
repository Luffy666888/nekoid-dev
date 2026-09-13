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
  personaTitle: "会先看清楚",
  mbti: "INTJ-A",
  summary: "它习惯先看清楚眼前变化，再按自己的节奏靠近互动。",
  monologue: "我先看清楚，再决定怎么靠近。",
  tags: ["先观察再靠近", "不急着靠近", "靠近有分寸", "会先看清楚"],
  insights: {
    misunderstanding: "它不是对互动没兴趣，只是常常先停下来确认，再决定要不要靠近。",
    affection: "它表达喜欢不一定靠一直贴着你，更像是把注意力放在你身上再慢慢回应。",
    ownerRelationship: "你像它可以放心观察的参照，它会保留自己的节奏，也愿意在你附近。",
  },
  matchScore: 88,
  traits: ["观察欲", "边界感", "主人关注度", "行动派程度"].map((label) => ({
    label,
    value: 72,
  })),
};

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
        assert.equal(body.temperature, 0.25);
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
        personaTitle: "谨慎小探长",
        mbti: "INTJ-A",
        matchScore: 88,
        monologue: "让我先看看，再决定要不要靠近。",
        summary: "它习惯先确认情况，再按自己的节奏靠近。",
        insights: {
          misunderstanding:
            "它不是不想参与，只是习惯先把局面看明白；坐着不动时，注意力可能早已放在眼前。",
          affection: "如果它平时也经常这样，它可能更习惯把你放在视线里，用关注而不是紧贴表达亲近。",
          ownerRelationship:
            "你可能不是它时时刻刻都要黏着的人，但很可能是它默认会在、可以放心观察周围的人。",
        },
        tags: ["观察优先", "保留距离", "心动不动", "小小探长"],
        traits: ["观察欲", "边界感", "主人关注度", "行动派程度"].map((label) => ({
          label,
          value: 72,
        })),
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
  assert.equal(result.type, "会先看清楚");
  assert.deepEqual(Array.from(result.tags), [
    "先观察再靠近",
    "不急着靠近",
    "想靠近又犹豫",
    "会先看清楚",
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
        personaTitle: "先看再动",
        mbti: "INFP-A",
        matchScore: 91,
        monologue: "我先盯准了，再决定要不要扑过去。",
        summary: "它遇到想玩的东西时，会先看清楚再行动。",
        insights: {
          misunderstanding:
            "它不是对互动没兴趣，只是常常先停下来观察，确认安全和节奏后才会把注意力真正放出来。",
          affection:
            "它表达亲近不一定靠一直贴着你，更像是把注意力放在你和眼前互动上，等时机合适再靠近。",
          ownerRelationship:
            "你对它来说可能是那个可以让它安心观察的人，它会保留自己的节奏，但也会回应你制造的小互动。",
        },
        tags: ["盯着玩具", "先看再动", "靠近有分寸", "熟悉后会玩"],
        traits: ["观察欲", "好奇心", "边界感", "行动派程度"].map((label) => ({
          label,
          value: 76,
        })),
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
  assert.equal(result.type, "先看再动");
  assert.ok(result.evidence.length >= 2);
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
        assert.equal(body.generationConfig.temperature, 0.25);
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
