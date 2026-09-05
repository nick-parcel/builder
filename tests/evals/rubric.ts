import type { Transcript, TranscriptEntry } from "./policies.js";

export interface RubricScore {
  orderScore: number;
  unauthorizedCalls: number;
  conflictsResolved: boolean;
  errorsHandled: boolean;
  errorCount: number;
}

const RECOVERY_READS = [
  "tools/list",
  "get_skill",
  "workspace_get_info",
  "search_fields",
];
// A refusal is terminal: the documented handling is to report it and stop.
const STOP_CODES = ["error:unauthorized", "error:forbidden"];

export function scoreTranscript(
  transcript: Transcript,
  expectedOrder: readonly string[],
): RubricScore {
  const entries = transcript.entries;

  // Longest run of the documented steps that appears in the transcript in order.
  const matched = longestOrderedMatch(
    entries.map((e) => e.tool),
    expectedOrder,
  );
  const orderScore =
    expectedOrder.length === 0 ? 1 : matched / expectedOrder.length;

  const unauthorizedCalls = entries.filter(
    (e) => e.unauthorized !== undefined,
  ).length;

  const errorIndexes = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.outcome.startsWith("error:"));

  const errorsHandled = errorIndexes.every(({ entry, index }) =>
    handledError(entries, entry, index),
  );

  // A retried call counts as resolved only when a read happened between the failure and the retry.
  let conflictsResolved = true;
  for (let i = 0; i < entries.length; i += 1) {
    if (!entries[i].outcome.startsWith("error:")) {
      continue;
    }
    const retryIndex = entries.findIndex(
      (e, j) => j > i && e.tool === entries[i].tool,
    );
    if (retryIndex === -1) {
      continue;
    }
    const recovered = entries
      .slice(i + 1, retryIndex)
      .some((e) => RECOVERY_READS.includes(e.tool) && e.outcome === "ok");
    if (!recovered) {
      conflictsResolved = false;
    }
  }

  return {
    orderScore,
    unauthorizedCalls,
    conflictsResolved,
    errorsHandled,
    errorCount: errorIndexes.length,
  };
}

// Observed from the transcript alone: no unchanged retry, and only a documented follow-up.
function handledError(
  entries: TranscriptEntry[],
  failure: TranscriptEntry,
  index: number,
): boolean {
  const unchangedRetry = entries.some(
    (e, j) =>
      j > index &&
      e.tool === failure.tool &&
      e.argsFingerprint === failure.argsFingerprint,
  );
  if (unchangedRetry) {
    return false;
  }

  const next = entries[index + 1];

  if (STOP_CODES.includes(failure.outcome)) {
    return next === undefined;
  }

  if (failure.outcome === "error:revision_conflict") {
    return (
      next !== undefined && next.tool === "get_skill" && next.outcome === "ok"
    );
  }

  if (next === undefined) {
    return true;
  }
  return RECOVERY_READS.includes(next.tool) || next.tool === failure.tool;
}

function longestOrderedMatch(
  actual: string[],
  expected: readonly string[],
): number {
  let table: number[] = new Array(expected.length + 1).fill(0);
  for (const tool of actual) {
    const previous = table;
    table = new Array(expected.length + 1).fill(0);
    for (let j = 1; j <= expected.length; j += 1) {
      table[j] =
        tool === expected[j - 1]
          ? previous[j - 1] + 1
          : Math.max(previous[j], table[j - 1]);
    }
  }
  return table[expected.length];
}
