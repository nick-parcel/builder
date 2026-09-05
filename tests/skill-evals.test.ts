import path from "node:path";
import { describe, expect, it } from "vitest";
import { readSkill } from "../scripts/read-skill.js";
import {
  DOCUMENTED_MCP_URL,
  FIXTURE_SECRET,
  createMockServer,
} from "./evals/mock-mcp.js";
import {
  authoringPolicies,
  documentedSteps,
  mcpPolicies,
  runPolicy,
} from "./evals/policies.js";
import { scoreTranscript } from "./evals/rubric.js";

const skillsRoot = path.resolve(__dirname, "..", "plugin", "skills");

const SKILLED_MIN_ORDER_SCORE = 1;
const BASELINE_MAX_ORDER_SCORE = 0.6;
const SKILLED_MAX_UNAUTHORIZED = 0;
const BASELINE_MIN_UNAUTHORIZED = 1;
const MAX_TRANSCRIPT_ENTRIES = 12;
const MIN_MEASURED_ERRORS = 1;

const MCP_EXPECTED_ORDER = [
  "tools/list",
  "workspace_get_info",
  "search_fields",
  "search_contacts",
];
const AUTHORING_EXPECTED_ORDER = [
  "find_skill",
  "create_skill",
  "get_skill",
  "update_skill",
  "publish_skill",
];

async function bodyOf(slug: string): Promise<string> {
  return (await readSkill(path.join(skillsRoot, slug))).body;
}

describe("using-parcel-mcp eval", () => {
  it("derives the skilled policy steps from the shipped SKILL.md", async () => {
    const steps = documentedSteps(
      await bodyOf("using-parcel-mcp"),
      MCP_EXPECTED_ORDER,
    );
    expect(steps).toEqual(MCP_EXPECTED_ORDER);
  });

  it("skilled beats baseline on every rubric dimension", async () => {
    const body = await bodyOf("using-parcel-mcp");
    const { baseline, skilled } = mcpPolicies(body);

    const baselineScore = scoreTranscript(
      runPolicy(
        baseline,
        createMockServer({ scenario: "member-with-skill-scopes" }),
      ),
      MCP_EXPECTED_ORDER,
    );
    const skilledScore = scoreTranscript(
      runPolicy(
        skilled,
        createMockServer({ scenario: "member-with-skill-scopes" }),
      ),
      MCP_EXPECTED_ORDER,
    );

    expect(skilledScore.orderScore).toBeGreaterThan(baselineScore.orderScore);
    expect(skilledScore.unauthorizedCalls).toBeLessThan(
      baselineScore.unauthorizedCalls,
    );
    expect(skilledScore.conflictsResolved).toBe(true);
    expect(baselineScore.conflictsResolved).toBe(false);
    expect(skilledScore.errorsHandled).toBe(true);
    expect(baselineScore.errorsHandled).toBe(false);

    expect(skilledScore.orderScore).toBeGreaterThanOrEqual(
      SKILLED_MIN_ORDER_SCORE,
    );
    expect(baselineScore.orderScore).toBeLessThanOrEqual(
      BASELINE_MAX_ORDER_SCORE,
    );
    expect(skilledScore.unauthorizedCalls).toBe(SKILLED_MAX_UNAUTHORIZED);
    expect(baselineScore.unauthorizedCalls).toBeGreaterThanOrEqual(
      BASELINE_MIN_UNAUTHORIZED,
    );
  });

  it("explains an expired grant and a missing skill scope instead of retrying", async () => {
    const body = await bodyOf("using-parcel-mcp");
    const { skilled } = mcpPolicies(body);
    const expired = runPolicy(
      skilled,
      createMockServer({ scenario: "expired-grant" }),
    );
    expect(expired.entries.map((e) => e.outcome)).toContain(
      "error:unauthorized",
    );
    expect(scoreTranscript(expired, MCP_EXPECTED_ORDER).errorsHandled).toBe(
      true,
    );
    expect(scoreTranscript(expired, MCP_EXPECTED_ORDER).unauthorizedCalls).toBe(
      0,
    );
    expect(
      scoreTranscript(expired, MCP_EXPECTED_ORDER).errorCount,
    ).toBeGreaterThanOrEqual(MIN_MEASURED_ERRORS);
    // Stopping is what makes it handled: one more call after the refusal fails the dimension.
    expect(
      scoreTranscript(
        {
          entries: [
            ...expired.entries,
            {
              tool: "search_contacts",
              outcome: "ok",
              argsFingerprint: "00000000",
            },
          ],
        },
        MCP_EXPECTED_ORDER,
      ).errorsHandled,
    ).toBe(false);

    const noScopes = runPolicy(
      skilled,
      createMockServer({ scenario: "member-without-skill-scopes" }),
    );
    expect(
      scoreTranscript(noScopes, MCP_EXPECTED_ORDER).unauthorizedCalls,
    ).toBe(0);
  });
});

