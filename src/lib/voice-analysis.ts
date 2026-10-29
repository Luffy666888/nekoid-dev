export const VOICE_ANALYSIS_GENERATION_MAX_CHARACTERS = 80;
export const VOICE_ANALYSIS_STORAGE_MAX_CHARACTERS = 100;

type VoiceAnalysis = {
  observation: string;
  personalityInterpretation: string;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function joinVoiceAnalysis(analysis: VoiceAnalysis): string {
  return [analysis.observation, analysis.personalityInterpretation].filter(Boolean).join(" ");
}

// One budget for the entire interpretation, including punctuation and the
// separator. Preserve the two existing fields without cutting Unicode code points.
export function limitVoiceAnalysis(
  analysis: VoiceAnalysis,
  maxCharacters = VOICE_ANALYSIS_STORAGE_MAX_CHARACTERS,
): VoiceAnalysis {
  const observation = Array.from(cleanText(analysis.observation))
    .slice(0, maxCharacters)
    .join("");
  const remaining = Math.max(
    0,
    maxCharacters - Array.from(observation).length - (observation ? 1 : 0),
  );
  return {
    observation,
    personalityInterpretation: Array.from(cleanText(analysis.personalityInterpretation))
      .slice(0, remaining)
      .join(""),
  };
}

export function voiceAnalysisStorageFields(value: unknown) {
  if (typeof value === "string") {
    return {
      analysis:
        Array.from(cleanText(value)).slice(0, VOICE_ANALYSIS_STORAGE_MAX_CHARACTERS).join("") ||
        null,
      analysis_summary: null,
      personality_interpretation: null,
    };
  }
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const analysis = limitVoiceAnalysis({
    observation: cleanText(raw.observation) || cleanText(raw.summary),
    personalityInterpretation: cleanText(raw.personalityInterpretation),
  });
  return {
    analysis: joinVoiceAnalysis(analysis) || null,
    analysis_summary: analysis.observation || null,
    personality_interpretation: analysis.personalityInterpretation || null,
  };
}
