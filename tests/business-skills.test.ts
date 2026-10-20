import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BUSINESS_SKILLS, SHIPPED_SKILLS } from "./helpers/shipped-skills.js";

const skillsRoot = path.join(__dirname, "..", "plugin", "skills");

describe("business skills", () => {
  it("ships none until they are rebuilt on knowledge", async () => {
    expect(BUSINESS_SKILLS).toEqual([]);
    expect([...SHIPPED_SKILLS]).toEqual(["create-skill", "using-parcel-mcp"]);
    expect((await fs.readdir(skillsRoot)).sort()).toEqual([
      "create-skill",
      "using-parcel-mcp",
    ]);
  });
});
