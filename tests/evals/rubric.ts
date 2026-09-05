import type { Transcript } from "./policies.js";

export interface RubricScore {
  orderScore: number;
  unauthorizedCalls: number;
  conflictsResolved: boolean;
  errorsExplained: boolean;
  explainedErrors: number;
}

const RECOVERY_READS = [
  "tools/list",
  "get_skill",
  "workspace_get_info",
  "search_fields",
];

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

  const errorEntries = entries.filter((e) => e.outcome.startsWith("error:"));
  const explainedErrors = errorEntries.filter(
    (e) => e.explained === true,
  ).length;
  const errorsExplained = explainedErrors === errorEntries.length;

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
    errorsExplained,
    explainedErrors,
  };
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
