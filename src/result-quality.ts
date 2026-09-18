/**
 * TypeSafe Score for run result quality (PLAN B8 augmentation).
 *
 * When TYPESAFE_API_KEY is set, evaluateResultQuality scores a completed run
 * against four ordered levels so callers can surface quality signals beyond a
 * binary exit-code check. Falls closed on any HTTP or parse error — the run
 * record is never silently upgraded. No SDK dependency; uses the same raw
 * fetch pattern as evaluateRunWhenTypeSafe in src/automations.ts.
 */

export const TYPESAFE_SYSTEMONE_URL_RQ = "https://api.typesafe.ai/v1/systemone";

/** Four ordered quality levels, low to high. */
export const QUALITY_LEVELS = [
  "complete failure: nothing was accomplished; errors throughout",
  "partial with errors: some progress but significant failures or broken code",
  "partial success: mostly correct with minor issues or incomplete steps",
  "full success: task completed correctly and completely",
] as const;

export type QualityLevel = (typeof QUALITY_LEVELS)[number];

/** 0 = complete failure, 3 = full success (index into QUALITY_LEVELS). */
export interface ResultQuality {
  /** Score value in [0, 3]. Probability-weighted position across levels. */
  score: number;
  /** Confidence in [0, 1] summarising distribution concentration. */
  confidence: number;
  /** Human-readable level name closest to the score. */
  level: QualityLevel;
}

/** Pluggable fetch for tests. */
export type QualityFetchImpl = (input: string | URL, init?: RequestInit) => Promise<Response>;

function readScoreBody(raw: unknown): { score: number; confidence: number } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const answers = (raw as { answers?: unknown }).answers;
  if (typeof answers !== "object" || answers === null) return null;
  const quality = (answers as { quality?: unknown }).quality;
  if (typeof quality !== "object" || quality === null) return null;
  const q = quality as { score?: unknown; confidence?: unknown };
  const score = typeof q.score === "number" && Number.isFinite(q.score) ? q.score : null;
  const confidence =
    typeof q.confidence === "number" && Number.isFinite(q.confidence) ? q.confidence : 0;
  if (score === null) return null;
  return { score, confidence };
}

function levelFromScore(score: number): QualityLevel {
  const idx = Math.max(0, Math.min(QUALITY_LEVELS.length - 1, Math.round(score)));
  return QUALITY_LEVELS[idx];
}

/**
 * Score a run result summary using TypeSafe Score.
 * Returns null when the API key is absent, on HTTP errors, or on parse failures.
 * Callers must treat null as "unknown quality" and not as success or failure.
 */
export async function evaluateResultQuality(
  apiKey: string,
  runSummary: string,
  fetchImpl: QualityFetchImpl = fetch,
): Promise<ResultQuality | null> {
  const key = apiKey.trim();
  if (!key) return null;
  try {
    const response = await fetchImpl(TYPESAFE_SYSTEMONE_URL_RQ, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        state: { summary: runSummary },
        model: "jev-latest",
        questions: {
          quality: {
            type: "score",
            instructions:
              "How completely and correctly did the coding agent complete the task described in `summary`?",
            criteria: QUALITY_LEVELS,
          },
        },
      }),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const parsed = readScoreBody(body);
    if (!parsed) return null;
    return {
      score: parsed.score,
      confidence: parsed.confidence,
      level: levelFromScore(parsed.score),
    };
  } catch {
    return null;
  }
}

