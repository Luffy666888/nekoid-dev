import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { loadAIServer } from "./bytecat-test-loader.mjs";

const require = createRequire(import.meta.url);
function load(name, internals = []) {
  const filename = new URL(`../src/lib/${name}.ts`, import.meta.url);
  const exports = {};
  const source =
    readFileSync(filename, "utf8").replaceAll("import.meta.env.DEV", "false") +
    `\nexport { ${internals.join(", ")} };`;
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      require(id) {
        if (id === "./voice-analysis") return load("voice-analysis");
        if (id === "./persona-questionnaire" || id === "@/lib/persona-questionnaire")
          return load("persona-questionnaire");
        if (id === "@supabase/supabase-js" || id === "react") return require(id);
        if (id.startsWith("@/")) return {};
        throw new Error(`Unexpected import: ${id}`);
      },
    },
    { filename: filename.pathname },
  );
  return exports;
}

const analysisAPI = load("voice-analysis");
const length = (text) => Array.from(text).length;
const profile = { name: "丸子", gender: "male", ageStage: "adult", quiz: {} };
const candidate = {
  visibleObservations: ["猫坐着看向镜头"],
  currentIntent: "想观察",
  voiceLine: "这个箱子先放着，我要再看清楚一点。",
  subtext: "它先留意眼前的东西，没有急着行动。",
  analysis: {
    observation: "猫坐着看向镜头。",
    personalityInterpretation: "它似乎想先观察一会儿。",
  },
  mood: "观察中",
  tags: ["看着眼前", "先看再动", "还没着急"],
};

test("voice tags keep complete 2–5-character phrases, dedupe, and never truncate long labels", () => {
  const api = loadAIServer("neko-ai", { internals: ["normalizeVoiceTags", "VOICE_JSON_SCHEMA"] });
  const tags = api.normalizeVoiceTags([
    " 玩 ", "#等你一起玩", "等你一起玩", "想看看再出爪", "准备出爪",
    "文静脸庞猎手心", "𠮷猫看球", "AI", "视线朝前", null, 123, {},
  ], profile);
  assert.deepEqual(Array.from(tags), ["等你一起玩", "准备出爪", "𠮷猫看球", "AI", "视线朝前"]);
  assert.ok(tags.every((tag) => length(tag) >= 2 && length(tag) <= 5));
  assert.ok(!tags.includes("想看看再出"));
  assert.equal(api.VOICE_JSON_SCHEMA.properties.sceneTags.items.maxLength, 5);
  assert.equal(api.VOICE_JSON_SCHEMA.properties.sceneTags.items.minLength, 2);
  assert.ok(api.VOICE_JSON_SCHEMA.required.includes("sceneTags"));
  assert.equal(api.VOICE_JSON_SCHEMA.properties.tags, undefined);
});

test("the reported long tags fall back to the current intent in both detail and share output", () => {
  const api = loadAIServer("neko-ai", { internals: ["normalizeVoiceForProfile"] });
  const result = api.normalizeVoiceForProfile({
    ...candidate,
    currentIntent: "想抓",
    tags: ["盯紧半空毛球", "端坐蓄势待发", "文静脸庞猎手心"],
    share: { tags: ["文静脸庞猎手心", "这条分享标签也很长"] },
  }, profile);
  assert.deepEqual(Array.from(result.tags), ["想伸爪", "准备出爪", "盯着目标"]);
  assert.deepEqual(Array.from(result.sceneTags), Array.from(result.tags));
  assert.deepEqual(Array.from(result.share.tags), Array.from(result.tags));
  assert.equal(result.analysis.observation, candidate.analysis.observation);
  assert.equal(result.analysis.personalityInterpretation, candidate.analysis.personalityInterpretation);
});

test("sceneTags is canonical while legacy tags remain readable and all output aliases agree", () => {
  const api = loadAIServer("neko-ai", { internals: ["normalizeVoiceForProfile"] });
  const shortTags = ["看球", "想玩了", "准备出爪"];
  for (const fields of [
    { sceneTags: shortTags },
    { tags: shortTags },
    { sceneTags: shortTags, tags: ["旧的标签"] },
    { sceneTags: null, tags: shortTags },
    { sceneTags: "invalid", tags: shortTags },
  ]) {
    const result = api.normalizeVoiceForProfile({ ...candidate, ...fields }, profile);
    assert.deepEqual(Array.from(result.sceneTags), shortTags);
    assert.deepEqual(Array.from(result.tags), shortTags);
    assert.deepEqual(Array.from(result.share.tags), shortTags);
  }
});

