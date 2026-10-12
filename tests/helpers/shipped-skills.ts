// The skills plugin/skills ships, split by visibility profile; later tasks append business slugs.
export const PLUGIN_VERSION = "0.3.0";

export const EXTERNAL_ONLY_SKILLS: readonly string[] = [
  "create-skill",
  "using-parcel-mcp",
];

export const BUSINESS_SKILLS: string[] = [
  "build-icp",
  "build-prospect-list",
  "project-brief",
  "research-and-write-outreach",
  "create-crm-opportunity",
];

export const SHIPPED_SKILLS: readonly string[] = [
  ...EXTERNAL_ONLY_SKILLS,
  ...BUSINESS_SKILLS,
].sort();

export function expectedVisibility(slug: string): Record<string, boolean> {
  const on = BUSINESS_SKILLS.includes(slug);
  return {
    "claude-plugin": true,
    "parcel-explore": on,
    "parcel-installable": on,
    "parcel-runtime": on,
  };
}
