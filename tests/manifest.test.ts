import { execFile, execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { type Finding, validateRepository } from "../scripts/validate.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(__dirname, "..");
const fixturesRoot = path.join(__dirname, "fixtures", "invalid");

async function findingRules(root: string) {
  const report = await validateRepository(root);
  return report.findings.map((f: Finding) => f.rule);
}

async function copyToTempDir(fixtureName: string) {
  const src = path.join(fixturesRoot, fixtureName);
  const dest = await fs.mkdtemp(
    path.join(os.tmpdir(), `parcel-fixture-${fixtureName}-`),
  );
  await fs.cp(src, dest, { recursive: true, verbatimSymlinks: true });
  return dest;
}

async function copyRepoToTempDir(label: string) {
  const dest = await fs.mkdtemp(
    path.join(os.tmpdir(), `parcel-repo-${label}-`),
  );
  await fs.cp(repoRoot, dest, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (src) =>
      !src.includes(`${path.sep}node_modules`) &&
      !src.includes(`${path.sep}.git`),
  });
  return dest;
}

let claudeAvailable = true;
try {
  execSync("command -v claude", { stdio: "ignore" });
} catch {
  claudeAvailable = false;
}

describe("real repository manifests", () => {
  it("validates with no findings", async () => {
    const report = await validateRepository(repoRoot);
    expect(report.findings).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("plugin identity is builder, version 0.2.0, license Apache-2.0", async () => {
    const pluginJson = JSON.parse(
      await fs.readFile(
        path.join(repoRoot, "plugin", ".claude-plugin", "plugin.json"),
        "utf8",
      ),
    );
    expect(pluginJson.name).toBe("builder");
    expect(pluginJson.version).toBe("0.2.0");
    expect(pluginJson.license).toBe("Apache-2.0");
    expect(pluginJson.homepage).toBe("https://github.com/nick-parcel/builder");
    expect(pluginJson.repository).toBe(
      "https://github.com/nick-parcel/builder",
    );
  });

  it("marketplace references ./plugin exactly once with no command/archive source", async () => {
    const marketplaceJson = JSON.parse(
      await fs.readFile(
        path.join(repoRoot, ".claude-plugin", "marketplace.json"),
        "utf8",
      ),
    );
    expect(marketplaceJson.name).toBe("builder");
    expect(marketplaceJson.plugins).toHaveLength(1);
    expect(marketplaceJson.plugins[0].name).toBe("builder");
    expect(marketplaceJson.plugins[0].version).toBe("0.2.0");
    expect(marketplaceJson.plugins[0].source).toBe("./plugin");
    expect(typeof marketplaceJson.plugins[0].source).toBe("string");
  });

  it("plugin.mcp.json has exactly one parcel http server with the exact production url", async () => {
    const mcpJson = JSON.parse(
      await fs.readFile(path.join(repoRoot, "plugin", ".mcp.json"), "utf8"),
    );
    const servers = Object.keys(mcpJson.mcpServers);
    expect(servers).toEqual(["parcel"]);
    expect(mcpJson.mcpServers.parcel.type).toBe("http");
    expect(mcpJson.mcpServers.parcel.url).toBe(
      "https://mcp.parcelengineering.com/mcp",
    );
    expect(mcpJson.mcpServers.parcel.headers).toBeUndefined();
    expect(mcpJson.mcpServers.parcel.env).toBeUndefined();
    expect(mcpJson.mcpServers.parcel.command).toBeUndefined();
    expect(mcpJson.mcpServers.parcel.args).toBeUndefined();
  });

  it("plugin.json has no forbidden keys", async () => {
    const pluginJson = JSON.parse(
      await fs.readFile(
        path.join(repoRoot, "plugin", ".claude-plugin", "plugin.json"),
        "utf8",
      ),
    );
    for (const key of [
      "skills",
      "commands",
      "agents",
      "hooks",
      "mcpServers",
      "workflows",
      "lspServers",
      "bin",
      "dependencies",
      "userConfig",
      "experimental",
      "outputStyles",
    ]) {
      expect(pluginJson).not.toHaveProperty(key);
    }
  });

  it("has no symlinks or executable files under plugin/", async () => {
    async function walk(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        const stat = await fs.lstat(full);
        expect(stat.isSymbolicLink()).toBe(false);
        if (stat.isFile()) {
          expect(stat.mode & 0o111).toBe(0);
        }
        if (stat.isDirectory()) {
          await walk(full);
        }
      }
    }
    await walk(path.join(repoRoot, "plugin"));
  });

  it("the only SKILL.md files are the two launch skills", async () => {
    const skillMdPaths: string[] = [];
    async function walk(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile() && entry.name === "SKILL.md") {
          skillMdPaths.push(full);
        }
      }
    }
    await walk(path.join(repoRoot, "plugin"));
    expect(skillMdPaths.map((p) => path.relative(repoRoot, p)).sort()).toEqual([
      path.join("plugin", "skills", "create-skill", "SKILL.md"),
      path.join("plugin", "skills", "using-parcel-mcp", "SKILL.md"),
    ]);
  });

  it("accepts a synthetic skill at plugin/skills/<slug>/SKILL.md", async () => {
    const dir = await copyRepoToTempDir("valid-skill");
    const skillDir = path.join(dir, "plugin", "skills", "sample-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: sample-skill\ndescription: Sample.\n---\n\nBody.\n",
    );
    const report = await validateRepository(dir);
    const rules = report.findings.map((f: Finding) => f.rule);
    expect(rules).not.toContain("skill_location");
    expect(rules).not.toContain("skill_missing_skill_md");
    expect(rules).not.toContain("plugin_manifest_dir_extra_entry");
  });

  it("rejects a synthetic skill with an invalid slug", async () => {
    const dir = await copyRepoToTempDir("invalid-slug");
    const skillDir = path.join(dir, "plugin", "skills", "Bad_Slug");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: Bad_Slug\ndescription: Sample.\n---\n\nBody.\n",
    );
    const rules = await findingRules(dir);
    expect(rules).toContain("skill_location");
  });
});