test("every intent and malformed tag list produces three short unique tags, with neutral defaults for missing intent", () => {
  const api = loadAIServer("neko-ai", {
    internals: ["normalizeVoiceForProfile", "VOICE_CURRENT_INTENTS"],
  });
  for (const currentIntent of [...api.VOICE_CURRENT_INTENTS, undefined, "not-an-intent"]) {
    for (const tags of [undefined, "invalid", [], [null, 123, {}], ["歇一会儿", "歇一会儿", "长".repeat(50)]]) {
      const result = api.normalizeVoiceForProfile({
        ...candidate, currentIntent, mood: "", tags, share: { tags: [null, "歇一会儿"] },
      }, profile);
      for (const values of [result.sceneTags, result.tags, result.share.tags]) {
        assert.equal(values.length, 3);
        assert.equal(new Set(values).size, 3);
        assert.ok(values.every((tag) => length(tag) >= 2 && length(tag) <= 5));
      }
    }
  }
  const neutral = api.normalizeVoiceForProfile({ ...candidate, currentIntent: undefined, tags: [], mood: "" }, profile);
  assert.deepEqual(Array.from(neutral.tags), ["这一刻", "日常片段", "随手记录"]);
});

for (const field of ["sceneTags", "tags"]) {
  test(`${field}: malformed, long or stylistically imperfect labels never cause a model retry`, async () => {
    const cases = [
      undefined, "invalid", [], [null, 123, {}], ["只有一个"],
      ["观察", "想玩了", "准备出爪"],
      ["盯紧半空毛球", "端坐蓄势待发", "文静脸庞猎手心"],
      ["#看着眼前", "等你一起玩", "AI"],
      ["慢热", "温柔", "独立"],
      ["先看看", "先看看", "先看一看"],
      ["准备出爪", "想玩了", "趴在地上"],
      ["猫坐着看", "先观察", "还在观察"],
    ];
    for (const values of cases) {
      let calls = 0;
      const generation = loadAIServer("neko-ai", {
        env: {
          AI_PROVIDER: "bytecat", AI_REQUIRE_REAL: "true", BYTECAT_API_KEY: "test-key",
          BYTECAT_MODEL: "first", BYTECAT_TEXT_FALLBACK_MODELS: "second",
        },
        logger: { info() {}, error() {} },
        fetch: async () => {
          calls++;
          return Response.json({ choices: [{ message: { content: JSON.stringify({
            ...candidate, tags: undefined, [field]: values,
          }) } }] });
        },
      });
      const result = await generation.generateCatVoiceServer({ profile, persona: null });
      assert.equal(calls, 1, JSON.stringify(values));
      assert.equal(result.sceneTags.length, 3);
      assert.equal(new Set(result.sceneTags).size, 3);
      assert.ok(result.sceneTags.every((tag) => length(tag) >= 2 && length(tag) <= 5));
      assert.deepEqual(Array.from(result.tags), Array.from(result.sceneTags));
      assert.deepEqual(Array.from(result.share.tags), Array.from(result.sceneTags));
      assert.equal(result.text, candidate.voiceLine);
      assert.equal(result.analysis.observation, candidate.analysis.observation);
      assert.equal(result.analysis.personalityInterpretation, candidate.analysis.personalityInterpretation);
    }
  });
}

test("an overlong tag alone does not retry the model or change the voice and analysis", async () => {
  let calls = 0;
  const generation = loadAIServer("neko-ai", {
    env: {
      AI_PROVIDER: "bytecat",
      AI_REQUIRE_REAL: "true",
      BYTECAT_API_KEY: "test-key",
      BYTECAT_MODEL: "first",
      BYTECAT_TEXT_FALLBACK_MODELS: "second",
    },
    logger: { info() {}, error() {} },
    fetch: async (_url, init) => {
      calls++;
      const prompt = JSON.parse(init.body).messages[1].content[0].text;
      assert.match(prompt, /每个 2–5 个字，最多 5 个字/);
      assert.match(prompt, /不强凑反差/);
      assert.match(prompt, /日常口语/);
      assert.match(prompt, /禁止生造词/);
      assert.match(prompt, /不能截半句/);
      assert.doesNotMatch(prompt, /每个 4–10 字/);
      return Response.json({
        choices: [{ message: { content: JSON.stringify({
          ...candidate, tags: ["看着眼前", "这条标签太长了", "还没着急"],
        }) } }],
      });
    },
  });
  const result = await generation.generateCatVoiceServer({ profile, persona: null });
  assert.equal(calls, 1);
  assert.deepEqual(Array.from(result.tags), ["看着眼前", "还没着急", "先看看"]);
  assert.deepEqual(Array.from(result.share.tags), Array.from(result.tags));
  assert.equal(result.text, candidate.voiceLine);
  assert.equal(result.analysis.observation, candidate.analysis.observation);
  assert.equal(result.analysis.personalityInterpretation, candidate.analysis.personalityInterpretation);
});

