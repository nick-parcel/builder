import { createHash } from "node:crypto";
import type { MockServer } from "./mock-mcp.js";

export interface TranscriptEntry {
  tool: string;
  outcome: string;
  argsFingerprint: string;
  unauthorized?: string;
}

export interface Transcript {
  entries: TranscriptEntry[];
}

export interface PolicyContext {
  server: MockServer;
  // Records the tool name, a normalized outcome code, and a one-way digest of the arguments.
  call(
    tool: string,
    args?: Record<string, unknown>,
  ): { outcome: string; response: Record<string, unknown> };
}

export interface Policy {
  name: string;
  run(ctx: PolicyContext): void;
}

const VALID_BUNDLE = {
  files: [
    {
      path: "SKILL.md",
      mediaType: "text/markdown",
      content:
        "---\nname: sample-skill\ndescription: Use when testing.\n---\n\nBody.\n",
    },
  ],
};
const INVALID_BUNDLE = {
  files: [
    {
      path: "SKILL.md",
      mediaType: "text/markdown",
      content: "Body without frontmatter.\n",
    },
  ],
};

export function runPolicy(policy: Policy, server: MockServer): Transcript {
  const entries: TranscriptEntry[] = [];
  const ctx: PolicyContext = {
    server,
    call(tool, args = {}) {
      const result = server.call(tool, args);
      const entry: TranscriptEntry = {
        tool,
        outcome: result.outcome,
        argsFingerprint: fingerprint(args),
      };
      if (result.unauthorized) {
        entry.unauthorized = result.unauthorized;
      }
      entries.push(entry);
      return { outcome: result.outcome, response: result.response };
    },
  };
  policy.run(ctx);
  return { entries };
}

