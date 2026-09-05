import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export const repoRoot = path.resolve(__dirname, "..", "..");

const EXCLUDED = new Set([".git", "node_modules", "dist", "coverage"]);

const tempDirs: string[] = [];

export async function makeTempDir(prefix = "spec-artifacts-"): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

export async function cleanupTempDirs(): Promise<void> {
  for (const dir of tempDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// Copy the real repository without git, dependencies, or build output.
export async function copyFixtureRepo(): Promise<string> {
  const dest = await makeTempDir("spec-fixture-repo-");
  const target = path.join(dest, "repo");
  await fs.cp(repoRoot, target, {
    recursive: true,
    filter: (source) => !EXCLUDED.has(path.basename(source)),
  });
  return target;
}

export async function writeSkill(
  root: string,
  slug: string,
  files: Record<string, string>,
): Promise<string> {
  const dir = path.join(root, "plugin", "skills", slug);
  for (const [relative, content] of Object.entries(files)) {
    const filePath = path.join(dir, relative);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
  }
  return dir;
}

export function skillMd(input: {
  name: string;
  description?: string;
  version?: string;
  body?: string;
}): string {
  const description =
    input.description ??
    "Use when a test needs a portable skill fixture with a stable description.";
  return [
    "---",
    `name: ${input.name}`,
    `description: ${description}`,
    "license: Apache-2.0",
    "compatibility: Any MCP client",
    "metadata:",
    "  parcel:",
    "    schema-version: 1",
    `    version: ${input.version ?? "0.1.0"}`,
    "    visibility:",
    "      claude-plugin: true",
    "      parcel-explore: false",
    "      parcel-installable: false",
    "      parcel-runtime: false",
    "---",
    "",
    input.body ?? "# Fixture\n\nA fixture skill body.\n",
  ].join("\n");
}

export async function listFilesRecursive(
  dir: string,
  prefix = "",
): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursive(path.join(dir, entry.name), rel)));
    } else {
      out.push(rel);
    }
  }
  return out.sort();
}

// Commit a fixture tree so git-backed builder checks have real state to read.
export function initGitRepo(root: string): string {
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" });
  git(["init", "--quiet", "--initial-branch=main"]);
  git(["config", "user.email", "fixture@example.invalid"]);
  git(["config", "user.name", "Fixture"]);
  git(["config", "commit.gpgsign", "false"]);
  git(["add", "-A"]);
  git(["commit", "--quiet", "-m", "fixture"]);
  return git(["rev-parse", "HEAD"]).trim();
}
