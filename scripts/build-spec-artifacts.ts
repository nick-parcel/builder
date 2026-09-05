import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { parseFrontmatter, readSkill } from "./read-skill.js";
import { type Finding, validateRepository } from "./validate.js";

export const SPEC_REPOSITORY = "nick-parcel/parcel-skills";

// Parity with Parcel's SKILL_FORMAT_LIMITS so an imported bundle never exceeds them.
export const SPEC_LIMITS = {
  files: 25,
  fileBytes: 102_400,
  bundleBytes: 512_000,
} as const;

export type SpecFileMediaType =
  | "text/markdown"
  | "text/plain"
  | "application/json";

export interface ParcelSkillVisibility {
  claudePlugin: boolean;
  parcelExplore: boolean;
  parcelInstallable: boolean;
  parcelRuntime: boolean;
}

export interface SpecSkillFileV1 {
  path: string;
  mediaType: SpecFileMediaType;
  content: string;
  sha256: string;
  bytes: number;
}

export interface SpecSkillArtifactV1 {
  schemaVersion: 1;
  repository: typeof SPEC_REPOSITORY;
  commit: string;
  releaseTag: string;
  pluginVersion: string;
  sourcePath: string;
  skill: {
    slug: string;
    version: string;
    name: string;
    description: string;
    compatibility: string | null;
    visibility: ParcelSkillVisibility;
    instructions: string;
    skillMd: {
      content: string;
      sha256: string;
      bytes: number;
    };
    files: readonly SpecSkillFileV1[];
    sha256: string;
    bytes: number;
  };
}

export interface SpecSkillCatalogEntryV1 {
  slug: string;
  version: string;
  artifactPath: string;
  sha256: string;
  visibility: ParcelSkillVisibility;
}

export interface SpecSkillCatalogV1 {
  schemaVersion: 1;
  repository: typeof SPEC_REPOSITORY;
  commit: string;
  releaseTag: string;
  pluginVersion: string;
  skills: readonly SpecSkillCatalogEntryV1[];
}

export interface BuildSpecArtifactsInput {
  root: string;
  outDir: string;
  sourceCommit: string;
  releaseTag: string;
  pluginVersion: string;
  skipGitChecks?: boolean;
  force?: boolean;
}

export interface BuildResult {
  outDir: string;
  catalog: SpecSkillCatalogV1;
  artifacts: readonly SpecSkillArtifactV1[];
  files: readonly string[];
  checksums: readonly { path: string; sha256: string }[];
  catalogSha256: string;
}

export interface ArtifactContext {
  commit: string;
  releaseTag: string;
  pluginVersion: string;
}

export interface SkillSourceInput {
  slug: string;
  skillMd: string;
  files: readonly { path: string; content: string }[];
}

export class SpecBuildError extends Error {
  readonly rule: string;
  readonly findings: readonly Finding[];

  constructor(rule: string, detail: string, findings: readonly Finding[] = []) {
    super(`${rule}: ${detail}`);
    this.name = "SpecBuildError";
    this.rule = rule;
    this.findings = findings;
  }
}

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const LEADING_BLANK_LINES = /^(?:[^\S\n]*\n)*/;
const ROOT_PATH = "SKILL.md";

const MEDIA_TYPES: Record<string, SpecFileMediaType> = {
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".txt": "text/plain",
  ".json": "application/json",
};

const VISIBILITY_KEYS: readonly [keyof ParcelSkillVisibility, string][] = [
  ["claudePlugin", "claude-plugin"],
  ["parcelExplore", "parcel-explore"],
  ["parcelInstallable", "parcel-installable"],
  ["parcelRuntime", "parcel-runtime"],
];

function sha256Hex(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

function sha256Bytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function utf8Bytes(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n?/g, "\n");
}

/** Code point order, which differs from JS string order above the BMP. */
function compareCodePoints(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const leftPoint = left[index]?.codePointAt(0) ?? 0;
    const rightPoint = right[index]?.codePointAt(0) ?? 0;
    if (leftPoint !== rightPoint) return leftPoint - rightPoint;
  }
  return left.length - right.length;
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function assertUniqueSlugs(slugs: readonly string[]): void {
  const seen = new Set<string>();
  const folded = new Map<string, string>();
  for (const slug of slugs) {
    if (seen.has(slug)) {
      throw new SpecBuildError("skill_duplicate_slug", slug);
    }
    seen.add(slug);
    const fold = slug.toLowerCase();
    const previous = folded.get(fold);
    if (previous !== undefined) {
      throw new SpecBuildError(
        "skill_slug_case_collision",
        `${previous} and ${slug}`,
      );
    }
    folded.set(fold, slug);
  }
}