test("generation accepts 80 characters and retries 81 with the full short sentences intact", async () => {
  const api = loadAIServer("neko-ai", { internals: ["inspectVoiceGenerationOutput"] });
  const exact = { observation: "看".repeat(39), personalityInterpretation: "想".repeat(40) };
  assert.equal(
    api.inspectVoiceGenerationOutput({ ...candidate, analysis: exact }, null).valid,
    true,
  );
  assert.equal(
    api.inspectVoiceGenerationOutput(
      { ...candidate, analysis: { ...exact, observation: exact.observation + "看" } },
      null,
    ).valid,
    false,
  );

  let calls = 0;
  const generation = loadAIServer("neko-ai", {
    env: {
      AI_PROVIDER: "bytecat",
      AI_REQUIRE_REAL: "true",
      BYTECAT_API_KEY: "test-key",
      BYTECAT_MODEL: "first",
      BYTECAT_TEXT_FALLBACK_MODELS: "second",
    },
    logger: { info() {}, error() {} },
    fetch: async (_url, init) => {
      calls++;
      assert.match(JSON.parse(init.body).messages[1].content[0].text, /两项合计不超过 80 个字符/);
      const analysis =
        calls === 1
          ? { observation: "看".repeat(40), personalityInterpretation: "想".repeat(40) }
          : candidate.analysis;
      return Response.json({
        choices: [{ message: { content: JSON.stringify({ ...candidate, analysis }) } }],
      });
    },
  });
  const result = await generation.generateCatVoiceServer({ profile, persona: null });
  assert.equal(calls, 2);
  assert.equal(result.analysis.observation, candidate.analysis.observation);
  assert.equal(
    result.analysis.personalityInterpretation,
    candidate.analysis.personalityInterpretation,
  );
  assert.ok(length(analysisAPI.joinVoiceAnalysis(result.analysis)) <= 80);
});

const styleAPI = load("voice-analysis-style");

test("style bank contains 50 unique original output-only examples within the 80-character budget", () => {
  const examples = styleAPI.VOICE_ANALYSIS_STYLE_EXAMPLES;
  assert.equal(examples.length, 50);
  assert.equal(new Set(examples.map(({ id }) => id)).size, 50);
  assert.equal(new Set(examples.map(({ text }) => text)).size, 50);
  for (const { id, text } of examples) {
    assert.match(id, /^voice-style-\d{2}$/);
    assert.ok(text.trim().length > 0);
    assert.ok(length(text) <= 80, `${id}: ${length(text)} characters`);
    assert.match(text, /[。！？]$/);
  }
});

test("sampling selects five without replacement, covers the whole bank and never mutates it", () => {
  const before = JSON.stringify(styleAPI.VOICE_ANALYSIS_STYLE_EXAMPLES);
  const covered = new Set();
  for (let first = 0; first < 50; first++) {
    let calls = 0;
    const chosen = styleAPI.selectVoiceAnalysisStyleExamples(() => {
      calls++;
      return calls === 1 ? (first + 0.5) / 50 : 0;
    });
    assert.equal(calls, 5);
    assert.equal(chosen.length, 5);
    assert.equal(new Set(chosen.map(({ id }) => id)).size, 5);
    covered.add(chosen[0].id);
  }
  assert.equal(covered.size, 50);
  assert.equal(JSON.stringify(styleAPI.VOICE_ANALYSIS_STYLE_EXAMPLES), before);
  const last = styleAPI.selectVoiceAnalysisStyleExamples(() => 1 - Number.EPSILON);
  assert.equal(new Set(last.map(({ id }) => id)).size, 5);
  assert.equal(last[0].id, "voice-style-50");
});

test("style prompt separates examples from current facts and restricts imitation to analysis tone", () => {
  const selected = styleAPI.selectVoiceAnalysisStyleExamples(() => 0);
  const prompt = styleAPI.buildVoiceAnalysisStylePrompt(selected);
  assert.equal((prompt.match(/<example id=/g) ?? []).length, 5);
  assert.match(prompt, /只学语气，不借用事实/);
  assert.match(prompt, /不要照抄、拼接或机械改写/);
  assert.match(prompt, /绝不能把示例里的物品、人物、动作、情绪或长期习惯移植/);
  assert.match(prompt, /只影响 analysis.observation 与 analysis.personalityInterpretation/);
  assert.match(prompt, /不影响 voiceLine/);
  assert.match(prompt, /两项合计不超过 80 个字符/);
});

