import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { loadAIServer } from "./bytecat-test-loader.mjs";

const api = loadAIServer("neko-ai", {
  fetch() {
    throw new Error("This regression suite must not call a live model");
  },
  logger: { info() {}, error() {} },
  internals: [
    "buildBehaviorProfile",
    "questionnaireAnswersForPrompt",
    "buildStableStage1",
    "normalizeStage1Output",
    "stage1Prompt",
    "validatePersonaInput",
    "previousPersonaForIdenticalQuiz",
    "buildStableStage2",
    "buildStableStage3",
    "normalizeStage3Output",
    "mappedMbti",
  ],
});
const plain = (value) => JSON.parse(JSON.stringify(value));
const profile = (quiz) => ({
  name: "测试猫",
  gender: "小公猫",
  ageStage: "青年猫",
  quiz,
  updatedAt: 0,
});
const input = (quiz, questionnaireVersion = "ios-v1") => ({
  profile: profile(quiz),
  questionnaireVersion,
});
const all = (choice) => Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i, choice]));
const traitNames = (stage) => Array.from(stage.coreTraits, (trait) => trait.trait);
const iosSource =
  process.env.NEKO_IOS_MODELS_PATH ??
  new URL("../../neko-id/neko-id/Models.swift", import.meta.url);

test(
  "iOS question and answer wording exactly matches the current native client",
  {
    skip: !existsSync(iosSource) && "Set NEKO_IOS_MODELS_PATH to verify the native client contract",
  },
  () => {
    const source = readFileSync(iosSource, "utf8");
    const questions = [
      ...source.matchAll(
        /QuizQuestion\(id: (\d+), question: "([^"]+)", optionA: "([^"]+)", optionB: "([^"]+)", optionC: "([^"]+)"\)/g,
      ),
    ];
    assert.equal(questions.length, 8);
    for (const [choice, offset] of [
      ["a", 3],
      ["b", 4],
      ["c", 5],
    ]) {
      const decoded = api.questionnaireAnswersForPrompt(all(choice), "ios-v1");
      questions.forEach((question, index) => {
        assert.equal(Number(question[1]), index);
        assert.equal(decoded[index].question, question[2]);
        assert.equal(decoded[index].answer, question[offset]);
        assert.equal(decoded[index].reference, `Q${index + 1}:${choice.toUpperCase()}`);
      });
    }
  },
);

test("web wording stays matched to the existing web client, not the iOS meanings", () => {
  const source = readFileSync(
    new URL("../src/components/neko/onboarding/Screen4Quiz.tsx", import.meta.url),
    "utf8",
  );
  const questions = [
    ...source.matchAll(/q: "([^"]+)",\s+a: "([^"]+)",\s+b: "([^"]+)",\s+c: "([^"]+)"/g),
  ];
  assert.equal(questions.length, 8);
  for (const [choice, offset] of [
    ["a", 2],
    ["b", 3],
    ["c", 4],
  ]) {
    const decoded = api.questionnaireAnswersForPrompt(all(choice));
    questions.forEach((question, index) => {
      assert.equal(decoded[index].question, question[1]);
      assert.equal(decoded[index].answer, question[offset]);
    });
  }
  assert.notEqual(
    api.questionnaireAnswersForPrompt({ 6: "b" }, "ios-v1")[6].answer,
    api.questionnaireAnswersForPrompt({ 6: "b" }, "web-v1")[6].answer,
  );
});

test("iOS solitude does not add attachment and co-presence does not add curiosity or touch tolerance", () => {
  for (const quiz of [{ 2: "c" }, { 3: "c" }, { 6: "b" }, { 6: "c" }, { 7: "c" }]) {
    assert.ok(api.buildBehaviorProfile(quiz, "ios-v1").attachment < 50, JSON.stringify(quiz));
  }
  assert.ok(api.buildBehaviorProfile({ 2: "a" }, "ios-v1").attachment > 50);
  assert.ok(api.buildBehaviorProfile({ 6: "a" }, "ios-v1").attachment > 50);
  assert.equal(api.buildBehaviorProfile({ 6: "a" }, "ios-v1").expressiveness, null);
  assert.equal(api.buildBehaviorProfile({ 7: "b" }, "ios-v1").curiosity, null);
  assert.equal(api.buildBehaviorProfile({ 7: "b" }, "ios-v1").loveLanguage, "安静共处");
  assert.equal(api.buildBehaviorProfile({ 7: "a" }, "ios-v1").boundary, null);
  assert.equal(api.buildBehaviorProfile({ 7: "a" }, "ios-v1").loveLanguage, "互动陪伴");
  assert.equal(api.buildBehaviorProfile({ 7: "c" }, "ios-v1").loveLanguage, "按需互动");
  assert.equal(api.buildBehaviorProfile({ 1: "c" }, "ios-v1").vigilance, null);
});

