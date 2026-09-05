import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { validateSkillDir } from "./read-skill.js";

export interface Finding {
  path: string;
  rule: string;
}

export interface ValidationReport {
  ok: boolean;
  findings: Finding[];
}

const PRODUCTION_MCP_URL = "https://mcp.parcelengineering.com/mcp";
const ALLOWED_EXTENSIONS = new Set([".md", ".json", ".txt"]);
const FORBIDDEN_PLUGIN_ENTRIES = new Set([
  "package.json",
  "node_modules",
  "bin",
  "hooks",
  "agents",
  "commands",
  "workflows",
  "scripts",
  ".lsp.json",
]);

const AuthorSchema = z
  .object({
    name: z.string(),
    email: z.string().optional(),
    url: z.string().optional(),
  })
  .strict();

const PluginManifestSchema = z
  .object({
    name: z.string(),
    displayName: z.string().optional(),
    version: z.string().optional(),
    description: z.string().optional(),
    author: AuthorSchema.optional(),
    homepage: z.string().optional(),
    repository: z.string().optional(),
    license: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    defaultEnabled: z.boolean().optional(),
  })
  .strict();

const ALLOWED_PLUGIN_KEYS = new Set(Object.keys(PluginManifestSchema.shape));

const MarketplaceOwnerSchema = z
  .object({
    name: z.string(),
    email: z.string().optional(),
    url: z.string().optional(),
  })
  .strict();

const SOURCE_PATTERN = /^\.\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

const MarketplacePluginEntrySchema = z
  .object({
    name: z.string(),
    source: z.string(),
    displayName: z.string().optional(),
    description: z.string().optional(),
    version: z.string().optional(),
    author: z.record(z.string(), z.unknown()).optional(),
    homepage: z.string().optional(),
    repository: z.string().optional(),
    license: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    strict: z.boolean().optional(),
    relevance: z.number().optional(),
    defaultEnabled: z.boolean().optional(),
  })
  .strict();

const ALLOWED_MARKETPLACE_ENTRY_KEYS = new Set(
  Object.keys(MarketplacePluginEntrySchema.shape),
);

const MarketplaceManifestSchema = z
  .object({
    $schema: z.string().optional(),
    name: z.string(),
    owner: MarketplaceOwnerSchema,
    description: z.string().optional(),
    version: z.string().optional(),
    metadata: z
      .object({
        pluginRoot: z.string().optional(),
        description: z.string().optional(),
        version: z.string().optional(),
      })
      .strict()
      .optional(),
    allowCrossMarketplaceDependenciesOn: z.array(z.string()).optional(),
    renames: z.record(z.string(), z.unknown()).optional(),
    plugins: z.array(z.unknown()),
  })
  .strict();

const ALLOWED_MARKETPLACE_KEYS = new Set(
  Object.keys(MarketplaceManifestSchema.shape),
);

const McpServerSchema = z
  .object({
    type: z.literal("http"),
    url: z.string(),
  })
  .strict();

const ALLOWED_MCP_SERVER_KEYS = new Set(Object.keys(McpServerSchema.shape));

const McpManifestSchema = z
  .object({
    mcpServers: z.record(z.string(), z.unknown()),
  })
  .strict();

const ALLOWED_MCP_ROOT_KEYS = new Set(Object.keys(McpManifestSchema.shape));

