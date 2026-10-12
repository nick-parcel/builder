import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readSkill, validateSkillDir } from "../scripts/read-skill.js";
import { BUSINESS_SKILLS } from "./helpers/shipped-skills.js";

const skillsRoot = path.join(__dirname, "..", "plugin", "skills");
const promptsRoot = path.join(__dirname, "prompts");
const CANONICAL_NOTES = path.join(
  skillsRoot,
  "build-icp",
  "reference",
  "parcel-data.md",
);
const MAX_BUSINESS_SKILL_BYTES = 10 * 1024;
// Business skills name intents, never tools, so one file reads the same in Spec and over MCP.
const TOOL_NAME =
  /\b(query_data|web_search|ask_member|find_skill|get_skill|list_skills|create_skill|update_skill|publish_skill|search_[a-z_]+|get_[a-z_]+|workspace_[a-z_]+)\b/;

// Phrases each skill must keep; they carry the behavior the design settled.
const CONTRACTS: Record<string, readonly string[]> = {
  "build-icp": [
    "named `icp`",
    "workspace skill",
    "batches of up to 100",
    "approves publishing",
  ],
  "build-prospect-list": [
    "load the workspace's `icp` skill",
    "priority:",
    "secondary:",
    "watch:",
    "not named in public filings yet",
  ],
  "project-brief": [
    "load the workspace's `icp` skill",
    "unknowns",
    "spends credits",
    "go or no-go",
  ],
  "research-and-write-outreach": [
    "load the workspace's `icp` skill",
    "never send",
    "never invent an email address",
    "150 words or fewer",
  ],
  "create-crm-opportunity": [
    "load the workspace's `icp` skill",
    "never pick the account yourself",
    "one opportunity per project",
    "search before you create",
    "`in-crm`",
    "never put construction cost in the amount",
  ],
};

describe("shared data notes", () => {
  it("teaches append-only notes and tags, and waiting for a yes", async () => {
    const notes = await fs.readFile(CANONICAL_NOTES, "utf8");
    expect(notes).toContain("read the record's current notes and tags first");
    expect(notes).toContain(
      "Never send a note or tag list that drops what was already there.",
    );
    expect(notes).toContain("Wait for the member's yes before every write.");
  });
});

describe("build-icp template", () => {
  const template = path.join(
    skillsRoot,
    "build-icp",
    "reference",
    "icp-template.md",
  );

  it("keeps the headings the other skills read by name", async () => {
    const body = await fs.readFile(template, "utf8");
    for (const heading of [
      "## Who we are",
      "## Target accounts",
      "## Target projects",
      "## Priority buckets",
      "## Why-now signals",
      "## Outreach voice",
      "## CRM defaults",
    ]) {
      expect(body).toContain(heading);
    }
  });

  it("names intents, not tool names", async () => {
    expect(await fs.readFile(template, "utf8")).not.toMatch(TOOL_NAME);
  });
});

describe.each(BUSINESS_SKILLS)("%s business skill", (slug) => {
  const dir = path.join(skillsRoot, slug);
  const read = (file: string) => fs.readFile(path.join(dir, file), "utf8");

  it("validates cleanly", async () => {
    expect(await validateSkillDir(dir)).toEqual([]);
  });

  it("fits the Spec loading budget", async () => {
    const stat = await fs.stat(path.join(dir, "SKILL.md"));
    expect(stat.size).toBeLessThanOrEqual(MAX_BUSINESS_SKILL_BYTES);
  });

  it("carries the shared data notes byte for byte and links them", async () => {
    expect(await read("reference/parcel-data.md")).toBe(
      await fs.readFile(CANONICAL_NOTES, "utf8"),
    );
    expect(await read("SKILL.md")).toContain("](reference/parcel-data.md)");
  });

  it("names intents, not tool names", async () => {
    for (const file of ["SKILL.md", "reference/parcel-data.md"]) {
      expect(await read(file)).not.toMatch(TOOL_NAME);
    }
  });

  it("uses the product's vocabulary", async () => {
    expect(await read("SKILL.md")).not.toMatch(/strike zone/i);
  });

  it("routes neighbors to sibling skills by name", async () => {
    const skill = await readSkill(dir);
    const description = skill.frontmatter.description as string;
    expect(description).toContain("Do not use for");
    expect(description).not.toContain("/builder:");
    for (const sibling of BUSINESS_SKILLS.filter((other) => other !== slug)) {
      if (description.includes(sibling)) {
        expect(description).toContain(`the ${sibling} skill`);
      }
    }
  });

  it("keeps its behavior contract", async () => {
    const body = (await read("SKILL.md")).toLowerCase();
    const phrases = CONTRACTS[slug] ?? [];
    expect(phrases.length).toBeGreaterThan(0);
    for (const phrase of phrases) expect(body).toContain(phrase.toLowerCase());
  });

  it("ships live test prompts", async () => {
    const prompts = await fs.readFile(
      path.join(promptsRoot, `${slug}.md`),
      "utf8",
    );
    expect(prompts).toContain("## Should trigger");
    expect(prompts).toContain("## Should not trigger");
    expect(prompts).toContain("## Behavior checks");
  });
});