test("legacy web scoring remains unchanged for the different choices", () => {
  assert.ok(api.buildBehaviorProfile({ 2: "c" }).attachment > 50);
  assert.ok(api.buildBehaviorProfile({ 6: "b" }).attachment > 50);
  assert.ok(api.buildBehaviorProfile({ 7: "b" }).curiosity > 50);
  assert.equal(api.buildBehaviorProfile({ 7: "b" }).loveLanguage, "互动玩耍");
});

test("unanswered and unknown questions do not become evidence or confident scores", () => {
  const quiz = { 0: null, 1: "invalid", 8: "a", 99: "b" };
  const decoded = api.questionnaireAnswersForPrompt(quiz, "ios-v1");
  assert.equal(decoded.length, 8);
  assert.ok(decoded.every((answer) => answer.answer === null && answer.reference === null));
  const behavior = api.buildBehaviorProfile(quiz, "ios-v1");
  assert.equal(behavior.answeredCount, 0);
  assert.equal(behavior.attachment, null);
  assert.ok(Object.values(behavior.confidence).every((score) => score === 0));
  assert.deepEqual(traitNames(api.buildStableStage1(input(quiz))), []);
});

test("Stage 1 receives selected meanings and unambiguous one-based evidence references", () => {
  const data = input({ 2: "c", 6: "b", 7: "b" });
  const prompt = api.stage1Prompt(data, api.buildStableStage1(data).behaviorProfile);
  for (const text of [
    "继续做自己的事",
    "自己找地方待着",
    "待在一起，各做各的",
    "Q3:C",
    "Q7:B",
    "Q8:B",
    "answer/reference 为 null",
    "同一题及其派生分数只算一个信号",
  ]) {
    assert.ok(prompt.includes(text), text);
  }
  assert.equal(prompt.includes("陪它玩、逗它，一起做点什么"), false);
});

test("all A and all C no longer produce the same fallback traits", () => {
  const a = api.buildStableStage1(input(all("a")));
  const c = api.buildStableStage1(input(all("c")));
  assert.ok(traitNames(a).includes("主动亲近"));
  assert.ok(!traitNames(a).includes("安静表达亲近"));
  assert.deepEqual(traitNames(c), ["喜欢自己安排"]);
  assert.notDeepEqual(traitNames(a), traitNames(c));
});

test("one answered question cannot create a two-signal trait, even when it supports two halves", () => {
  for (const version of ["web-v1", "ios-v1"]) {
    for (let i = 0; i < 8; i++)
      for (const choice of ["a", "b", "c"]) {
        assert.deepEqual(
          traitNames(api.buildStableStage1(input({ [i]: choice }, version))),
          [],
          `${version} ${i}:${choice}`,
        );
      }
  }
});

test("compound traits require separate support for both properties", () => {
  assert.ok(!traitNames(api.buildStableStage1(input({ 2: "a", 6: "a" }))).includes("亲近但有边界"));
  assert.ok(!traitNames(api.buildStableStage1(input({ 5: "a", 6: "b" }))).includes("亲近但有边界"));
  assert.ok(traitNames(api.buildStableStage1(input({ 5: "a", 6: "a" }))).includes("亲近但有边界"));
  assert.ok(!traitNames(api.buildStableStage1(input({ 0: "c", 4: "a" }))).includes("好奇但谨慎"));
  assert.ok(!traitNames(api.buildStableStage1(input({ 1: "a", 4: "c" }))).includes("好奇但谨慎"));
  assert.ok(traitNames(api.buildStableStage1(input({ 1: "a", 4: "a" }))).includes("好奇但谨慎"));
  assert.ok(traitNames(api.buildStableStage1(input({ 0: "b", 1: "b" }))).includes("先观察再行动"));
  assert.ok(traitNames(api.buildStableStage1(input({ 3: "b", 7: "b" }))).includes("安静表达亲近"));
});