function readVisibility(
  slug: string,
  parcel: Record<string, unknown>,
): ParcelSkillVisibility {
  const raw = parcel.visibility;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new SpecBuildError("spec_skill_visibility_invalid", slug);
  }
  const flags = raw as Record<string, unknown>;
  const visibility = {} as ParcelSkillVisibility;
  for (const [camel, kebab] of VISIBILITY_KEYS) {
    const value = flags[kebab];
    if (typeof value !== "boolean") {
      throw new SpecBuildError(
        "spec_skill_visibility_invalid",
        `${slug} ${kebab}`,
      );
    }
    visibility[camel] = value;
  }
  return visibility;
}

function mediaTypeFor(slug: string, filePath: string): SpecFileMediaType {
  const mediaType = MEDIA_TYPES[path.extname(filePath).toLowerCase()];
  if (mediaType === undefined) {
    throw new SpecBuildError(
      "spec_file_unknown_media_type",
      `${slug}/${filePath}`,
    );
  }
  return mediaType;
}

/** Pure projection from source text to the published artifact shape. */
export function projectSkillArtifact(
  source: SkillSourceInput,
  context: ArtifactContext,
): SpecSkillArtifactV1 {
  const { slug } = source;
  const skillMdContent = normalizeLineEndings(source.skillMd);
  const skillMdBytes = utf8Bytes(skillMdContent);
  if (skillMdBytes > SPEC_LIMITS.fileBytes) {
    throw new SpecBuildError("spec_skill_md_too_large", slug);
  }

  let parsed: ReturnType<typeof parseFrontmatter>;
  try {
    parsed = parseFrontmatter(skillMdContent);
  } catch (err) {
    throw new SpecBuildError(
      "spec_skill_frontmatter_invalid",
      `${slug}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const frontmatter = parsed.frontmatter;
  const name = frontmatter.name;
  if (typeof name !== "string" || name !== slug) {
    throw new SpecBuildError("spec_skill_name_slug_mismatch", slug);
  }
  const description = frontmatter.description;
  if (typeof description !== "string" || description.trim().length === 0) {
    throw new SpecBuildError("spec_skill_description_invalid", slug);
  }
  const rawCompatibility = frontmatter.compatibility;
  if (rawCompatibility !== undefined && typeof rawCompatibility !== "string") {
    throw new SpecBuildError("spec_skill_compatibility_invalid", slug);
  }

  const metadata = frontmatter.metadata;
  const parcel =
    typeof metadata === "object" && metadata !== null
      ? (metadata as Record<string, unknown>).parcel
      : undefined;
  if (typeof parcel !== "object" || parcel === null || Array.isArray(parcel)) {
    throw new SpecBuildError("spec_skill_metadata_missing", slug);
  }
  const parcelMap = parcel as Record<string, unknown>;
  if (parcelMap["schema-version"] !== 1) {
    throw new SpecBuildError("spec_skill_schema_version_invalid", slug);
  }
  const version = parcelMap.version;
  if (typeof version !== "string" || !SEMVER_PATTERN.test(version)) {
    throw new SpecBuildError("spec_skill_version_not_semver", slug);
  }
  const visibility = readVisibility(slug, parcelMap);

  const supportingInputs = source.files.filter(
    (file) => file.path !== ROOT_PATH,
  );
  if (supportingInputs.length > SPEC_LIMITS.files) {
    throw new SpecBuildError("spec_skill_too_many_files", slug);
  }

  const files: SpecSkillFileV1[] = supportingInputs
    .map((file) => {
      const content = normalizeLineEndings(file.content);
      const bytes = utf8Bytes(content);
      if (bytes > SPEC_LIMITS.fileBytes) {
        throw new SpecBuildError("spec_file_too_large", `${slug}/${file.path}`);
      }
      return {
        path: file.path,
        mediaType: mediaTypeFor(slug, file.path),
        content,
        sha256: sha256Hex(content),
        bytes,
      };
    })
    .sort((left, right) => compareCodePoints(left.path, right.path));

  const totalBytes = files.reduce(
    (sum, file) => sum + file.bytes,
    skillMdBytes,
  );
  if (totalBytes > SPEC_LIMITS.bundleBytes) {
    throw new SpecBuildError("spec_bundle_too_large", slug);
  }

  const skillMdSha256 = sha256Hex(skillMdContent);
  const canonical = `${skillMdSha256}\n${JSON.stringify(
    files.map(({ path: filePath, mediaType, bytes, sha256 }) => ({
      path: filePath,
      mediaType,
      bytes,
      sha256,
    })),
  )}`;

  return {
    schemaVersion: 1,
    repository: SPEC_REPOSITORY,
    commit: context.commit,
    releaseTag: context.releaseTag,
    pluginVersion: context.pluginVersion,
    sourcePath: `plugin/skills/${slug}`,
    skill: {
      slug,
      version,
      name,
      description: description.trim(),
      compatibility: rawCompatibility ?? null,
      visibility,
      instructions: parsed.body.replace(LEADING_BLANK_LINES, ""),
      skillMd: {
        content: skillMdContent,
        sha256: skillMdSha256,
        bytes: skillMdBytes,
      },
      files,
      sha256: sha256Hex(canonical),
      bytes: totalBytes,
    },
  };
}

function git(root: string, args: string[]): string {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" });
  } catch (err) {
    throw new SpecBuildError(
      "git_unavailable",
      `git ${args.join(" ")}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function readJsonFile(
  filePath: string,
): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as Record<
      string,
      unknown
    >;
  } catch (err) {
    throw new SpecBuildError(
      "manifest_unreadable",
      `${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function assertVersionsAgree(
  root: string,
  pluginVersion: string,
): Promise<void> {
  const plugin = await readJsonFile(
    path.join(root, "plugin", ".claude-plugin", "plugin.json"),
  );
  if (plugin.version !== pluginVersion) {
    throw new SpecBuildError(
      "plugin_version_mismatch",
      `plugin.json ${String(plugin.version)} != ${pluginVersion}`,
    );
  }
  const marketplace = await readJsonFile(
    path.join(root, ".claude-plugin", "marketplace.json"),
  );
  const plugins = marketplace.plugins;
  const entry = Array.isArray(plugins)
    ? (plugins[0] as Record<string, unknown> | undefined)
    : undefined;
  if (!entry || entry.version !== pluginVersion) {
    throw new SpecBuildError(
      "marketplace_version_mismatch",
      `marketplace ${String(entry?.version)} != ${pluginVersion}`,
    );
  }
}

async function prepareOutDir(outDir: string, force: boolean): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(outDir);
  } catch {
    await fs.mkdir(outDir, { recursive: true });
    return;
  }
  if (entries.length === 0) return;
  if (!force) {
    throw new SpecBuildError("output_dir_not_empty", outDir);
  }
  await fs.rm(path.join(outDir, "catalog.json"), { force: true });
  await fs.rm(path.join(outDir, "SHA256SUMS"), { force: true });
  await fs.rm(path.join(outDir, "skills"), { recursive: true, force: true });
}

async function loadSkillSources(root: string): Promise<SkillSourceInput[]> {
  const skillsRoot = path.join(root, "plugin", "skills");
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(skillsRoot, { withFileTypes: true });
  } catch {
    throw new SpecBuildError("skills_dir_missing", "plugin/skills");
  }
  const slugs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => compareCodePoints(left, right));
  assertUniqueSlugs(slugs);

  const sources: SkillSourceInput[] = [];
  for (const slug of slugs) {
    const dir = path.join(skillsRoot, slug);
    const skill = await readSkill(dir);
    const files: { path: string; content: string }[] = [];
    for (const relative of skill.files) {
      if (relative === ROOT_PATH) continue;
      files.push({
        path: relative,
        content: await fs.readFile(path.join(dir, relative), "utf8"),
      });
    }
    sources.push({
      slug,
      skillMd: await fs.readFile(path.join(dir, ROOT_PATH), "utf8"),
      files,
    });
  }
  return sources;
}

export async function buildSpecArtifacts(
  input: BuildSpecArtifactsInput,
): Promise<BuildResult> {
  const { root, outDir, sourceCommit, releaseTag, pluginVersion } = input;

  if (!COMMIT_PATTERN.test(sourceCommit)) {
    throw new SpecBuildError("source_commit_invalid", sourceCommit);
  }
  if (!SEMVER_PATTERN.test(pluginVersion)) {
    throw new SpecBuildError("plugin_version_not_semver", pluginVersion);
  }
  if (releaseTag !== `v${pluginVersion}`) {
    throw new SpecBuildError(
      "release_tag_mismatch",
      `${releaseTag} != v${pluginVersion}`,
    );
  }

  if (!input.skipGitChecks) {
    const status = git(root, ["status", "--porcelain"]).trim();
    if (status.length > 0) {
      throw new SpecBuildError("source_tree_dirty", status.split("\n")[0]);
    }
    const head = git(root, ["rev-parse", "HEAD"]).trim();
    if (head !== sourceCommit) {
      throw new SpecBuildError(
        "source_commit_mismatch",
        `${head} != ${sourceCommit}`,
      );
    }
  }

  await assertVersionsAgree(root, pluginVersion);

  const report = await validateRepository(root);
  if (!report.ok) {
    const first = report.findings[0];
    throw new SpecBuildError(
      first.rule,
      `${first.path} (${report.findings.length} finding(s))`,
      report.findings,
    );
  }

  const context: ArtifactContext = {
    commit: sourceCommit,
    releaseTag,
    pluginVersion,
  };
  const sources = await loadSkillSources(root);
  const artifacts = sources
    .map((source) => projectSkillArtifact(source, context))
    .sort((left, right) =>
      compareCodePoints(left.skill.slug, right.skill.slug),
    );

  const catalog: SpecSkillCatalogV1 = {
    schemaVersion: 1,
    repository: SPEC_REPOSITORY,
    commit: sourceCommit,
    releaseTag,
    pluginVersion,
    skills: artifacts.map((artifact) => ({
      slug: artifact.skill.slug,
      version: artifact.skill.version,
      artifactPath: `skills/${artifact.skill.slug}.${artifact.skill.sha256}.json`,
      sha256: artifact.skill.sha256,
      visibility: artifact.skill.visibility,
    })),
  };

  await prepareOutDir(outDir, input.force === true);
  await fs.mkdir(path.join(outDir, "skills"), { recursive: true });

  const written: { path: string; bytes: Buffer }[] = [
    {
      path: "catalog.json",
      bytes: Buffer.from(canonicalJson(catalog), "utf8"),
    },
  ];
  for (const artifact of artifacts) {
    written.push({
      path: `skills/${artifact.skill.slug}.${artifact.skill.sha256}.json`,
      bytes: Buffer.from(canonicalJson(artifact), "utf8"),
    });
  }
  written.sort((left, right) => compareCodePoints(left.path, right.path));

  for (const file of written) {
    await fs.writeFile(path.join(outDir, file.path), file.bytes);
  }

  const checksums = written.map((file) => ({
    path: file.path,
    sha256: sha256Bytes(file.bytes),
  }));
  const sums = `${checksums
    .map((entry) => `${entry.sha256}  ${entry.path}`)
    .join("\n")}\n`;
  await fs.writeFile(path.join(outDir, "SHA256SUMS"), sums, "utf8");

  return {
    outDir,
    catalog,
    artifacts,
    files: [...written.map((file) => file.path), "SHA256SUMS"].sort(),
    checksums,
    catalogSha256:
      checksums.find((entry) => entry.path === "catalog.json")?.sha256 ?? "",
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    console.error(`${name} is required`);
    process.exit(1);
  }
  return value.trim();
}

async function main(): Promise<void> {
  const root = process.cwd();
  const outDir = path.join(root, "dist", "spec");
  const result = await buildSpecArtifacts({
    root,
    outDir,
    sourceCommit: requireEnv("SOURCE_COMMIT"),
    releaseTag: requireEnv("RELEASE_TAG"),
    pluginVersion: requireEnv("PLUGIN_VERSION"),
    force: process.argv.includes("--force"),
  });
  for (const entry of result.checksums) {
    console.log(`${entry.sha256}  ${entry.path}`);
  }
  console.log(`wrote ${result.files.length} file(s) to dist/spec`);
}

const isMain = process.argv[1]
  ? import.meta.url === `file://${process.argv[1]}`
  : false;
if (isMain) {
  main().catch((err) => {
    if (err instanceof SpecBuildError) {
      console.error(err.message);
      for (const finding of err.findings) {
        console.error(`  ${finding.rule}: ${finding.path}`);
      }
    } else {
      console.error(err);
    }
    process.exit(1);
  });
}