test("generation reuses five examples across retries and resamples for the next request", async () => {
  let draws = 0;
  const prompts = [];
  const logs = [];
  const generation = loadAIServer("neko-ai", {
    env: {
      AI_PROVIDER: "bytecat",
      AI_REQUIRE_REAL: "true",
      BYTECAT_API_KEY: "test-key",
      BYTECAT_MODEL: "first",
      BYTECAT_TEXT_FALLBACK_MODELS: "second",
    },
    random: () => (draws++ < 5 ? 0 : 0.99),
    logger: { info: (...values) => logs.push(values.join(" ")), error() {} },
    fetch: async (_url, init) => {
      const request = JSON.parse(init.body);
      prompts.push(request.messages[0].content);
      assert.equal(request.max_tokens, 620);
      assert.equal(request.temperature, 0.62);
      assert.equal((request.messages[0].content.match(/<example id=/g) ?? []).length, 5);
      assert.match(request.messages[1].content[0].text, /当前图片真实可见信息 > 用户补充场景/);
      assert.match(request.messages[1].content[0].text, /本次场景仅用于事实判断/);
      // Force exactly one existing validation retry, not another style-generation call.
      const analysis =
        prompts.length === 1
          ? { observation: "看".repeat(40), personalityInterpretation: "想".repeat(40) }
          : candidate.analysis;
      return Response.json({
        choices: [{ message: { content: JSON.stringify({ ...candidate, analysis }) } }],
      });
    },
  });
  const input = { profile, persona: null, scene: "本次场景仅用于事实判断" };
  await generation.generateCatVoiceServer(input);
  assert.equal(draws, 5);
  assert.equal(prompts.length, 2);
  assert.equal(prompts[0], prompts[1]);
  await generation.generateCatVoiceServer(input);
  assert.equal(draws, 10);
  assert.equal(prompts.length, 3);
  assert.notEqual(prompts[0], prompts[2]);
  const sampleLogs = logs.filter((line) => line.includes('"event":"voice_style_examples"'));
  assert.equal(sampleLogs.length, 2);
  assert.ok(sampleLogs.every((line) => !line.includes(input.scene)));
  assert.ok(
    sampleLogs.every((line) => !line.includes(styleAPI.VOICE_ANALYSIS_STYLE_EXAMPLES[0].text)),
  );
});

test("the reported sentence no longer loses its ending at 30 characters", () => {
  const api = loadAIServer("neko-ai", { internals: ["normalizeVoiceForProfile"] });
  const analysis = {
    observation: "黑色小猫卧在石阶的折角凹槽里，前爪伸直，仰头盯着上方的人。",
    personalityInterpretation: "就地利用台阶结构作为掩护定点打量，符合它先观察确认再行动的习惯。",
  };
  const result = api.normalizeVoiceForProfile({ ...candidate, analysis }, profile);
  assert.equal(result.analysis.personalityInterpretation, analysis.personalityInterpretation);
});

test("generation normalization preserves an exact 80-character result and caps copy expansion", () => {
  const api = loadAIServer("neko-ai", { internals: ["normalizeVoiceForProfile"] });
  const exact = {
    observation: "看".repeat(38) + "🐈",
    personalityInterpretation: "想".repeat(39) + "。",
  };
  const result = api.normalizeVoiceForProfile({ ...candidate, analysis: exact }, profile);
  assert.equal(
    analysisAPI.joinVoiceAnalysis(result.analysis),
    analysisAPI.joinVoiceAnalysis(exact),
  );
  assert.equal(length(analysisAPI.joinVoiceAnalysis(result.analysis)), 80);
  // Existing plain-language rewrites can lengthen copy after model validation.
  const expanded = api.normalizeVoiceForProfile(
    {
      ...candidate,
      analysis: {
        observation: "看".repeat(39),
        personalityInterpretation: "眼神催促".repeat(10),
      },
    },
    profile,
  );
  assert.ok(length(analysisAPI.joinVoiceAnalysis(expanded.analysis)) <= 80);
});

