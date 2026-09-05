import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import {
  SPEC_REPOSITORY,
  SpecBuildError,
  buildSpecArtifacts,
} from "./build-spec-artifacts.js";

export interface VerifyFinding {
  path: string;
  rule: string;
}

export interface VerifyResult {
  ok: boolean;
  findings: VerifyFinding[];
}

export interface CheckGeneratedInput {
  root: string;
  sourceCommit: string;
  releaseTag: string;
  pluginVersion: string;
  skipGitChecks?: boolean;
}

export interface CheckGeneratedResult {
  reproducible: boolean;
  mismatches: string[];
  catalogSha256: string;
  verify: VerifyResult;
}

const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const RELEASE_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SUM_LINE = /^([0-9a-f]{64}) {2}(.+)$/;

const VisibilitySchema = z
  .object({
    claudePlugin: z.boolean(),
    parcelExplore: z.boolean(),
    parcelInstallable: z.boolean(),
    parcelRuntime: z.boolean(),
  })
  .strict();

const HeaderSchema = {
  schemaVersion: z.literal(1),
  repository: z.literal(SPEC_REPOSITORY),
  commit: z.string().regex(COMMIT),
  releaseTag: z.string().regex(RELEASE_TAG),
  pluginVersion: z.string().regex(SEMVER),
};

export const SpecSkillCatalogSchema = z
  .object({
    ...HeaderSchema,
    skills: z.array(
      z
        .object({
          slug: z.string(),
          version: z.string().regex(SEMVER),
          artifactPath: z.string(),
          sha256: z.string().regex(SHA256),
          visibility: VisibilitySchema,
        })
        .strict(),
    ),
  })
  .strict();

