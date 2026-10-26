export type QuestionnaireAnswers = Record<string, "a" | "b" | "c">;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** null is unknown; {} is a known snapshot with every question unanswered. */
export function parseQuestionnaireAnswers(value: unknown): QuestionnaireAnswers | null {
  const raw = record(value);
  if (!raw) return null;
  const answers: QuestionnaireAnswers = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!/^\d+$/.test(key)) return null;
    if (value === null || value === undefined) continue;
    const answer = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (answer !== "a" && answer !== "b" && answer !== "c") return null;
    answers[key] = answer;
  }
  return answers;
}

export function storedPersonaQuestionnaireAnswers(input: unknown): QuestionnaireAnswers | null {
  const raw = record(input);
  if (!raw) return null;
  if ("questionnaireAnswers" in raw) return parseQuestionnaireAnswers(raw.questionnaireAnswers);
  return parseQuestionnaireAnswers(record(raw.profile)?.quiz);
}

export function personaQuestionnaireAnswers(value: unknown): QuestionnaireAnswers | null {
  const persona = record(value);
  if (!persona) return null;
  if ("questionnaireAnswers" in persona) return parseQuestionnaireAnswers(persona.questionnaireAnswers);
  const generation = record(persona.generation);
  if (generation && "questionnaireAnswers" in generation)
    return parseQuestionnaireAnswers(generation.questionnaireAnswers);
  return storedPersonaQuestionnaireAnswers(generation?.rawInputs);
}

/** Keep the snapshot with its persona, not the separately editable cat profile. */
export function personaGenerationInputForStorage(value: unknown): Record<string, unknown> {
  const generation = record(record(value)?.generation);
  return {
    ...record(generation?.rawInputs),
    questionnaireAnswers: personaQuestionnaireAnswers(value),
  };
}