const SECRET_PATTERNS: Array<{ rule: string; pattern: RegExp }> = [
  { rule: "secret_aws_access_key", pattern: /AKIA[0-9A-Z]{16}/ },
  { rule: "secret_github_token", pattern: /gh[pousr]_[A-Za-z0-9]{36,}/ },
  { rule: "secret_generic_sk_token", pattern: /sk-[A-Za-z0-9]{20,}/ },
  { rule: "secret_bearer_token", pattern: /Bearer [A-Za-z0-9._-]{20,}/ },
  {
    rule: "secret_pem_private_key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  },
  {
    rule: "secret_generic_credential",
    pattern: /(api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"]{8,}['"]/i,
  },
];

function toSnakeCase(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function toRelative(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join("/");
}

async function readJson(
  filePath: string,
): Promise<{ value: unknown; error?: string }> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return { value: JSON.parse(raw) };
  } catch (err) {
    return {
      value: undefined,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function checkForbiddenKeys(
  obj: Record<string, unknown>,
  allowedKeys: Set<string>,
  rulePrefix: string,
  reportPath: string,
  findings: Finding[],
): void {
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      findings.push({
        path: reportPath,
        rule: `${rulePrefix}_${toSnakeCase(key)}`,
      });
    }
  }
}

async function validateMarketplace(
  root: string,
  findings: Finding[],
): Promise<void> {
  const marketplacePath = path.join(root, ".claude-plugin", "marketplace.json");
  const reportPath = toRelative(root, marketplacePath);
  const { value, error } = await readJson(marketplacePath);
  if (error || typeof value !== "object" || value === null) {
    findings.push({
      path: reportPath,
      rule: "marketplace_file_missing_or_invalid",
    });
    return;
  }

  const obj = value as Record<string, unknown>;
  checkForbiddenKeys(
    obj,
    ALLOWED_MARKETPLACE_KEYS,
    "marketplace_forbidden_key",
    reportPath,
    findings,
  );

  const parsed = MarketplaceManifestSchema.safeParse(obj);
  if (!parsed.success) {
    findings.push({ path: reportPath, rule: "marketplace_schema_invalid" });
    return;
  }

  const plugins = parsed.data.plugins;
  if (!Array.isArray(plugins) || plugins.length !== 1) {
    findings.push({ path: reportPath, rule: "marketplace_plugin_count" });
  }

  for (const rawEntry of Array.isArray(plugins) ? plugins : []) {
    if (typeof rawEntry !== "object" || rawEntry === null) {
      findings.push({
        path: reportPath,
        rule: "marketplace_plugin_entry_invalid",
      });
      continue;
    }
    const entry = rawEntry as Record<string, unknown>;
    checkForbiddenKeys(
      entry,
      ALLOWED_MARKETPLACE_ENTRY_KEYS,
      "marketplace_plugin_forbidden_key",
      reportPath,
      findings,
    );

    const source = entry.source;
    if (typeof source !== "string") {
      if (source && typeof source === "object" && "command" in source) {
        findings.push({
          path: reportPath,
          rule: "marketplace_source_command_forbidden",
        });
      } else if (source && typeof source === "object" && "archive" in source) {
        findings.push({
          path: reportPath,
          rule: "marketplace_source_archive_forbidden",
        });
      } else {
        findings.push({
          path: reportPath,
          rule: "marketplace_source_invalid_type",
        });
      }
      continue;
    }

    if (source.includes("..") || !SOURCE_PATTERN.test(source)) {
      findings.push({
        path: reportPath,
        rule: "marketplace_source_pattern_invalid",
      });
      continue;
    }

    const resolved = path.resolve(root, source);
    const rootResolved = path.resolve(root);
    if (
      !resolved.startsWith(rootResolved + path.sep) &&
      resolved !== rootResolved
    ) {
      findings.push({
        path: reportPath,
        rule: "marketplace_source_escapes_repo",
      });
      continue;
    }

    try {
      const realResolved = await fs.realpath(resolved);
      const realRoot = await fs.realpath(rootResolved);
      if (
        !realResolved.startsWith(realRoot + path.sep) &&
        realResolved !== realRoot
      ) {
        findings.push({
          path: reportPath,
          rule: "marketplace_source_escapes_repo",
        });
      }
    } catch {
      findings.push({ path: reportPath, rule: "marketplace_source_missing" });
    }
  }
}

async function validatePluginManifest(
  root: string,
  findings: Finding[],
): Promise<void> {
  const pluginJsonPath = path.join(
    root,
    "plugin",
    ".claude-plugin",
    "plugin.json",
  );
  const reportPath = toRelative(root, pluginJsonPath);
  const { value, error } = await readJson(pluginJsonPath);
  if (error || typeof value !== "object" || value === null) {
    findings.push({ path: reportPath, rule: "plugin_file_missing_or_invalid" });
    return;
  }

  const obj = value as Record<string, unknown>;
  checkForbiddenKeys(
    obj,
    ALLOWED_PLUGIN_KEYS,
    "plugin_forbidden_key",
    reportPath,
    findings,
  );

  const parsed = PluginManifestSchema.safeParse(obj);
  if (!parsed.success) {
    findings.push({ path: reportPath, rule: "plugin_schema_invalid" });
  }
}

async function validateMcpManifest(
  root: string,
  findings: Finding[],
): Promise<void> {
  const mcpPath = path.join(root, "plugin", ".mcp.json");
  const reportPath = toRelative(root, mcpPath);
  const { value, error } = await readJson(mcpPath);
  if (error || typeof value !== "object" || value === null) {
    findings.push({ path: reportPath, rule: "mcp_file_missing_or_invalid" });
    return;
  }

  const obj = value as Record<string, unknown>;
  checkForbiddenKeys(
    obj,
    ALLOWED_MCP_ROOT_KEYS,
    "mcp_forbidden_key",
    reportPath,
    findings,
  );

  const parsed = McpManifestSchema.safeParse(obj);
  if (!parsed.success) {
    findings.push({ path: reportPath, rule: "mcp_schema_invalid" });
    return;
  }

  const servers = parsed.data.mcpServers as Record<string, unknown>;
  const serverNames = Object.keys(servers);
  if (serverNames.length > 1) {
    findings.push({ path: reportPath, rule: "mcp_multiple_servers" });
  }
  if (!serverNames.includes("parcel")) {
    findings.push({ path: reportPath, rule: "mcp_missing_parcel_server" });
    return;
  }

  const server = servers.parcel;
  if (typeof server !== "object" || server === null) {
    findings.push({ path: reportPath, rule: "mcp_server_invalid" });
    return;
  }
  const serverObj = server as Record<string, unknown>;
  checkForbiddenKeys(
    serverObj,
    ALLOWED_MCP_SERVER_KEYS,
    "mcp_forbidden_key",
    reportPath,
    findings,
  );

  if (serverObj.type !== "http") {
    findings.push({ path: reportPath, rule: "mcp_type_invalid" });
  }
  if (serverObj.url !== PRODUCTION_MCP_URL) {
    findings.push({ path: reportPath, rule: "mcp_url_mismatch" });
  }
}

async function scanForSecrets(
  root: string,
  filePath: string,
  findings: Finding[],
): Promise<void> {
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch {
    return;
  }
  const reportPath = toRelative(root, filePath);
  for (const { rule, pattern } of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      findings.push({ path: reportPath, rule });
    }
  }
}