describe("invalid fixtures", () => {
  it("rejects a symlink under plugin/", async () => {
    const rules = await findingRules(path.join(fixturesRoot, "plugin-symlink"));
    expect(rules).toContain("path_symlink");
  });

  it("rejects an executable file under plugin/", async () => {
    const dir = await copyToTempDir("plugin-executable");
    const target = path.join(dir, "plugin", "notes.md");
    await fs.chmod(target, 0o755);
    const rules = await findingRules(dir);
    expect(rules).toContain("path_executable");
  });

  it("rejects a marketplace source that escapes the repository", async () => {
    const rules = await findingRules(path.join(fixturesRoot, "path-escape"));
    expect(rules).toContain("marketplace_source_pattern_invalid");
  });

  it("rejects a marketplace with a second plugin entry", async () => {
    const rules = await findingRules(
      path.join(fixturesRoot, "second-plugin-entry"),
    );
    expect(rules).toContain("marketplace_plugin_count");
  });

  it("rejects a marketplace with a command source", async () => {
    const rules = await findingRules(path.join(fixturesRoot, "command-source"));
    expect(rules).toContain("marketplace_source_command_forbidden");
  });

  it("rejects a marketplace with an archive source", async () => {
    const rules = await findingRules(path.join(fixturesRoot, "archive-source"));
    expect(rules).toContain("marketplace_source_archive_forbidden");
  });

  it("rejects .mcp.json with headers", async () => {
    const rules = await findingRules(path.join(fixturesRoot, "mcp-headers"));
    expect(rules).toContain("mcp_forbidden_key_headers");
  });

  it("rejects .mcp.json with a command entry", async () => {
    const rules = await findingRules(path.join(fixturesRoot, "mcp-command"));
    expect(rules).toContain("mcp_forbidden_key_command");
  });

  it("rejects .mcp.json with the wrong url", async () => {
    const rules = await findingRules(path.join(fixturesRoot, "mcp-wrong-url"));
    expect(rules).toContain("mcp_url_mismatch");
  });

  it("rejects .mcp.json with two servers", async () => {
    const rules = await findingRules(
      path.join(fixturesRoot, "mcp-two-servers"),
    );
    expect(rules).toContain("mcp_multiple_servers");
  });

  it("rejects plugin.json with hooks", async () => {
    const rules = await findingRules(path.join(fixturesRoot, "plugin-hooks"));
    expect(rules).toContain("plugin_forbidden_key_hooks");
  });

  it("rejects plugin.json with mcpServers", async () => {
    const rules = await findingRules(
      path.join(fixturesRoot, "plugin-mcpservers"),
    );
    expect(rules).toContain("plugin_forbidden_key_mcp_servers");
  });

  it("rejects plugin.json with bin and dependencies", async () => {
    const rules = await findingRules(
      path.join(fixturesRoot, "plugin-bin-dependencies"),
    );
    expect(rules).toContain("plugin_forbidden_key_bin");
    expect(rules).toContain("plugin_forbidden_key_dependencies");
  });

  it("rejects a fake secret under plugin/ without leaking the value", async () => {
    const report = await validateRepository(
      path.join(fixturesRoot, "fake-secret"),
    );
    const rules = report.findings.map((f: Finding) => f.rule);
    expect(rules).toContain("secret_aws_access_key");
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("rejects a .sh file under plugin/", async () => {
    const rules = await findingRules(path.join(fixturesRoot, "sh-file"));
    expect(rules).toContain("path_forbidden_extension");
  });

  it("reports a symlinked plugin root instead of skipping the content walk", async () => {
    const dir = await copyRepoToTempDir("plugin-root-symlink");
    await fs.rm(path.join(dir, "plugin"), { recursive: true, force: true });
    await fs.mkdir(path.join(dir, "elsewhere"), { recursive: true });
    await fs.symlink(path.join(dir, "elsewhere"), path.join(dir, "plugin"));
    const rules = await findingRules(dir);
    expect(rules).toContain("plugin_root_invalid");
  });

  it("reports a missing plugin root", async () => {
    const dir = await copyRepoToTempDir("plugin-root-missing");
    await fs.rm(path.join(dir, "plugin"), { recursive: true, force: true });
    const rules = await findingRules(dir);
    expect(rules).toContain("plugin_root_missing");
  });

  it("rejects a marketplace source pointing at a directory that does not exist", async () => {
    const rules = await findingRules(
      path.join(fixturesRoot, "marketplace-source-missing"),
    );
    expect(rules).toContain("marketplace_source_missing");
  });

  it("rejects a SKILL.md outside plugin/skills/<slug>/", async () => {
    const rules = await findingRules(
      path.join(fixturesRoot, "skill-outside-skills-dir"),
    );
    expect(rules).toContain("skill_location");
  });

  it("rejects a plugin/skills/<slug> directory without a SKILL.md", async () => {
    const rules = await findingRules(
      path.join(fixturesRoot, "skill-dir-without-skill-md"),
    );
    expect(rules).toContain("skill_missing_skill_md");
  });

  it("rejects an extra entry inside plugin/.claude-plugin/", async () => {
    const rules = await findingRules(
      path.join(fixturesRoot, "manifest-dir-extra-entry"),
    );
    expect(rules).toContain("plugin_manifest_dir_extra_entry");
  });

  it("reports skill_location for a SKILL.md placed inside plugin/.claude-plugin/", async () => {
    const rules = await findingRules(
      path.join(fixturesRoot, "skill-inside-manifest-dir"),
    );
    expect(rules).toContain("skill_location");
    expect(rules).toContain("plugin_manifest_dir_extra_entry");
  });
});

describe("claude plugin validate --strict", () => {
  it.skipIf(!claudeAvailable)("passes for ./plugin", async () => {
    await expect(
      execFileAsync("claude", ["plugin", "validate", "--strict", "./plugin"], {
        cwd: repoRoot,
      }),
    ).resolves.toBeDefined();
  });

  it.skipIf(!claudeAvailable)("passes for the repository root", async () => {
    await expect(
      execFileAsync("claude", ["plugin", "validate", "--strict", "."], {
        cwd: repoRoot,
      }),
    ).resolves.toBeDefined();
  });

  if (!claudeAvailable) {
    it.skip("claude CLI not found on PATH, skipping strict validation", () => {});
  }
});