// Couples the skilled policy to the shipped text: ordered list items name the tools in order.
export function documentedSteps(
  body: string,
  registry: readonly string[],
): string[] {
  const steps: string[] = [];
  for (const line of body.split("\n")) {
    if (!/^\s*\d+\.\s/.test(line)) {
      continue;
    }
    for (const match of line.matchAll(/`([^`]+)`/g)) {
      const token = match[1];
      if (registry.includes(token) && !steps.includes(token)) {
        steps.push(token);
      }
    }
  }
  return steps;
}

export const MCP_TOOL_REGISTRY = [
  "tools/list",
  "workspace_get_info",
  "search_fields",
  "search_contacts",
] as const;

export const AUTHORING_TOOL_REGISTRY = [
  "find_skill",
  "create_skill",
  "get_skill",
  "update_skill",
  "publish_skill",
] as const;

function resultOf(response: Record<string, unknown>): Record<string, unknown> {
  return (response.result ?? {}) as Record<string, unknown>;
}

function detailsOf(response: Record<string, unknown>): Record<string, unknown> {
  const err = (response.error ?? {}) as Record<string, unknown>;
  return (err.details ?? {}) as Record<string, unknown>;
}

export function mcpPolicies(skillBody: string): {
  baseline: Policy;
  skilled: Policy;
} {
  const steps = documentedSteps(skillBody, MCP_TOOL_REGISTRY);

  const baseline: Policy = {
    name: "baseline",
    run(ctx) {
      // Assumes a fixed tool list, invents a workspace id, retries the same call unchanged.
      ctx.call("search_contacts", {
        workspaceId: "ws_guessed",
        filter: { revenue: ">1m" },
      });
      ctx.call("search_contacts", {
        workspaceId: "ws_guessed",
        filter: { revenue: ">1m" },
      });
    },
  };

  const skilled: Policy = {
    name: "skilled",
    run(ctx) {
      let available: string[] = [];
      let field: string | undefined;

      for (const step of steps) {
        if (step === "tools/list") {
          const listed = ctx.call("tools/list", {});
          if (listed.outcome !== "ok") {
            return;
          }
          const tools = (resultOf(listed.response).tools ?? []) as Array<{
            name: string;
          }>;
          available = tools.map((t) => t.name);
          continue;
        }
        if (!available.includes(step)) {
          continue;
        }
        if (step === "search_fields") {
          const found = ctx.call("search_fields", { object: "contacts" });
          const fields = (resultOf(found.response).fields ?? []) as Array<{
            key: string;
          }>;
          field = fields[0]?.key;
          continue;
        }
        if (step === "search_contacts") {
          if (!field) {
            continue;
          }
          ctx.call("search_contacts", { filter: { [field]: "software" } });
          continue;
        }
        ctx.call(step, {});
      }
    },
  };

  return { baseline, skilled };
}

export function authoringPolicies(skillBody: string): {
  baseline: Policy;
  skilled: Policy;
} {
  const steps = documentedSteps(skillBody, AUTHORING_TOOL_REGISTRY);

  const baseline: Policy = {
    name: "baseline",
    run(ctx) {
      // Skips discovery, sends an invalid bundle, overwrites on conflict, publishes unasked.
      ctx.call("create_skill", {
        audience: "personal",
        bundle: INVALID_BUNDLE,
        idempotencyKey: "k1",
      });
      const created = ctx.call("create_skill", {
        audience: "personal",
        bundle: VALID_BUNDLE,
        idempotencyKey: "k1",
      });
      const skillId = resultOf(created.response).skillId as string | undefined;
      if (!skillId) {
        return;
      }
      const conflicted = ctx.call("update_skill", {
        skillId,
        expectedDraftVersion: 1,
        bundle: VALID_BUNDLE,
        idempotencyKey: "k2",
      });
      if (conflicted.outcome.startsWith("error:")) {
        ctx.call("update_skill", {
          skillId,
          expectedDraftVersion: detailsOf(conflicted.response)
            .currentDraftVersion,
          bundle: VALID_BUNDLE,
          idempotencyKey: "k3",
        });
      }
      ctx.call("publish_skill", {
        skillId,
        expectedDraftVersion: 3,
        idempotencyKey: "k4",
      });
    },
  };

  const skilled: Policy = {
    name: "skilled",
    run(ctx) {
      const listed = ctx.call("tools/list", {});
      if (listed.outcome !== "ok") {
        return;
      }
      const listing = resultOf(listed.response);
      const available = ((listing.tools ?? []) as Array<{ name: string }>).map(
        (t) => t.name,
      );
      // An API-key principal may never touch a Personal skill, so keep the work in the workspace.
      const audience =
        listing.principal === "api-key" ? "workspace" : "personal";
      let skillId: string | undefined;
      let draftVersion = 0;

      for (const step of steps) {
        if (!available.includes(step)) {
          continue;
        }
        if (step === "find_skill") {
          ctx.call("find_skill", { query: "sample" });
          continue;
        }
        if (step === "create_skill") {
          const created = ctx.call("create_skill", {
            audience,
            bundle: VALID_BUNDLE,
            idempotencyKey: "<unique-key>",
          });
          const result = resultOf(created.response);
          skillId = result.skillId as string | undefined;
          draftVersion = (result.draftVersion as number | undefined) ?? 0;
          continue;
        }
        if (step === "get_skill") {
          if (!skillId) {
            continue;
          }
          const read = ctx.call("get_skill", {
            locator: { source: "custom", skillId, view: "draft" },
          });
          draftVersion =
            (resultOf(read.response).draftVersion as number | undefined) ??
            draftVersion;
          continue;
        }
        if (step === "update_skill") {
          if (!skillId) {
            continue;
          }
          const updated = ctx.call("update_skill", {
            skillId,
            expectedDraftVersion: draftVersion,
            bundle: VALID_BUNDLE,
            idempotencyKey: "<unique-key>",
          });
          if (updated.outcome === "error:revision_conflict") {
            // Re-read the draft before reapplying; never resend the old body against a new version.
            const reread = ctx.call("get_skill", {
              locator: { source: "custom", skillId, view: "draft" },
            });
            draftVersion =
              (resultOf(reread.response).draftVersion as number | undefined) ??
              draftVersion;
            const retried = ctx.call("update_skill", {
              skillId,
              expectedDraftVersion: draftVersion,
              bundle: VALID_BUNDLE,
              idempotencyKey: "<unique-key>",
            });
            draftVersion =
              (resultOf(retried.response).draftVersion as number | undefined) ??
              draftVersion;
            continue;
          }
          draftVersion =
            (resultOf(updated.response).draftVersion as number | undefined) ??
            draftVersion;
          continue;
        }
        if (step === "publish_skill") {
          if (!skillId || !ctx.server.requestApproval("publish_skill")) {
            continue;
          }
          ctx.call("publish_skill", {
            skillId,
            expectedDraftVersion: draftVersion,
            idempotencyKey: "<unique-key>",
          });
        }
      }
    },
  };

  return { baseline, skilled };
}

// One-way digest so a repeated call is detectable without recording any argument value.
function fingerprint(args: Record<string, unknown>): string {
  return createHash("sha256")
    .update(stableStringify(args))
    .digest("hex")
    .slice(0, 8);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
