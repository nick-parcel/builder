import { promises as fs } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

export interface SkillFinding {
  path: string;
  rule: string;
}

export interface ParsedSkill {
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface Skill extends ParsedSkill {
  slug: string;
  files: string[];
}

export const PORTABLE_FRONTMATTER_KEYS = [
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
] as const;

export const VISIBILITY_FLAGS = [
  "claude-plugin",
  "parcel-explore",
  "parcel-installable",
  "parcel-runtime",
] as const;

const EXTERNAL_ONLY_VISIBILITY: Record<string, boolean> = {
  "claude-plugin": true,
  "parcel-explore": false,
  "parcel-installable": false,
  "parcel-runtime": false,
};

const DELIMITER = /^---[ \t]*$/;
const ALIAS_PATTERN = /(^|\s)[&*][A-Za-z0-9_-]+/;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const ALLOWED_FILE_EXTENSIONS = new Set([".md", ".json", ".txt"]);
const MARKDOWN_LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

const MAX_NAME_CHARS = 64;
const MAX_DESCRIPTION_CHARS = 512;
const MAX_COMPATIBILITY_CHARS = 500;
const MAX_SKILL_BYTES = 12 * 1024;

const BODY_RULES: Array<{ rule: string; pattern: RegExp }> = [
  { rule: "skill_body_shebang", pattern: /^#!/m },
  {
    rule: "skill_body_dynamic_injection",
    pattern: /\$\{CLAUDE_[A-Z_]+\}|\$ARGUMENTS|!`/,
  },
  {
    rule: "skill_body_active_html",
    pattern:
      /<script|<iframe|<object|<embed|<link\s|<meta\s+http-equiv|<form|\son[a-z]+\s*=|javascript:/i,
  },
  {
    rule: "skill_body_credential_shape",
    pattern:
      /-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|(sk|rk)_live_[A-Za-z0-9]{10,}|AIza[0-9A-Za-z_-]{30,}|sk-(ant|proj)-[A-Za-z0-9_-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}/,
  },
  {
    rule: "skill_body_local_path",
    pattern:
      /(^|[\s"'(`])(~\/|\/(Users|home|etc|var|tmp|opt|root)\/|[A-Za-z]:\\)/m,
  },
  {
    rule: "skill_body_mutable_github_fetch",
    pattern:
      /raw\.githubusercontent\.com|github\.com\/[^\s)]+\/(raw|blob)\/(main|master)\//,
  },
  {
    rule: "skill_body_permission_claim",
    pattern: /grants? (you )?(permission|access|authority)/i,
  },
  { rule: "skill_body_em_dash", pattern: /\u2014/ },
  { rule: "skill_body_crlf", pattern: /\r/ },
];

export function parseFrontmatter(content: string): ParsedSkill {
  const lines = content.split("\n");
  if (lines.length === 0 || !DELIMITER.test(lines[0])) {
    throw new Error("SKILL.md must open with a --- delimiter on line 1");
  }
  const closing = lines.findIndex(
    (line, index) => index > 0 && DELIMITER.test(line),
  );
  if (closing === -1) {
    throw new Error("SKILL.md frontmatter is not closed by a --- delimiter");
  }
  const raw = lines.slice(1, closing).join("\n");
  if (ALIAS_PATTERN.test(raw)) {
    throw new Error(
      "SKILL.md frontmatter must not use YAML anchors or aliases",
    );
  }
  const parsed = parseYaml(raw, { strict: true });
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("SKILL.md frontmatter must be a YAML map");
  }
  return {
    frontmatter: parsed as Record<string, unknown>,
    body: lines.slice(closing + 1).join("\n"),
  };
}

async function listFiles(dir: string, prefix = ""): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path.join(dir, entry.name), rel)));
    } else {
      files.push(rel);
    }
  }
  return files;
}

export async function readSkill(dir: string): Promise<Skill> {
  const content = await fs.readFile(path.join(dir, "SKILL.md"), "utf8");
  const parsed = parseFrontmatter(content);
  return {
    slug: path.basename(dir),
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    files: await listFiles(dir),
  };
}