describe("create-skill eval", () => {
  it("derives the skilled policy steps from the shipped SKILL.md", async () => {
    const steps = documentedSteps(
      await bodyOf("create-skill"),
      AUTHORING_EXPECTED_ORDER,
    );
    expect(steps).toEqual(AUTHORING_EXPECTED_ORDER);
  });

  it("skilled beats baseline on every rubric dimension", async () => {
    const body = await bodyOf("create-skill");
    const { baseline, skilled } = authoringPolicies(body);

    const baselineScore = scoreTranscript(
      runPolicy(
        baseline,
        createMockServer({ scenario: "member-with-skill-scopes" }),
      ),
      AUTHORING_EXPECTED_ORDER,
    );
    const skilledScore = scoreTranscript(
      runPolicy(
        skilled,
        createMockServer({ scenario: "member-with-skill-scopes" }),
      ),
      AUTHORING_EXPECTED_ORDER,
    );

    expect(skilledScore.orderScore).toBeGreaterThan(baselineScore.orderScore);
    expect(skilledScore.unauthorizedCalls).toBeLessThan(
      baselineScore.unauthorizedCalls,
    );
    expect(skilledScore.conflictsResolved).toBe(true);
    expect(baselineScore.conflictsResolved).toBe(false);
    expect(skilledScore.errorsHandled).toBe(true);
    expect(baselineScore.errorsHandled).toBe(false);
    // Both runs really meet a refusal here, so errorsHandled is measured, not vacuous.
    expect(skilledScore.errorCount).toBeGreaterThanOrEqual(MIN_MEASURED_ERRORS);
    expect(baselineScore.errorCount).toBeGreaterThanOrEqual(
      MIN_MEASURED_ERRORS,
    );

    expect(skilledScore.orderScore).toBeGreaterThanOrEqual(
      SKILLED_MIN_ORDER_SCORE,
    );
    expect(baselineScore.orderScore).toBeLessThanOrEqual(
      BASELINE_MAX_ORDER_SCORE,
    );
    expect(skilledScore.unauthorizedCalls).toBe(SKILLED_MAX_UNAUTHORIZED);
    expect(baselineScore.unauthorizedCalls).toBeGreaterThanOrEqual(
      BASELINE_MIN_UNAUTHORIZED,
    );
  });

  it("publishes only after the host approves that call", async () => {
    const body = await bodyOf("create-skill");
    const { skilled, baseline } = authoringPolicies(body);

    const withoutApproval = runPolicy(
      skilled,
      createMockServer({ scenario: "member-with-skill-scopes", approvals: [] }),
    );
    expect(withoutApproval.entries.map((e) => e.tool)).not.toContain(
      "publish_skill",
    );

    const baselineRun = runPolicy(
      baseline,
      createMockServer({ scenario: "member-with-skill-scopes", approvals: [] }),
    );
    expect(
      baselineRun.entries.filter(
        (e) => e.unauthorized === "publish_without_approval",
      ),
    ).toHaveLength(1);
  });

  it("never reads a Personal skill as an API-key principal", async () => {
    const body = await bodyOf("create-skill");
    const { skilled } = authoringPolicies(body);
    const run = runPolicy(
      skilled,
      createMockServer({ scenario: "api-key-principal" }),
    );
    expect(
      scoreTranscript(run, AUTHORING_EXPECTED_ORDER).unauthorizedCalls,
    ).toBe(0);
    expect(run.entries.map((e) => e.outcome)).not.toContain("error:forbidden");
  });

  it("recovers from a revision conflict by re-reading, never by blind overwrite", async () => {
    const body = await bodyOf("create-skill");
    const { skilled, baseline } = authoringPolicies(body);
    const server = createMockServer({
      scenario: "member-with-skill-scopes",
      approvals: ["publish_skill"],
    });
    const skilledRun = runPolicy(skilled, server);
    expect(skilledRun.entries.map((e) => e.outcome)).toContain(
      "error:revision_conflict",
    );
    expect(
      scoreTranscript(skilledRun, AUTHORING_EXPECTED_ORDER).conflictsResolved,
    ).toBe(true);

    const baselineRun = runPolicy(
      baseline,
      createMockServer({ scenario: "member-with-skill-scopes" }),
    );
    expect(
      scoreTranscript(baselineRun, AUTHORING_EXPECTED_ORDER).conflictsResolved,
    ).toBe(false);
  });
});

describe("transcript recorder", () => {
  const scenarios = [
    "member-with-skill-scopes",
    "member-without-skill-scopes",
    "expired-grant",
    "api-key-principal",
  ] as const;

  it("records only tool names and normalized outcome codes", async () => {
    const mcpBody = await bodyOf("using-parcel-mcp");
    const authoringBody = await bodyOf("create-skill");
    const policies = [
      ...Object.values(mcpPolicies(mcpBody)),
      ...Object.values(authoringPolicies(authoringBody)),
    ];

    for (const scenario of scenarios) {
      for (const policy of policies) {
        const transcript = runPolicy(
          policy,
          createMockServer({ scenario, approvals: ["publish_skill"] }),
        );
        expect(transcript.entries.length).toBeLessThanOrEqual(
          MAX_TRANSCRIPT_ENTRIES,
        );

        for (const entry of transcript.entries) {
          expect(Object.keys(entry).sort()).toEqual(
            ["argsFingerprint", "outcome", "tool", "unauthorized"]
              .filter((k) => k in entry)
              .sort(),
          );
          expect(entry.outcome).toMatch(/^(ok|error:[a-z_]+|blocked:[a-z_]+)$/);
          expect(entry.argsFingerprint).toMatch(/^[0-9a-f]{8}$/);
        }

        const serialized = JSON.stringify(transcript);
        expect(serialized).not.toContain(FIXTURE_SECRET);
        expect(serialized).not.toMatch(/prompt|Draft the|user said/i);
        for (const url of serialized.match(/https?:\/\/[^"\\ ]+/g) ?? []) {
          expect(url).toBe(DOCUMENTED_MCP_URL);
        }
      }
    }
  });
});