const SKILL_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function isValidSkillLocation(segments: string[]): boolean {
  if (segments.length !== 3) {
    return false;
  }
  const [skillsDir, slug, fileName] = segments;
  return (
    skillsDir === "skills" &&
    fileName === "SKILL.md" &&
    SKILL_SLUG_PATTERN.test(slug)
  );
}

async function walkPlugin(root: string, findings: Finding[]): Promise<void> {
  const pluginRoot = path.join(root, "plugin");
  let stat: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    stat = await fs.lstat(pluginRoot);
  } catch {
    findings.push({ path: "plugin", rule: "plugin_root_missing" });
    return;
  }
  // A symlinked or non-directory root would skip every content check below.
  if (!stat.isDirectory()) {
    findings.push({ path: "plugin", rule: "plugin_root_invalid" });
    return;
  }

  async function walk(dir: string, segments: string[]): Promise<void> {
    const entries = await fs.readdir(dir);

    if (
      segments.length === 2 &&
      segments[0] === "skills" &&
      !entries.includes("SKILL.md")
    ) {
      findings.push({
        path: toRelative(root, dir),
        rule: "skill_missing_skill_md",
      });
    }

    for (const name of entries) {
      const fullPath = path.join(dir, name);
      const entrySegments = [...segments, name];
      const reportPath = toRelative(root, fullPath);

      if (name.includes("..")) {
        findings.push({ path: reportPath, rule: "path_traversal" });
        continue;
      }

      if (name === "SKILL.md" && !isValidSkillLocation(entrySegments)) {
        findings.push({ path: reportPath, rule: "skill_location" });
      }

      if (segments.length === 0 && FORBIDDEN_PLUGIN_ENTRIES.has(name)) {
        findings.push({ path: reportPath, rule: "path_forbidden_entry" });
        continue;
      }

      if (
        segments.length === 1 &&
        segments[0] === ".claude-plugin" &&
        name !== "plugin.json"
      ) {
        findings.push({
          path: reportPath,
          rule: "plugin_manifest_dir_extra_entry",
        });
        continue;
      }

      const entryStat = await fs.lstat(fullPath);

      if (entryStat.isSymbolicLink()) {
        findings.push({ path: reportPath, rule: "path_symlink" });
        continue;
      }

      if (entryStat.isDirectory()) {
        await walk(fullPath, entrySegments);
        continue;
      }

      if (entryStat.isFile()) {
        if (entryStat.mode & 0o111) {
          findings.push({ path: reportPath, rule: "path_executable" });
          continue;
        }

        const ext = path.extname(name).toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) {
          findings.push({ path: reportPath, rule: "path_forbidden_extension" });
          continue;
        }
        await scanForSecrets(root, fullPath, findings);
      }
    }
  }

  await walk(pluginRoot, []);
}