function toSnakeCase(key: string): string {
  return key
    .replace(/[-\s]+/g, "_")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

function checkFrontmatter(
  slug: string,
  frontmatter: Record<string, unknown>,
  reportPath: string,
  findings: SkillFinding[],
): void {
  const allowed = new Set<string>(PORTABLE_FRONTMATTER_KEYS);
  for (const key of Object.keys(frontmatter)) {
    if (!allowed.has(key)) {
      findings.push({
        path: reportPath,
        rule: `skill_frontmatter_unexpected_key_${toSnakeCase(key)}`,
      });
    }
  }
  for (const key of PORTABLE_FRONTMATTER_KEYS) {
    if (!(key in frontmatter)) {
      findings.push({
        path: reportPath,
        rule: `skill_frontmatter_missing_key_${toSnakeCase(key)}`,
      });
    }
  }

  const name = frontmatter.name;
  if (typeof name !== "string" || !SLUG_PATTERN.test(name)) {
    findings.push({ path: reportPath, rule: "skill_name_pattern_invalid" });
  } else {
    if (name.length > MAX_NAME_CHARS) {
      findings.push({ path: reportPath, rule: "skill_name_too_long" });
    }
    if (name !== slug) {
      findings.push({ path: reportPath, rule: "skill_name_dir_mismatch" });
    }
  }

  const description = frontmatter.description;
  if (typeof description !== "string" || description.length === 0) {
    findings.push({ path: reportPath, rule: "skill_description_invalid" });
  } else if (description.length > MAX_DESCRIPTION_CHARS) {
    findings.push({ path: reportPath, rule: "skill_description_too_long" });
  }

  if ("license" in frontmatter && frontmatter.license !== "Apache-2.0") {
    findings.push({ path: reportPath, rule: "skill_license_invalid" });
  }

  const compatibility = frontmatter.compatibility;
  if ("compatibility" in frontmatter) {
    if (typeof compatibility !== "string") {
      findings.push({ path: reportPath, rule: "skill_compatibility_invalid" });
    } else if (compatibility.length > MAX_COMPATIBILITY_CHARS) {
      findings.push({ path: reportPath, rule: "skill_compatibility_too_long" });
    }
  }

  checkParcelMetadata(frontmatter.metadata, reportPath, findings);
}

function checkParcelMetadata(
  metadata: unknown,
  reportPath: string,
  findings: SkillFinding[],
): void {
  if (typeof metadata !== "object" || metadata === null) {
    findings.push({ path: reportPath, rule: "skill_metadata_parcel_missing" });
    return;
  }
  const parcel = (metadata as Record<string, unknown>).parcel;
  if (typeof parcel !== "object" || parcel === null) {
    findings.push({ path: reportPath, rule: "skill_metadata_parcel_missing" });
    return;
  }
  const parcelObj = parcel as Record<string, unknown>;

  if (parcelObj["schema-version"] !== 1) {
    findings.push({
      path: reportPath,
      rule: "skill_metadata_schema_version_invalid",
    });
  }

  const version = parcelObj.version;
  if (typeof version !== "string" || !SEMVER_PATTERN.test(version)) {
    findings.push({
      path: reportPath,
      rule: "skill_metadata_version_not_semver",
    });
  }

  const visibility = parcelObj.visibility;
  if (typeof visibility !== "object" || visibility === null) {
    findings.push({ path: reportPath, rule: "skill_visibility_missing" });
    return;
  }
  const flags = visibility as Record<string, unknown>;
  for (const flag of VISIBILITY_FLAGS) {
    if (!(flag in flags)) {
      findings.push({
        path: reportPath,
        rule: `skill_visibility_missing_flag_${toSnakeCase(flag)}`,
      });
      continue;
    }
    if (flags[flag] !== EXTERNAL_ONLY_VISIBILITY[flag]) {
      findings.push({
        path: reportPath,
        rule: `skill_visibility_flag_value_${toSnakeCase(flag)}`,
      });
    }
  }
  for (const flag of Object.keys(flags)) {
    if (!(VISIBILITY_FLAGS as readonly string[]).includes(flag)) {
      findings.push({
        path: reportPath,
        rule: `skill_visibility_unexpected_flag_${toSnakeCase(flag)}`,
      });
    }
  }
}

function checkContent(
  content: string,
  reportPath: string,
  findings: SkillFinding[],
): void {
  for (const { rule, pattern } of BODY_RULES) {
    if (pattern.test(content)) {
      findings.push({ path: reportPath, rule });
    }
  }
}

function checkLinks(
  content: string,
  reportPath: string,
  files: Set<string>,
  findings: SkillFinding[],
): void {
  for (const match of content.matchAll(MARKDOWN_LINK)) {
    const target = match[1].split("#")[0];
    if (
      target.length === 0 ||
      /^[a-z][a-z0-9+.-]*:/i.test(target) ||
      target.startsWith("//")
    ) {
      continue;
    }
    const normalized = target.replace(/^\.\//, "");
    if (!files.has(normalized)) {
      findings.push({
        path: reportPath,
        rule: "skill_missing_referenced_file",
      });
    }
  }
}

export async function validateSkillDir(dir: string): Promise<SkillFinding[]> {
  const findings: SkillFinding[] = [];
  const slug = path.basename(dir);
  const skillMd = path.join(dir, "SKILL.md");
  const reportPath = `${slug}/SKILL.md`;

  let content: string;
  try {
    content = await fs.readFile(skillMd, "utf8");
  } catch {
    return [{ path: reportPath, rule: "skill_missing_skill_md" }];
  }

  if (!SLUG_PATTERN.test(slug)) {
    findings.push({ path: reportPath, rule: "skill_dir_slug_invalid" });
  }
  if (Buffer.byteLength(content, "utf8") > MAX_SKILL_BYTES) {
    findings.push({ path: reportPath, rule: "skill_file_too_large" });
  }

  let parsed: ParsedSkill | undefined;
  try {
    parsed = parseFrontmatter(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    findings.push({
      path: reportPath,
      rule: /anchors or aliases/.test(message)
        ? "skill_frontmatter_yaml_alias"
        : "skill_frontmatter_invalid",
    });
  }

  if (parsed) {
    checkFrontmatter(slug, parsed.frontmatter, reportPath, findings);
  }

  const files = await listFiles(dir);
  const fileSet = new Set(files);
  for (const file of files) {
    const filePath = `${slug}/${file}`;
    if (!ALLOWED_FILE_EXTENSIONS.has(path.extname(file).toLowerCase())) {
      findings.push({ path: filePath, rule: "skill_file_forbidden_extension" });
      continue;
    }
    const fileContent =
      file === "SKILL.md"
        ? content
        : await fs.readFile(path.join(dir, file), "utf8");
    checkContent(fileContent, filePath, findings);
    checkLinks(fileContent, filePath, fileSet, findings);
  }

  return findings;
}