test("Gemini receives the same five style examples in its native system instruction", async () => {
  let calls = 0;
  const generation = loadAIServer("neko-ai", {
    env: {
      AI_PROVIDER: "bytecat",
      AI_REQUIRE_REAL: "true",
      BYTECAT_API_KEY: "test-key",
      BYTECAT_GEMINI_API_KEY: "test-gemini-key",
      BYTECAT_VISION_MODEL: "gemini-3.7-flash",
    },
    random: () => 0,
    logger: { info() {}, error() {} },
    fetch: async (url, init) => {
      calls++;
      assert.match(url, /generateContent/);
      const request = JSON.parse(init.body);
      const system = request.systemInstruction.parts.map(({ text }) => text).join("\n");
      assert.equal((system.match(/<example id=/g) ?? []).length, 5);
      assert.match(system, /只学语气，不借用事实/);
      assert.match(JSON.stringify(request.contents), /两项合计不超过 80 个字符/);
      assert.equal(request.generationConfig.responseJsonSchema.properties.sceneTags.items.maxLength, 5);
      assert.ok(
        request.contents.some(({ parts }) =>
          parts.some(({ inlineData }) => inlineData?.data === "aW1hZ2U="),
        ),
      );
      return Response.json({
        candidates: [
          { finishReason: "STOP", content: { parts: [{ text: JSON.stringify(candidate) }] } },
        ],
      });
    },
  });
  const result = await generation.generateCatVoiceServer({
    profile,
    persona: null,
    imageDataUrl: "data:image/png;base64,aW1hZ2U=",
  });
  assert.equal(calls, 1);
  assert.equal(result.analysis.observation, candidate.analysis.observation);
});

const storageCases = [
  candidate.analysis,
  { observation: "看".repeat(49), personalityInterpretation: "想".repeat(50) },
  { observation: "看".repeat(49), personalityInterpretation: "想".repeat(51) },
  { observation: "看".repeat(120), personalityInterpretation: "还在观察。" },
  { observation: "猫".repeat(98) + "🐈", personalityInterpretation: "继续观察。" },
  { summary: "看".repeat(60), personalityInterpretation: "想".repeat(60) },
  "猫".repeat(99) + "🐈" + "额外内容",
  "这是一句完整的旧版解读。",
  undefined,
];

test("storage truncates only beyond 100 total characters, including legacy text and Unicode", () => {
  for (const input of storageCases) {
    const stored = analysisAPI.voiceAnalysisStorageFields(input);
    const source =
      typeof input === "string"
        ? input
        : [input?.observation ?? input?.summary, input?.personalityInterpretation]
            .filter(Boolean)
            .join(" ");
    assert.equal(stored.analysis ?? "", Array.from(source).slice(0, 100).join("").trimEnd());
    assert.ok(length(stored.analysis ?? "") <= 100);
    if (typeof input === "object") {
      assert.equal(
        [stored.analysis_summary, stored.personality_interpretation].filter(Boolean).join(" "),
        stored.analysis,
      );
    }
  }
});

for (const name of ["ios-cloud.server", "neko-cloud"]) {
  test(`${name}: actual Supabase upsert query stores the same bounded analysis fields`, async () => {
    const cloud = load(name, ["saveVoice"]);
    const { createClient } = require("@supabase/supabase-js");
    let stored;
    const client = createClient("https://supabase.test", "test-public-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (url, init) => {
          const request = new Request(url, init);
          assert.equal(new URL(request.url).pathname, "/rest/v1/cat_voices");
          assert.equal(request.method, "POST");
          stored = await request.json();
          return Response.json(stored);
        },
      },
    });
    for (const analysis of storageCases) {
      const voice = {
        cloudId: "11111111-1111-4111-8111-111111111111",
        time: "刚刚",
        grad: "",
        text: "我先看看。",
        analysis,
      };
      const result =
        name === "ios-cloud.server"
          ? await cloud.saveVoice(
              client,
              {},
              { id: "test-user" },
              { catId: "test-cat", voice },
              "https://neko.test",
            )
          : await cloud.saveVoice(client, { id: "test-user" }, "test-cat", voice);
      const expected = analysisAPI.voiceAnalysisStorageFields(analysis);
      for (const [field, value] of Object.entries(expected))
        assert.equal(stored[field], value, field);
      assert.equal(stored.text, voice.text);
      assert.equal(stored.user_id, "test-user");
      assert.equal(stored.cat_id, "test-cat");
      if (name === "ios-cloud.server") {
        const roundTrip =
          typeof result.analysis === "string"
            ? result.analysis
            : result.analysis
              ? analysisAPI.joinVoiceAnalysis(result.analysis)
              : null;
        assert.equal(roundTrip, expected.analysis);
      }
    }
  });
}
