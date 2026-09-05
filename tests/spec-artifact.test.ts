import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SpecBuildError,
  type SpecSkillArtifactV1,
  assertUniqueSlugs,
  buildSpecArtifacts,
  projectSkillArtifact,
} from "../scripts/build-spec-artifacts.js";
import {
  checkGenerated,
  computeCatalogSha256,
  verifySpecArtifacts,
} from "../scripts/check-generated.js";
import {
  cleanupTempDirs,
  copyFixtureRepo,
  initGitRepo,
  listFilesRecursive,
  makeTempDir,
  repoRoot,
  skillMd,
  writeSkill,
} from "./helpers/spec-fixture.js";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const RELEASE_TAG = "v0.1.0";
const PLUGIN_VERSION = "0.1.0";

const CONTEXT = {
  commit: COMMIT,
  releaseTag: RELEASE_TAG,
  pluginVersion: PLUGIN_VERSION,
};

function sha256Hex(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

async function buildFixture(
  overrides: Partial<Parameters<typeof buildSpecArtifacts>[0]> = {},
) {
  const root = overrides.root ?? (await copyFixtureRepo());
  const outDir = overrides.outDir ?? path.join(await makeTempDir(), "spec");
  return buildSpecArtifacts({
    root,
    outDir,
    sourceCommit: COMMIT,
    releaseTag: RELEASE_TAG,
    pluginVersion: PLUGIN_VERSION,
    skipGitChecks: true,
    ...overrides,
  });
}

async function expectBuildError(
  promise: Promise<unknown>,
): Promise<SpecBuildError> {
  let error: unknown;
  try {
    await promise;
  } catch (err) {
    error = err;
  }
  expect(error).toBeInstanceOf(SpecBuildError);
  return error as SpecBuildError;
}

afterAll(async () => {
  await cleanupTempDirs();
});

describe("spec artifact contract", () => {
  let outDir: string;
  let result: Awaited<ReturnType<typeof buildSpecArtifacts>>;

  beforeAll(async () => {
    result = await buildFixture();
    outDir = result.outDir;
  });

  it("stamps schema version, repository, commit, tag, and plugin version", () => {
    expect(result.catalog.schemaVersion).toBe(1);
    expect(result.catalog.repository).toBe("nick-parcel/parcel-skills");
    expect(result.catalog.commit).toBe(COMMIT);
    expect(result.catalog.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(result.catalog.releaseTag).toBe(RELEASE_TAG);
    expect(result.catalog.pluginVersion).toBe(PLUGIN_VERSION);
    for (const artifact of result.artifacts) {
      expect(artifact.schemaVersion).toBe(1);
      expect(artifact.repository).toBe("nick-parcel/parcel-skills");
      expect(artifact.commit).toBe(COMMIT);
      expect(artifact.releaseTag).toBe(RELEASE_TAG);
      expect(artifact.pluginVersion).toBe(PLUGIN_VERSION);
    }
  });

  it("emits both real skills sorted by slug with normalized source paths", () => {
    expect(result.artifacts.map((artifact) => artifact.skill.slug)).toEqual([
      "create-skill",
      "using-parcel-mcp",
    ]);
    expect(result.catalog.skills.map((entry) => entry.slug)).toEqual([
      "create-skill",
      "using-parcel-mcp",
    ]);
    for (const artifact of result.artifacts) {
      expect(artifact.sourcePath).toBe(`plugin/skills/${artifact.skill.slug}`);
    }
  });

  it("projects frontmatter and semantic skill versions", async () => {
    for (const artifact of result.artifacts) {
      const source = await fs.readFile(
        path.join(repoRoot, artifact.sourcePath, "SKILL.md"),
        "utf8",
      );
      expect(artifact.skill.name).toBe(artifact.skill.slug);
      expect(source).toContain(`description: ${artifact.skill.description}`);
      expect(artifact.skill.compatibility).toBeTypeOf("string");
      expect(artifact.skill.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("projects visibility from the kebab-case metadata keys", () => {
    for (const artifact of result.artifacts) {
      expect(artifact.skill.visibility).toEqual({
        claudePlugin: true,
        parcelExplore: false,
        parcelInstallable: false,
        parcelRuntime: false,
      });
      expect(Object.keys(artifact.skill.visibility)).toEqual([
        "claudePlugin",
        "parcelExplore",
        "parcelInstallable",
        "parcelRuntime",
      ]);
    }
    for (const entry of result.catalog.skills) {
      expect(entry.visibility.claudePlugin).toBe(true);
      expect(entry.visibility.parcelExplore).toBe(false);
      expect(entry.visibility.parcelInstallable).toBe(false);
      expect(entry.visibility.parcelRuntime).toBe(false);
    }
  });

  it("carries the exact normalized SKILL.md with parity hashes", async () => {
    for (const artifact of result.artifacts) {
      const source = await fs.readFile(
        path.join(repoRoot, artifact.sourcePath, "SKILL.md"),
        "utf8",
      );
      const normalized = source.replace(/\r\n?/g, "\n");
      expect(artifact.skill.skillMd.content).toBe(normalized);
      expect(artifact.skill.skillMd.sha256).toBe(sha256Hex(normalized));
      expect(artifact.skill.skillMd.bytes).toBe(
        Buffer.byteLength(normalized, "utf8"),
      );
      expect(artifact.skill.skillMd.content).not.toContain("\r");
    }
  });

  it("lists the complete supporting-file inventory and bundle hashes", () => {
    for (const artifact of result.artifacts) {
      expect(artifact.skill.files).toEqual([]);
      const canonical = `${artifact.skill.skillMd.sha256}\n[]`;
      expect(artifact.skill.sha256).toBe(sha256Hex(canonical));
      expect(artifact.skill.bytes).toBe(artifact.skill.skillMd.bytes);
    }
  });

  it("strips leading blank lines from instructions", () => {
    for (const artifact of result.artifacts) {
      expect(artifact.skill.instructions.startsWith("#")).toBe(true);
      expect(artifact.skill.skillMd.content).toContain(
        artifact.skill.instructions,
      );
    }
  });

  it("names artifact files and catalog entries by the bundle hash", async () => {
    const files = await listFilesRecursive(outDir);
    expect(files).toContain("catalog.json");
    expect(files).toContain("SHA256SUMS");
    for (const artifact of result.artifacts) {
      const name = `${artifact.skill.slug}.${artifact.skill.sha256}.json`;
      expect(files).toContain(`skills/${name}`);
      const entry = result.catalog.skills.find(
        (candidate) => candidate.slug === artifact.skill.slug,
      );
      expect(entry?.sha256).toBe(artifact.skill.sha256);
      expect(entry?.artifactPath).toBe(`skills/${name}`);
      expect(entry?.version).toBe(artifact.skill.version);
    }
  });

  it("writes canonical JSON with LF endings and one trailing newline", async () => {
    const files = await listFilesRecursive(outDir);
    for (const file of files) {
      const raw = await fs.readFile(path.join(outDir, file), "utf8");
      expect(raw).not.toContain("\r");
      expect(raw.endsWith("\n")).toBe(true);
      expect(raw.endsWith("\n\n")).toBe(false);
      if (file.endsWith(".json")) {
        expect(raw).toBe(`${JSON.stringify(JSON.parse(raw), null, 2)}\n`);
      }
    }
  });

  it("declares keys in the order the contract interfaces declare them", () => {
    expect(Object.keys(result.catalog)).toEqual([
      "schemaVersion",
      "repository",
      "commit",
      "releaseTag",
      "pluginVersion",
      "skills",
    ]);
    expect(Object.keys(result.catalog.skills[0])).toEqual([
      "slug",
      "version",
      "artifactPath",
      "sha256",
      "visibility",
    ]);
    const artifact = result.artifacts[0];
    expect(Object.keys(artifact)).toEqual([
      "schemaVersion",
      "repository",
      "commit",
      "releaseTag",
      "pluginVersion",
      "sourcePath",
      "skill",
    ]);
    expect(Object.keys(artifact.skill)).toEqual([
      "slug",
      "version",
      "name",
      "description",
      "compatibility",
      "visibility",
      "instructions",
      "skillMd",
      "files",
      "sha256",
      "bytes",
    ]);
    expect(Object.keys(artifact.skill.skillMd)).toEqual([
      "content",
      "sha256",
      "bytes",
    ]);
  });

  it("contains no timestamp key and no ISO date string", async () => {
    const files = await listFilesRecursive(outDir);
    for (const file of files.filter((name) => name.endsWith(".json"))) {
      const raw = await fs.readFile(path.join(outDir, file), "utf8");
      const parsed = JSON.parse(raw) as unknown;
      const seen: string[] = [];
      const walk = (value: unknown): void => {
        if (Array.isArray(value)) {
          for (const item of value) walk(item);
          return;
        }
        if (value && typeof value === "object") {
          for (const [key, child] of Object.entries(value)) {
            seen.push(key);
            walk(child);
          }
        }
      };
      walk(parsed);
      expect(seen).not.toContain("timestamp");
      expect(seen).not.toContain("builtAt");
      expect(seen).not.toContain("generatedAt");
      expect(seen).not.toContain("registeredAt");
      expect(raw).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    }
  });

  it("writes a sorted SHA256SUMS manifest covering every emitted file", async () => {
    const raw = await fs.readFile(path.join(outDir, "SHA256SUMS"), "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    const lines = raw.trimEnd().split("\n");
    const paths = lines.map((line) => line.split("  ")[1]);
    expect(paths).toContain("catalog.json");
    expect([...paths].sort()).toEqual(paths);
    const emitted = (await listFilesRecursive(outDir)).filter(
      (file) => file !== "SHA256SUMS",
    );
    expect(paths).toEqual(emitted);
    for (const line of lines) {
      const [digest, file] = line.split("  ");
      expect(digest).toMatch(/^[0-9a-f]{64}$/);
      const bytes = await fs.readFile(path.join(outDir, file));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(digest);
    }
  });

  it("verifies its own output and exposes the catalog checksum", async () => {
    const verified = await verifySpecArtifacts(outDir);
    expect(verified.findings).toEqual([]);
    expect(verified.ok).toBe(true);
    const bytes = await fs.readFile(path.join(outDir, "catalog.json"));
    expect(await computeCatalogSha256(outDir)).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
  });
});

describe("builder refusals", () => {
  it("refuses duplicate slugs", () => {
    expect(() => assertUniqueSlugs(["create-skill", "create-skill"])).toThrow(
      /skill_duplicate_slug/,
    );
  });

  it("refuses case-folded slug collisions", async () => {
    expect(() => assertUniqueSlugs(["create-skill", "Create-Skill"])).toThrow(
      /skill_slug_case_collision/,
    );
    const root = await copyFixtureRepo();
    await writeSkill(root, "Create-Skill", {
      "SKILL.md": skillMd({ name: "Create-Skill" }),
    });
    const skills = await fs.readdir(path.join(root, "plugin", "skills"));
    if (skills.length === 3) {
      const error = await expectBuildError(buildFixture({ root }));
      expect(error.rule).toBe("skill_slug_case_collision");
    }
  });

  it("refuses a skill whose frontmatter name is not the directory slug", async () => {
    const root = await copyFixtureRepo();
    await writeSkill(root, "mismatch-skill", {
      "SKILL.md": skillMd({ name: "other-name" }),
    });
    const error = await expectBuildError(buildFixture({ root }));
    expect(error.findings.map((finding) => finding.rule)).toContain(
      "skill_name_dir_mismatch",
    );
  });

  it("refuses a missing referenced file", async () => {
    const root = await copyFixtureRepo();
    await writeSkill(root, "missing-ref", {
      "SKILL.md": skillMd({
        name: "missing-ref",
        body: "# Missing\n\nSee [the notes](notes.md).\n",
      }),
    });
    const error = await expectBuildError(buildFixture({ root }));
    expect(error.findings.map((finding) => finding.rule)).toContain(
      "skill_missing_referenced_file",
    );
  });

  it("refuses an unknown file extension", async () => {
    const root = await copyFixtureRepo();
    await writeSkill(root, "bad-extension", {
      "SKILL.md": skillMd({ name: "bad-extension" }),
      "notes.yaml": "key: value\n",
    });
    const error = await expectBuildError(buildFixture({ root }));
    expect(
      error.findings.some((finding) =>
        finding.rule.endsWith("forbidden_extension"),
      ),
    ).toBe(true);
  });

  it("refuses forbidden content", async () => {
    const root = await copyFixtureRepo();
    await writeSkill(root, "forbidden-content", {
      "SKILL.md": skillMd({
        name: "forbidden-content",
        body: "# Forbidden\n\nA line with an em dash \u2014 right here.\n",
      }),
    });
    const error = await expectBuildError(buildFixture({ root }));
    expect(error.findings.map((finding) => finding.rule)).toContain(
      "skill_body_em_dash",
    );
  });

  it("refuses a non-semver skill version", async () => {
    const root = await copyFixtureRepo();
    await writeSkill(root, "bad-version", {
      "SKILL.md": skillMd({ name: "bad-version", version: "1.0" }),
    });
    const error = await expectBuildError(buildFixture({ root }));
    expect(error.findings.map((finding) => finding.rule)).toContain(
      "skill_metadata_version_not_semver",
    );
  });

  it("refuses more than 25 supporting files", () => {
    const files = Array.from({ length: 26 }, (_, index) => ({
      path: `notes-${index}.md`,
      content: "notes\n",
    }));
    expect(() =>
      projectSkillArtifact(
        { slug: "big-skill", skillMd: skillMd({ name: "big-skill" }), files },
        CONTEXT,
      ),
    ).toThrow(/spec_skill_too_many_files/);
  });

  it("refuses an oversize SKILL.md, supporting file, and bundle", () => {
    const filler = "x".repeat(102_401);
    expect(() =>
      projectSkillArtifact(
        {
          slug: "huge",
          skillMd: skillMd({ name: "huge", body: `# Huge\n\n${filler}\n` }),
          files: [],
        },
        CONTEXT,
      ),
    ).toThrow(/spec_skill_md_too_large/);

    expect(() =>
      projectSkillArtifact(
        {
          slug: "huge",
          skillMd: skillMd({ name: "huge" }),
          files: [{ path: "notes.md", content: `${filler}\n` }],
        },
        CONTEXT,
      ),
    ).toThrow(/spec_file_too_large/);

    const chunk = "y".repeat(100_000);
    expect(() =>
      projectSkillArtifact(
        {
          slug: "huge",
          skillMd: skillMd({ name: "huge" }),
          files: Array.from({ length: 6 }, (_, index) => ({
            path: `notes-${index}.md`,
            content: chunk,
          })),
        },
        CONTEXT,
      ),
    ).toThrow(/spec_bundle_too_large/);
  });

  it("refuses an unknown media type", () => {
    expect(() =>
      projectSkillArtifact(
        {
          slug: "media",
          skillMd: skillMd({ name: "media" }),
          files: [{ path: "notes.yaml", content: "key: value\n" }],
        },
        CONTEXT,
      ),
    ).toThrow(/spec_file_unknown_media_type/);
  });

  it("sorts supporting files by code point and hashes them for parity", () => {
    const artifact = projectSkillArtifact(
      {
        slug: "sorted",
        skillMd: skillMd({
          name: "sorted",
          body: "# Sorted\n\nSee [a](Zebra.md), [b](apple.md), [c](data.json).\n",
        }),
        files: [
          { path: "apple.md", content: "apple\r\n" },
          { path: "data.json", content: '{"a":1}\n' },
          { path: "Zebra.md", content: "zebra\n" },
        ],
      },
      CONTEXT,
    );
    expect(artifact.skill.files.map((file) => file.path)).toEqual([
      "Zebra.md",
      "apple.md",
      "data.json",
    ]);
    expect(artifact.skill.files.map((file) => file.mediaType)).toEqual([
      "text/markdown",
      "text/markdown",
      "application/json",
    ]);
    const apple = artifact.skill.files[1];
    expect(apple.content).toBe("apple\n");
    expect(apple.sha256).toBe(sha256Hex("apple\n"));
    expect(apple.bytes).toBe(6);
    const canonical = `${artifact.skill.skillMd.sha256}\n${JSON.stringify(
      artifact.skill.files.map(
        ({ path: filePath, mediaType, bytes, sha256 }) => ({
          path: filePath,
          mediaType,
          bytes,
          sha256,
        }),
      ),
    )}`;
    expect(artifact.skill.sha256).toBe(sha256Hex(canonical));
    expect(artifact.skill.bytes).toBe(
      artifact.skill.files.reduce(
        (sum, file) => sum + file.bytes,
        artifact.skill.skillMd.bytes,
      ),
    );
  });

  it("refuses a release tag that is not v plus the plugin version", async () => {
    const error = await expectBuildError(
      buildFixture({ releaseTag: "v0.2.0" }),
    );
    expect(error.rule).toBe("release_tag_mismatch");
  });

  it("refuses a non-semver plugin version", async () => {
    const error = await expectBuildError(
      buildFixture({ releaseTag: "v0.1", pluginVersion: "0.1" }),
    );
    expect(error.rule).toBe("plugin_version_not_semver");
  });

  it("refuses a plugin version that disagrees with plugin.json", async () => {
    const error = await expectBuildError(
      buildFixture({ releaseTag: "v9.9.9", pluginVersion: "9.9.9" }),
    );
    expect(error.rule).toBe("plugin_version_mismatch");
  });

  it("refuses a commit that is not 40 lowercase hex characters", async () => {
    const error = await expectBuildError(
      buildFixture({ sourceCommit: "ABC123" }),
    );
    expect(error.rule).toBe("source_commit_invalid");
  });

  it("refuses a dirty tree and a wrong supplied commit", async () => {
    const root = await copyFixtureRepo();
    const head = initGitRepo(root);
    const outDir = path.join(await makeTempDir(), "spec");

    const wrongCommit = await expectBuildError(
      buildSpecArtifacts({
        root,
        outDir,
        sourceCommit: "0".repeat(40),
        releaseTag: RELEASE_TAG,
        pluginVersion: PLUGIN_VERSION,
      }),
    );
    expect(wrongCommit.rule).toBe("source_commit_mismatch");

    await fs.appendFile(path.join(root, "README.md"), "\nlocal edit\n", "utf8");
    const dirty = await expectBuildError(
      buildSpecArtifacts({
        root,
        outDir,
        sourceCommit: head,
        releaseTag: RELEASE_TAG,
        pluginVersion: PLUGIN_VERSION,
      }),
    );
    expect(dirty.rule).toBe("source_tree_dirty");
  });

  it("refuses a non-empty output directory unless forced", async () => {
    const outDir = path.join(await makeTempDir(), "spec");
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, "stale.txt"), "stale\n", "utf8");
    const error = await expectBuildError(buildFixture({ outDir }));
    expect(error.rule).toBe("output_dir_not_empty");

    const forced = await buildFixture({ outDir, force: true });
    expect(forced.catalog.skills).toHaveLength(2);
    const files = await listFilesRecursive(outDir);
    expect(files).toContain("stale.txt");
    expect(files).toContain("catalog.json");
  });
});

describe("reproducibility", () => {
  it("produces byte-identical output for the same inputs", async () => {
    const root = await copyFixtureRepo();
    const first = await buildFixture({ root });
    const second = await buildFixture({ root });
    const firstFiles = await listFilesRecursive(first.outDir);
    const secondFiles = await listFilesRecursive(second.outDir);
    expect(secondFiles).toEqual(firstFiles);
    for (const file of firstFiles) {
      const left = await fs.readFile(path.join(first.outDir, file));
      const right = await fs.readFile(path.join(second.outDir, file));
      expect(right.equals(left)).toBe(true);
    }
  });

  it("reports reproducible through checkGenerated", async () => {
    const root = await copyFixtureRepo();
    const report = await checkGenerated({
      root,
      sourceCommit: COMMIT,
      releaseTag: RELEASE_TAG,
      pluginVersion: PLUGIN_VERSION,
      skipGitChecks: true,
    });
    expect(report.mismatches).toEqual([]);
    expect(report.reproducible).toBe(true);
    expect(report.verify.ok).toBe(true);
  });

  it("changes only the touched skill when one source byte changes", async () => {
    const baseRoot = await copyFixtureRepo();
    const base = await buildFixture({ root: baseRoot });

    const editedRoot = await copyFixtureRepo();
    const skillPath = path.join(
      editedRoot,
      "plugin",
      "skills",
      "create-skill",
      "SKILL.md",
    );
    const original = await fs.readFile(skillPath, "utf8");
    expect(original).toContain("## Overview");
    await fs.writeFile(
      skillPath,
      original.replace("## Overview", "## overview"),
      "utf8",
    );
    const edited = await buildFixture({ root: editedRoot });

    const pick = (
      result: { artifacts: readonly SpecSkillArtifactV1[] },
      slug: string,
    ) =>
      result.artifacts.find(
        (artifact) => artifact.skill.slug === slug,
      ) as SpecSkillArtifactV1;

    const before = pick(base, "create-skill");
    const after = pick(edited, "create-skill");
    expect(after.skill.skillMd.sha256).not.toBe(before.skill.skillMd.sha256);
    expect(after.skill.sha256).not.toBe(before.skill.sha256);

    const baseEntry = base.catalog.skills.find(
      (e) => e.slug === "create-skill",
    );
    const editedEntry = edited.catalog.skills.find(
      (e) => e.slug === "create-skill",
    );
    expect(editedEntry?.sha256).not.toBe(baseEntry?.sha256);
    expect(editedEntry?.artifactPath).not.toBe(baseEntry?.artifactPath);

    const baseSums = await fs.readFile(
      path.join(base.outDir, "SHA256SUMS"),
      "utf8",
    );
    const editedSums = await fs.readFile(
      path.join(edited.outDir, "SHA256SUMS"),
      "utf8",
    );
    expect(editedSums).not.toBe(baseSums);

    const untouched = "using-parcel-mcp";
    const baseUntouched = pick(base, untouched);
    const editedUntouched = pick(edited, untouched);
    expect(editedUntouched.skill.sha256).toBe(baseUntouched.skill.sha256);
    const untouchedPath = `skills/${untouched}.${baseUntouched.skill.sha256}.json`;
    const baseBytes = await fs.readFile(path.join(base.outDir, untouchedPath));
    const editedBytes = await fs.readFile(
      path.join(edited.outDir, untouchedPath),
    );
    expect(editedBytes.equals(baseBytes)).toBe(true);
    const line = (sums: string, file: string) =>
      sums.split("\n").find((entry) => entry.endsWith(`  ${file}`));
    expect(line(editedSums, untouchedPath)).toBe(line(baseSums, untouchedPath));
  });
});

describe("tamper detection", () => {
  async function buildForTamper(): Promise<string> {
    const result = await buildFixture();
    return result.outDir;
  }

  it("fails on a tampered artifact before parsing it", async () => {
    const outDir = await buildForTamper();
    const artifact = (await listFilesRecursive(outDir)).find((file) =>
      file.startsWith("skills/"),
    ) as string;
    await fs.writeFile(path.join(outDir, artifact), "definitely not json\n");
    const verified = await verifySpecArtifacts(outDir);
    expect(verified.ok).toBe(false);
    const rules = verified.findings.map((finding) => finding.rule);
    expect(rules).toContain("checksum_mismatch");
    expect(rules).not.toContain("artifact_json_invalid");
  });

  it("refuses an unlisted file in the output directory", async () => {
    const outDir = await buildForTamper();
    await fs.writeFile(path.join(outDir, "extra.json"), "{}\n", "utf8");
    const verified = await verifySpecArtifacts(outDir);
    expect(verified.ok).toBe(false);
    expect(verified.findings.map((finding) => finding.rule)).toContain(
      "unlisted_file",
    );
  });

  it("refuses a listed file that is missing", async () => {
    const outDir = await buildForTamper();
    const artifact = (await listFilesRecursive(outDir)).find((file) =>
      file.startsWith("skills/"),
    ) as string;
    await fs.rm(path.join(outDir, artifact));
    const verified = await verifySpecArtifacts(outDir);
    expect(verified.ok).toBe(false);
    expect(verified.findings.map((finding) => finding.rule)).toContain(
      "missing_file",
    );
  });

  it("recomputes embedded hashes even when the manifest agrees", async () => {
    const outDir = await buildForTamper();
    const relative = (await listFilesRecursive(outDir)).find((file) =>
      file.startsWith("skills/"),
    ) as string;
    const filePath = path.join(outDir, relative);
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
    parsed.skill.skillMd.content = `${parsed.skill.skillMd.content}tampered`;
    const bytes = Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    await fs.writeFile(filePath, bytes);
    const digest = createHash("sha256").update(bytes).digest("hex");
    const sums = await fs.readFile(path.join(outDir, "SHA256SUMS"), "utf8");
    await fs.writeFile(
      path.join(outDir, "SHA256SUMS"),
      sums
        .split("\n")
        .map((line) =>
          line.endsWith(`  ${relative}`) ? `${digest}  ${relative}` : line,
        )
        .join("\n"),
      "utf8",
    );
    const verified = await verifySpecArtifacts(outDir);
    expect(verified.ok).toBe(false);
    expect(verified.findings.map((finding) => finding.rule)).toContain(
      "artifact_skill_md_sha256_mismatch",
    );
  });
});

describe("published JSON schemas", () => {
  const schemasRoot = path.join(repoRoot, "schemas");

  async function loadSchema(name: string): Promise<Record<string, unknown>> {
    const raw = await fs.readFile(path.join(schemasRoot, name), "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  }

  function walkObjects(
    node: unknown,
    visit: (object: Record<string, unknown>, pointer: string) => void,
    pointer = "#",
  ): void {
    if (Array.isArray(node)) {
      node.forEach((item, index) =>
        walkObjects(item, visit, `${pointer}/${index}`),
      );
      return;
    }
    if (!node || typeof node !== "object") return;
    const object = node as Record<string, unknown>;
    if (object.type === "object") visit(object, pointer);
    for (const [key, child] of Object.entries(object)) {
      walkObjects(child, visit, `${pointer}/${key}`);
    }
  }

  it("closes every object in both schemas", async () => {
    for (const name of [
      "spec-catalog.schema.json",
      "spec-artifact.schema.json",
    ]) {
      const schema = await loadSchema(name);
      expect(schema.$schema).toBe(
        "https://json-schema.org/draft/2020-12/schema",
      );
      let objectCount = 0;
      walkObjects(schema, (object, pointer) => {
        objectCount += 1;
        expect(
          object.additionalProperties,
          `${name} ${pointer} must be closed`,
        ).toBe(false);
        expect(Array.isArray(object.required), `${name} ${pointer}`).toBe(true);
      });
      expect(objectCount).toBeGreaterThan(1);
    }
  });

  it("pins the contract patterns shared with the Zod schemas", async () => {
    const semver = "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$";
    for (const name of [
      "spec-catalog.schema.json",
      "spec-artifact.schema.json",
    ]) {
      const schema = await loadSchema(name);
      const properties = schema.properties as Record<
        string,
        Record<string, unknown>
      >;
      expect(properties.schemaVersion.const).toBe(1);
      expect(properties.repository.const).toBe("nick-parcel/parcel-skills");
      expect(properties.commit.pattern).toBe("^[0-9a-f]{40}$");
      expect(properties.releaseTag.pattern).toBe("^v\\d+\\.\\d+\\.\\d+$");
      expect(properties.pluginVersion.pattern).toBe(semver);
      expect(schema.required).toEqual(
        name === "spec-catalog.schema.json"
          ? [
              "schemaVersion",
              "repository",
              "commit",
              "releaseTag",
              "pluginVersion",
              "skills",
            ]
          : [
              "schemaVersion",
              "repository",
              "commit",
              "releaseTag",
              "pluginVersion",
              "sourcePath",
              "skill",
            ],
      );
    }

    const artifact = await loadSchema("spec-artifact.schema.json");
    const skill = (
      artifact.properties as Record<string, Record<string, unknown>>
    ).skill;
    const skillProperties = skill.properties as Record<
      string,
      Record<string, unknown>
    >;
    expect(skillProperties.version.pattern).toBe(semver);
    expect(skillProperties.sha256.pattern).toBe("^[0-9a-f]{64}$");
    const files = skillProperties.files as Record<string, unknown>;
    const item = files.items as Record<string, Record<string, unknown>>;
    expect(
      (item.properties as Record<string, Record<string, unknown>>).mediaType
        .enum,
    ).toEqual(["text/markdown", "text/plain", "application/json"]);

    const catalog = await loadSchema("spec-catalog.schema.json");
    const skills = (
      catalog.properties as Record<string, Record<string, unknown>>
    ).skills;
    const entry = skills.items as Record<string, Record<string, unknown>>;
    const entryProperties = entry.properties as Record<
      string,
      Record<string, unknown>
    >;
    expect(entryProperties.sha256.pattern).toBe("^[0-9a-f]{64}$");
    expect(entryProperties.version.pattern).toBe(semver);
  });
});
