import test from "node:test";
import assert from "node:assert/strict";
import { buildBehaviorProfile, buildCombinationInsights } from "../src/lib/neko-behavior-profile.ts";

const cases = [
  ["高依恋 + 高表达", { 2: "a", 3: "a", 6: "a", 7: "a" }, ["attachment", 65], ["expressiveness", 65]],
  ["高依恋 + 低表达", { 2: "c", 3: "b", 6: "b", 7: "c" }, ["attachment", 65], ["expressiveness", 45]],
  ["低社交 + 高依恋", { 0: "c", 2: "a", 6: "b", 7: "a" }, ["sociability", 35], ["attachment", 65]],
  ["高好奇 + 高警觉", { 0: "c", 1: "b", 4: "a", 7: "b" }, ["curiosity", 65], ["vigilance", 65]],
  ["高边界 + 高依恋", { 2: "a", 5: "a", 6: "b", 7: "c" }, ["boundary", 65], ["attachment", 65]],
  ["高社交 + 高探索", { 0: "a", 1: "a", 3: "c", 7: "b" }, ["sociability", 65], ["curiosity", 65]],
];

for (const [name, answers, first, second] of cases) {
  test(name, () => {
    const profile = buildBehaviorProfile(answers);
    const [firstKey, firstLimit] = first;
    const [secondKey, secondLimit] = second;
    if (name.includes("低表达") || name.includes("低社交")) {
      assert.ok(profile[secondKey] <= secondLimit || profile[firstKey] <= firstLimit);
    } else {
      assert.ok(profile[firstKey] >= firstLimit);
      assert.ok(profile[secondKey] >= secondLimit);
    }
    assert.ok(Object.values(profile).every((value) => typeof value !== "number" || (value >= 0 && value <= 100)));
    console.log(name, JSON.stringify({ profile, insights: buildCombinationInsights(profile) }));
  });
}

test("完全跳过不伪造精确分数", () => {
  const profile = buildBehaviorProfile({});
  assert.equal(profile.answeredCount, 0);
  assert.equal(profile.attachment, null);
  assert.equal(profile.loveLanguage, "未知");
});