export const SpecSkillArtifactSchema = z
  .object({
    ...HeaderSchema,
    sourcePath: z.string(),
    skill: z
      .object({
        slug: z.string(),
        version: z.string().regex(SEMVER),
        name: z.string(),
        description: z.string(),
        compatibility: z.string().nullable(),
        visibility: VisibilitySchema,
        instructions: z.string(),
        skillMd: z
          .object({
            content: z.string(),
            sha256: z.string().regex(SHA256),
            bytes: z.number().int().nonnegative(),
          })
          .strict(),
        files: z.array(
          z
            .object({
              path: z.string(),
              mediaType: z.enum([
                "text/markdown",
                "text/plain",
                "application/json",
              ]),
              content: z.string(),
              sha256: z.string().regex(SHA256),
              bytes: z.number().int().nonnegative(),
            })
            .strict(),
        ),
        sha256: z.string().regex(SHA256),
        bytes: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

function sha256Text(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

function sha256Bytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function listFiles(dir: string, prefix = ""): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...(await listFiles(path.join(dir, entry.name), rel)));
    } else {
      out.push(rel);
    }
  }
  return out.sort();
}

export async function computeCatalogSha256(dir: string): Promise<string> {
  return sha256Bytes(await fs.readFile(path.join(dir, "catalog.json")));
}

// Byte digests are checked before any JSON is parsed, so tampering can never reach a parser.
export async function verifySpecArtifacts(dir: string): Promise<VerifyResult> {
  const findings: VerifyFinding[] = [];
  const done = () => ({ ok: findings.length === 0, findings });

  let manifest: string;
  try {
    manifest = await fs.readFile(path.join(dir, "SHA256SUMS"), "utf8");
  } catch {
    findings.push({ path: "SHA256SUMS", rule: "sha256sums_missing" });
    return done();
  }
  if (!manifest.endsWith("\n") || manifest.endsWith("\n\n")) {
    findings.push({ path: "SHA256SUMS", rule: "sha256sums_not_canonical" });
  }

  const listed = new Map<string, string>();
  for (const line of manifest.trimEnd().split("\n")) {
    const match = SUM_LINE.exec(line);
    if (!match) {
      findings.push({ path: "SHA256SUMS", rule: "sha256sums_line_invalid" });
      return done();
    }
    if (listed.has(match[2])) {
      findings.push({ path: match[2], rule: "sha256sums_duplicate_path" });
      return done();
    }
    listed.set(match[2], match[1]);
  }
  const listedPaths = [...listed.keys()];
  if ([...listedPaths].sort().join("\n") !== listedPaths.join("\n")) {
    findings.push({ path: "SHA256SUMS", rule: "sha256sums_not_sorted" });
  }
  if (!listed.has("catalog.json")) {
    findings.push({ path: "catalog.json", rule: "catalog_not_listed" });
  }

  const present = (await listFiles(dir)).filter(
    (file) => file !== "SHA256SUMS",
  );
  for (const file of present) {
    if (!listed.has(file)) {
      findings.push({ path: file, rule: "unlisted_file" });
    }
  }
  for (const file of listedPaths) {
    if (!present.includes(file)) {
      findings.push({ path: file, rule: "missing_file" });
    }
  }
  if (findings.length > 0) return done();

  const contents = new Map<string, string>();
  for (const [file, expected] of listed) {
    const bytes = await fs.readFile(path.join(dir, file));
    if (sha256Bytes(bytes) !== expected) {
      findings.push({ path: file, rule: "checksum_mismatch" });
      continue;
    }
    contents.set(file, bytes.toString("utf8"));
  }
  if (findings.length > 0) return done();

  const parseCanonical = (file: string): unknown => {
    const raw = contents.get(file) as string;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      findings.push({ path: file, rule: `${kindOf(file)}_json_invalid` });
      return undefined;
    }
    if (`${JSON.stringify(parsed, null, 2)}\n` !== raw) {
      findings.push({ path: file, rule: "json_not_canonical" });
    }
    return parsed;
  };

  const catalogValue = parseCanonical("catalog.json");
  const catalogParsed = SpecSkillCatalogSchema.safeParse(catalogValue);
  if (!catalogParsed.success) {
    findings.push({ path: "catalog.json", rule: "catalog_schema_invalid" });
    return done();
  }
  const catalog = catalogParsed.data;

  const artifactPaths = listedPaths.filter((file) =>
    file.startsWith("skills/"),
  );
  const entriesByPath = new Map(
    catalog.skills.map((entry) => [entry.artifactPath, entry]),
  );
  for (const file of artifactPaths) {
    if (!entriesByPath.has(file)) {
      findings.push({ path: file, rule: "artifact_not_in_catalog" });
    }
  }
  for (const entry of catalog.skills) {
    if (!artifactPaths.includes(entry.artifactPath)) {
      findings.push({
        path: entry.artifactPath,
        rule: "catalog_artifact_missing",
      });
    }
  }
  if (findings.length > 0) return done();

  for (const file of artifactPaths) {
    const value = parseCanonical(file);
    const parsed = SpecSkillArtifactSchema.safeParse(value);
    if (!parsed.success) {
      findings.push({ path: file, rule: "artifact_schema_invalid" });
      continue;
    }
    const artifact = parsed.data;
    const skill = artifact.skill;
    const entry = entriesByPath.get(file);

    if (artifact.commit !== catalog.commit) {
      findings.push({ path: file, rule: "artifact_commit_mismatch" });
    }
    if (artifact.releaseTag !== catalog.releaseTag) {
      findings.push({ path: file, rule: "artifact_release_tag_mismatch" });
    }
    if (artifact.pluginVersion !== catalog.pluginVersion) {
      findings.push({ path: file, rule: "artifact_plugin_version_mismatch" });
    }
    if (artifact.sourcePath !== `plugin/skills/${skill.slug}`) {
      findings.push({ path: file, rule: "artifact_source_path_mismatch" });
    }
    if (file !== `skills/${skill.slug}.${skill.sha256}.json`) {
      findings.push({ path: file, rule: "artifact_file_name_mismatch" });
    }
    if (entry && entry.sha256 !== skill.sha256) {
      findings.push({ path: file, rule: "catalog_sha256_mismatch" });
    }
    if (entry && entry.version !== skill.version) {
      findings.push({ path: file, rule: "catalog_version_mismatch" });
    }
    if (
      entry &&
      JSON.stringify(entry.visibility) !== JSON.stringify(skill.visibility)
    ) {
      findings.push({ path: file, rule: "catalog_visibility_mismatch" });
    }

    if (skill.skillMd.sha256 !== sha256Text(skill.skillMd.content)) {
      findings.push({ path: file, rule: "artifact_skill_md_sha256_mismatch" });
    }
    if (skill.skillMd.bytes !== Buffer.byteLength(skill.skillMd.content)) {
      findings.push({ path: file, rule: "artifact_skill_md_bytes_mismatch" });
    }
    for (const embedded of skill.files) {
      if (embedded.sha256 !== sha256Text(embedded.content)) {
        findings.push({ path: file, rule: "artifact_file_sha256_mismatch" });
      }
      if (embedded.bytes !== Buffer.byteLength(embedded.content)) {
        findings.push({ path: file, rule: "artifact_file_bytes_mismatch" });
      }
    }
    const canonical = `${skill.skillMd.sha256}\n${JSON.stringify(
      skill.files.map(({ path: filePath, mediaType, bytes, sha256 }) => ({
        path: filePath,
        mediaType,
        bytes,
        sha256,
      })),
    )}`;
    if (skill.sha256 !== sha256Text(canonical)) {
      findings.push({ path: file, rule: "artifact_bundle_sha256_mismatch" });
    }
    const totalBytes = skill.files.reduce(
      (sum, embedded) => sum + embedded.bytes,
      skill.skillMd.bytes,
    );
    if (skill.bytes !== totalBytes) {
      findings.push({ path: file, rule: "artifact_bundle_bytes_mismatch" });
    }
  }

  return done();
}

