import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PORTABLE_FRONTMATTER_KEYS,
  parseFrontmatter,
  readSkill,
  validateSkillDir,
} from "../scripts/read-skill.js";

const repoRoot = path.resolve(__dirname, "..");
const skillsRoot = path.join(repoRoot, "plugin", "skills");
const fixturesRoot = path.join(__dirname, "fixtures", "invalid", "skills");

const SHIPPED_SKILLS = ["create-skill", "using-parcel-mcp"];
const MAX_SKILL_BYTES = 12 * 1024;
const MAX_NAME_CHARS = 64;
const MAX_DESCRIPTION_CHARS = 512;

async function rules(dir: string): Promise<string[]> {
  const findings = await validateSkillDir(dir);
  return findings.map((f) => f.rule);
}

describe("shipped skills", () => {
  it("ships exactly the two launch skills", async () => {
    const entries = await fs.readdir(skillsRoot);
    expect(entries.sort()).toEqual(SHIPPED_SKILLS);
  });

  for (const slug of SHIPPED_SKILLS) {
    describe(slug, () => {
      const dir = path.join(skillsRoot, slug);

      it("has no validation findings", async () => {
        expect(await validateSkillDir(dir)).toEqual([]);
      });

      it("directory name and frontmatter name match", async () => {
        const skill = await readSkill(dir);
        expect(skill.slug).toBe(slug);
        expect(skill.frontmatter.name).toBe(slug);
      });

      it("carries exactly the five portable frontmatter keys", async () => {
        const skill = await readSkill(dir);
        expect(Object.keys(skill.frontmatter).sort()).toEqual(
          [...PORTABLE_FRONTMATTER_KEYS].sort(),
        );
        expect(skill.frontmatter).not.toHaveProperty("version");
        expect(skill.frontmatter).not.toHaveProperty("allowed-tools");
      });

      it("bounds name and description", async () => {
        const skill = await readSkill(dir);
        const name = skill.frontmatter.name as string;
        const description = skill.frontmatter.description as string;
        expect(name.length).toBeLessThanOrEqual(MAX_NAME_CHARS);
        expect(description.length).toBeGreaterThan(0);
        expect(description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS);
      });

      it("declares Apache-2.0 and a compatibility string", async () => {
        const skill = await readSkill(dir);
        expect(skill.frontmatter.license).toBe("Apache-2.0");
        expect(typeof skill.frontmatter.compatibility).toBe("string");
      });

      it("carries parcel metadata with schema-version 1 and a semver version", async () => {
        const skill = await readSkill(dir);
        const parcel = (
          skill.frontmatter.metadata as Record<string, Record<string, unknown>>
        ).parcel;
        expect(parcel["schema-version"]).toBe(1);
        expect(parcel.version).toMatch(/^\d+\.\d+\.\d+$/);
      });

      it("is external-only across all four visibility flags", async () => {
        const skill = await readSkill(dir);
        const parcel = (
          skill.frontmatter.metadata as Record<string, Record<string, unknown>>
        ).parcel;
        expect(parcel.visibility).toEqual({
          "claude-plugin": true,
          "parcel-explore": false,
          "parcel-installable": false,
          "parcel-runtime": false,
        });
      });

      it("opens with a delimiter on line 1 and uses LF endings", async () => {
        const raw = await fs.readFile(path.join(dir, "SKILL.md"), "utf8");
        expect(raw.split("\n")[0]).toBe("---");
        expect(raw).not.toContain("\r");
      });

      it("stays under the size budget", async () => {
        const raw = await fs.readFile(path.join(dir, "SKILL.md"));
        expect(raw.byteLength).toBeLessThanOrEqual(MAX_SKILL_BYTES);
      });

      it("ships only allowed file extensions and every referenced file", async () => {
        const skill = await readSkill(dir);
        for (const file of skill.files) {
          expect([".md", ".json", ".txt"]).toContain(path.extname(file));
        }
        expect(await rules(dir)).not.toContain("skill_missing_referenced_file");
      });

      it("contains no shebang, injection token, credential, local path, mutable fetch, or authority claim", async () => {
        const raw = await fs.readFile(path.join(dir, "SKILL.md"), "utf8");
        expect(raw).not.toMatch(/^#!/m);
        expect(raw).not.toContain("${CLAUDE_PLUGIN_ROOT}");
        expect(raw).not.toContain("${CLAUDE_SKILL_DIR}");
        expect(raw).not.toContain("$ARGUMENTS");
        expect(raw).not.toMatch(/!`/);
        expect(raw).not.toMatch(/raw\.githubusercontent\.com/);
        expect(raw).not.toMatch(
          /grants? (you )?(permission|access|authority)/i,
        );
        expect(raw).not.toContain("\u2014");
      });
    });
  }
});

describe("parseFrontmatter", () => {
  it("parses a document whose first line is a delimiter", () => {
    const parsed = parseFrontmatter("---\nname: a\n---\nbody\n");
    expect(parsed.frontmatter).toEqual({ name: "a" });
    expect(parsed.body.trim()).toBe("body");
  });

  it("tolerates trailing spaces on the delimiter line", () => {
    const parsed = parseFrontmatter("--- \nname: a\n---\t\nbody\n");
    expect(parsed.frontmatter).toEqual({ name: "a" });
  });

  it("rejects a file that does not open with a delimiter", () => {
    expect(() => parseFrontmatter("\n---\nname: a\n---\n")).toThrow();
  });

  it("rejects YAML aliases", () => {
    expect(() =>
      parseFrontmatter("---\na: &x 1\nb: *x\n---\nbody\n"),
    ).toThrow();
  });
});

describe("invalid skill fixtures", () => {
  const cases: Array<[string, string]> = [
    ["name-dir-mismatch", "skill_name_dir_mismatch"],
    ["extra-frontmatter-key", "skill_frontmatter_unexpected_key_allowed_tools"],
    ["top-level-version", "skill_frontmatter_unexpected_key_version"],
    ["missing-schema-version", "skill_metadata_schema_version_invalid"],
    ["non-semver-version", "skill_metadata_version_not_semver"],
    ["missing-visibility-flag", "skill_visibility_missing_flag_parcel_runtime"],
    ["wrong-visibility-flag", "skill_visibility_flag_value_parcel_explore"],
    ["missing-referenced-file", "skill_missing_referenced_file"],
    ["shebang-line", "skill_body_shebang"],
    ["dynamic-injection", "skill_body_dynamic_injection"],
    ["credential-shape", "skill_body_credential_shape"],
    ["local-path", "skill_body_local_path"],
    ["mutable-github-fetch", "skill_body_mutable_github_fetch"],
    ["permission-claim", "skill_body_permission_claim"],
    ["yaml-alias", "skill_frontmatter_yaml_alias"],
    ["em-dash", "skill_body_em_dash"],
  ];

  for (const [fixture, rule] of cases) {
    it(`${fixture} reports ${rule}`, async () => {
      expect(await rules(path.join(fixturesRoot, fixture))).toContain(rule);
    });
  }

  it("every fixture fires only the rule it is named for", async () => {
    for (const [fixture, rule] of cases) {
      const found = await rules(path.join(fixturesRoot, fixture));
      expect({ fixture, found }).toEqual({ fixture, found: [rule] });
    }
  });
});
