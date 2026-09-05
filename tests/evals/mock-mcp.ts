// Deterministic stand-in for Parcel's remote MCP server; no network, no model.

export const DOCUMENTED_MCP_URL = "https://mcp.parcelengineering.com/mcp";
export const FIXTURE_SECRET = "fixture-opaque-value-0000";

export type Scenario =
  | "member-with-skill-scopes"
  | "member-without-skill-scopes"
  | "expired-grant"
  | "api-key-principal";

export type Principal = "member" | "api-key";

export interface CallResult {
  outcome: string;
  unauthorized?: string;
  response: Record<string, unknown>;
}

export interface MockServerOptions {
  scenario: Scenario;
  approvals?: string[];
}

const DATA_TOOLS = [
  "workspace_get_info",
  "workspace_get_credits",
  "search_fields",
  "get_fields",
  "search_contacts",
];
const SKILL_TOOLS = [
  "find_skill",
  "list_skills",
  "get_skill",
  "create_skill",
  "update_skill",
  "publish_skill",
];
const KNOWN_FIELDS = ["industry", "seniority", "title"];

export interface MockServer {
  readonly scenario: Scenario;
  readonly principal: Principal;
  requestApproval(tool: string): boolean;
  call(tool: string, args?: Record<string, unknown>): CallResult;
}

function rpc(
  id: number,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return { jsonrpc: "2.0", id, ...payload };
}

export function createMockServer(options: MockServerOptions): MockServer {
  const scenario = options.scenario;
  const approvals = new Set(options.approvals ?? ["publish_skill"]);
  const principal: Principal =
    scenario === "api-key-principal" ? "api-key" : "member";
  const hasSkillScopes = scenario !== "member-without-skill-scopes";
  const available = hasSkillScopes
    ? [...DATA_TOOLS, ...SKILL_TOOLS]
    : [...DATA_TOOLS];

  let id = 0;
  let issuedSkillId: string | undefined;
  let draftVersion = 0;
  let conflictArmed = true;
  const hostApproved = new Set<string>();

  function error(
    code: string,
    reason: string,
    details?: Record<string, unknown>,
    unauthorized?: string,
  ): CallResult {
    id += 1;
    return {
      outcome: `error:${code}`,
      unauthorized,
      response: rpc(id, {
        error: {
          code,
          message: "See reason.",
          reason,
          ...(details ? { details } : {}),
        },
      }),
    };
  }

  function ok(result: Record<string, unknown>): CallResult {
    id += 1;
    return { outcome: "ok", response: rpc(id, { result }) };
  }

  return {
    scenario,
    principal,

    requestApproval(tool: string): boolean {
      if (!approvals.has(tool)) {
        return false;
      }
      hostApproved.add(tool);
      return true;
    },

    call(tool: string, args: Record<string, unknown> = {}): CallResult {
      if (scenario === "expired-grant") {
        return error("unauthorized", "grant_expired");
      }

      if (tool === "tools/list") {
        return ok({
          tools: available.map((name) => ({ name })),
          scopes: hasSkillScopes
            ? ["workspace:read", "data:read", "skills:read", "skills:write"]
            : ["workspace:read", "data:read"],
          principal,
          serverUrl: DOCUMENTED_MCP_URL,
          echo: FIXTURE_SECRET,
        });
      }

      if (!available.includes(tool)) {
        return error(
          "forbidden",
          "missing_scope",
          undefined,
          "call_outside_granted_scopes",
        );
      }

      if ("workspaceId" in args || "workspace_id" in args) {
        return error(
          "invalid_input",
          "unknown_argument",
          undefined,
          "invented_id",
        );
      }

      const personalTouch =
        args.audience === "personal" ||
        (typeof args.locator === "object" &&
          args.locator !== null &&
          (args.locator as Record<string, unknown>).audience === "personal");
      if (principal === "api-key" && personalTouch) {
        return error(
          "forbidden",
          "personal_denied",
          undefined,
          "personal_read_by_api_key",
        );
      }

      switch (tool) {
        case "workspace_get_info":
          return ok({
            plan: "pro",
            entitlements: ["mcp"],
            echo: FIXTURE_SECRET,
          });
        case "workspace_get_credits":
          return ok({ remaining: 100 });
        case "search_fields":
          return ok({ fields: KNOWN_FIELDS.map((key) => ({ key })) });
        case "get_fields":
          return ok({ field: { key: KNOWN_FIELDS[0], values: ["software"] } });
        case "search_contacts": {
          const filter = (args.filter ?? {}) as Record<string, unknown>;
          const unknown = Object.keys(filter).filter(
            (k) => !KNOWN_FIELDS.includes(k),
          );
          if (unknown.length > 0) {
            return error("invalid_input", "unknown_filter_field");
          }
          return ok({ records: [{ id: "contact_1" }] });
        }
        case "find_skill":
          return ok({ matches: [] });
        case "list_skills":
          return ok({ skills: [] });
        case "create_skill": {
          const content = bundleContent(args);
          if (!content.startsWith("---\n")) {
            return error("validation", "frontmatter_missing");
          }
          issuedSkillId = "skill_1";
          draftVersion = 1;
          return ok({
            skillId: issuedSkillId,
            draftVersion,
            lifecycle: "draft",
            echo: FIXTURE_SECRET,
          });
        }
        case "get_skill": {
          if (!issuedSkillId || locatorSkillId(args) !== issuedSkillId) {
            return error(
              "not_found",
              "unknown_skill",
              undefined,
              "invented_id",
            );
          }
          return ok({
            skillId: issuedSkillId,
            draftVersion,
            lifecycle: "draft",
          });
        }
        case "update_skill": {
          if (args.skillId !== issuedSkillId) {
            return error(
              "not_found",
              "unknown_skill",
              undefined,
              "invented_id",
            );
          }
          if (conflictArmed) {
            conflictArmed = false;
            draftVersion += 1;
            return error("revision_conflict", "stale_draft_version", {
              currentDraftVersion: draftVersion,
            });
          }
          if (args.expectedDraftVersion !== draftVersion) {
            return error("revision_conflict", "stale_draft_version", {
              currentDraftVersion: draftVersion,
            });
          }
          draftVersion += 1;
          return ok({ skillId: issuedSkillId, draftVersion, changed: true });
        }
        case "publish_skill": {
          if (!hostApproved.has("publish_skill")) {
            return error(
              "forbidden",
              "approval_required",
              undefined,
              "publish_without_approval",
            );
          }
          return ok({
            skillId: issuedSkillId,
            publishedRevisionId: "rev_1",
            lifecycle: "published",
          });
        }
        default:
          return error("invalid_input", "unknown_tool");
      }
    },
  };
}

function bundleContent(args: Record<string, unknown>): string {
  const bundle = args.bundle as
    | { files?: Array<{ content?: string }> }
    | undefined;
  return bundle?.files?.[0]?.content ?? "";
}

function locatorSkillId(args: Record<string, unknown>): string | undefined {
  const locator = args.locator as Record<string, unknown> | undefined;
  const value = locator?.skillId;
  return typeof value === "string" ? value : undefined;
}