test("same answer letters resolve into different supported traits for web and iOS", () => {
  const quiz = { 2: "c", 6: "b" };
  assert.ok(traitNames(api.buildStableStage1(input(quiz, "web-v1"))).includes("安静表达亲近"));
  assert.deepEqual(traitNames(api.buildStableStage1(input(quiz))), ["喜欢自己安排"]);
});

test("a video is not automatically turned into an observing-first trait", () => {
  const data = input({ 1: "c", 4: "c" });
  data.videoObservations = [
    {
      containsCat: true,
      summary: "猫直接扑向玩具",
      confidence: "high",
      personalityEvidence: [{ fact: "立即追赶玩具", interpretation: "当下正在玩耍" }],
    },
  ];
  assert.deepEqual(traitNames(api.buildStableStage1(data)), []);
  assert.ok(
    api.stage1Prompt(data, api.buildStableStage1(data).behaviorProfile).includes("猫直接扑向玩具"),
  );
});

test("normalizing empty model traits uses only the corrected evidence-backed fallback", () => {
  const data = input(all("c"));
  const stable = api.buildStableStage1(data);
  const normalized = api.normalizeStage1Output({ coreTraits: [] }, stable, data.profile);
  assert.deepEqual(traitNames(normalized), ["喜欢自己安排"]);
  const empty = input({});
  assert.deepEqual(
    traitNames(
      api.normalizeStage1Output({ coreTraits: [] }, api.buildStableStage1(empty), empty.profile),
    ),
    [],
  );
});

test("all 6,561 full iOS questionnaires have bounded scores and two distinct real references per fallback trait", () => {
  for (let combination = 0; combination < 3 ** 8; combination++) {
    let number = combination;
    const quiz = {};
    for (let i = 0; i < 8; i++) {
      quiz[i] = "abc"[number % 3];
      number = Math.floor(number / 3);
    }
    const behavior = api.buildBehaviorProfile(quiz, "ios-v1");
    assert.ok(Object.values(behavior.confidence).every((score) => score >= 0 && score <= 100));
    const stage = api.buildStableStage1(input(quiz));
    for (const trait of stage.coreTraits) {
      const questions = new Set();
      for (const ref of trait.supportedBy) {
        const [, question, choice] = /^Q([1-8]):([ABC])$/.exec(ref) ?? [];
        assert.ok(question, ref);
        assert.equal(quiz[Number(question) - 1], choice.toLowerCase());
        questions.add(question);
      }
      assert.ok(questions.size >= 2, JSON.stringify({ quiz, trait }));
    }
  }
});

test("previous-result retention and model-selected MBTI remain unchanged", () => {
  const data = input(all("a"));
  const previous = { mbti: "ISFP-A", questionnaireAnswers: all("a") };
  assert.equal(
    api.previousPersonaForIdenticalQuiz({ ...data, previousPersona: previous }),
    previous,
  );
  assert.equal(
    api.previousPersonaForIdenticalQuiz({
      ...input({ ...all("a"), 0: "b" }),
      previousPersona: previous,
    }),
    null,
  );
  assert.equal(api.validatePersonaInput(data).questionnaireVersion, "ios-v1");
  assert.equal(api.validatePersonaInput({ profile: data.profile }).questionnaireVersion, "web-v1");
  const stage1 = api.buildStableStage1(data);
  const fallback = api.buildStableStage3(
    stage1,
    api.buildStableStage2(stage1, data.profile),
    data.profile,
  );
  const normalized = api.normalizeStage3Output(
    { ...plain(fallback), persona: { ...fallback.persona, mbti: "ISFP-T" } },
    fallback,
    data.profile,
  );
  assert.equal(
    normalized.persona.mbti,
    "ISFP-T",
    "Step 3 (MBTI ownership) is deliberately not part of this change",
  );
});