// Every plugin/skills/<slug> directory must satisfy the portable skill format.
async function validateSkills(
  root: string,
  findings: Finding[],
): Promise<void> {
  const skillsRoot = path.join(root, "plugin", "skills");
  let entries: string[];
  try {
    entries = await fs.readdir(skillsRoot);
  } catch {
    return;
  }
  const dirEntries: string[] = [];
  for (const entry of entries.sort()) {
    const skillDir = path.join(skillsRoot, entry);
    const stat = await fs.lstat(skillDir);
    if (stat.isDirectory()) {
      dirEntries.push(entry);
    }
  }
  // Report case-folded directory collisions before per-dir checks, so a
  // structural naming clash is not masked by an individual slug finding.
  const folded = new Map<string, string>();
  for (const entry of dirEntries) {
    const fold = entry.toLowerCase();
    const previous = folded.get(fold);
    if (previous !== undefined) {
      findings.push({
        path: `plugin/skills/${previous} and ${entry}`,
        rule: "skill_slug_case_collision",
      });
    } else {
      folded.set(fold, entry);
    }
  }
  for (const entry of dirEntries) {
    const skillDir = path.join(skillsRoot, entry);
    for (const finding of await validateSkillDir(skillDir)) {
      findings.push({
        path: `plugin/skills/${finding.path}`,
        rule: finding.rule,
      });
    }
  }
}

export async function validateRepository(
  root: string,
): Promise<ValidationReport> {
  const findings: Finding[] = [];

  await validateMarketplace(root, findings);
  await validateSkills(root, findings);
  await validatePluginManifest(root, findings);
  await validateMcpManifest(root, findings);
  await walkPlugin(root, findings);

  return { ok: findings.length === 0, findings };
}

async function main(): Promise<void> {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  const report = await validateRepository(root);
  for (const finding of report.findings) {
    console.error(`${finding.rule}: ${finding.path}`);
  }
  if (!report.ok) {
    console.error(`${report.findings.length} issue(s) found`);
    process.exit(1);
  } else {
    console.log("Repository validation passed");
  }
}

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