function kindOf(file: string): string {
  return file === "catalog.json" ? "catalog" : "artifact";
}

// Two independent builds of the same inputs must agree on every filename and byte.
export async function checkGenerated(
  input: CheckGeneratedInput,
): Promise<CheckGeneratedResult> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "spec-check-"));
  try {
    const dirs = [path.join(workspace, "a"), path.join(workspace, "b")];
    for (const outDir of dirs) {
      await buildSpecArtifacts({
        root: input.root,
        outDir,
        sourceCommit: input.sourceCommit,
        releaseTag: input.releaseTag,
        pluginVersion: input.pluginVersion,
        skipGitChecks: input.skipGitChecks,
      });
    }

    const mismatches: string[] = [];
    const [first, second] = await Promise.all(
      dirs.map((dir) => listFiles(dir)),
    );
    for (const file of first) {
      if (!second.includes(file)) mismatches.push(`only in build 1: ${file}`);
    }
    for (const file of second) {
      if (!first.includes(file)) mismatches.push(`only in build 2: ${file}`);
    }
    for (const file of first.filter((name) => second.includes(name))) {
      const left = await fs.readFile(path.join(dirs[0], file));
      const right = await fs.readFile(path.join(dirs[1], file));
      if (!left.equals(right)) mismatches.push(`bytes differ: ${file}`);
    }

    const verify = await verifySpecArtifacts(dirs[0]);
    return {
      reproducible: mismatches.length === 0,
      mismatches,
      catalogSha256: await computeCatalogSha256(dirs[0]),
      verify,
    };
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
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
  const report = await checkGenerated({
    root: process.cwd(),
    sourceCommit: requireEnv("SOURCE_COMMIT"),
    releaseTag: requireEnv("RELEASE_TAG"),
    pluginVersion: requireEnv("PLUGIN_VERSION"),
  });
  for (const mismatch of report.mismatches) {
    console.error(`reproducibility: ${mismatch}`);
  }
  for (const finding of report.verify.findings) {
    console.error(`${finding.rule}: ${finding.path}`);
  }
  if (!report.reproducible || !report.verify.ok) {
    process.exit(1);
  }
  console.log(`catalog.json sha256 ${report.catalogSha256}`);
  console.log("Generated artifacts are reproducible and self-consistent");
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
