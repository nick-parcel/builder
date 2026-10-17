# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-10-17

### Changed

- The firm's ICP lives in the workspace's knowledge as the page ICP in the Go-to-market folder, not in a workspace skill named icp. build-icp creates or edits that page (Parcel shows the change to approve) and still proposes ICP tiers, alert subscriptions, and a view. build-prospect-list, project-brief, research-and-write-outreach, and create-crm-opportunity read the page, and outreach also reads knowledge about positioning, proof points, and messaging.
- create-skill and using-parcel-mcp use Parcel's three skill tools: `find_skill` (a phrase is a ranked search, filters list skills), `get_skill` (a file with `path`), and `manage_skill` (every write, chosen by `command`). using-parcel-mcp describes the knowledge tools.

## [0.3.2] - 2026-10-13

### Changed

- project-brief and research-and-write-outreach no longer tell the assistant to announce that web search spends credits before searching. The host shows usage and cost; the skills keep dating every web fact.

## [0.3.1] - 2026-10-13

### Changed

- The shared data notes count stalled projects as prospects, ranked behind active ones. Stalled only means no new filing for 18 months before a permit, and most stalled projects are approved or under review. Denied, withdrawn, expired, and cancelled projects are still not prospects.
- build-prospect-list pulls active and stalled candidates, reads disposition, puts active ahead of stalled within each bucket, and shows disposition in its project table. research-and-write-outreach researches an account's active and stalled projects.

### Fixed

- build-icp no longer offers a saved view "of active projects": a view cannot filter by disposition, so the offer now says the view also lists closed projects.

## [0.3.0] - 2026-10-12

### Added

- Five Parcel business skills on every surface (Claude plugin, Parcel Explore, install, and Spec runtime): build-icp, build-prospect-list, project-brief, research-and-write-outreach, create-crm-opportunity.
- Shared Parcel data notes carried by each business skill, and contract tests that keep the notes identical, the skills within budget, and their wording tool-agnostic.

### Changed

- The validator accepts a second visibility profile with all four flags on; any other mix is still refused.

## [0.2.3] - 2026-09-17

### Fixed

- create-skill no longer tells a custom skill to carry `metadata.parcel`, which Parcel reserves for official skills and refuses as `frontmatter.metadata_reserved`; every create attempt through Spec failed on it.

## [0.2.2] - 2026-09-05

### Changed

- create-skill rewritten as a coaching loop: meets the member where they are, plain-language mode, description-writing guidance with a trigger test, test-prompt iteration, and managing existing skills.

## [0.2.1] - 2026-09-05

### Fixed

- Skill versions now track the plugin version (0.2.0 shipped changed skill content at version 0.1.0); the validator enforces it.

## [0.2.0] - 2026-09-05

### Changed

- Renamed the marketplace and the plugin to `builder`. Install with `claude plugin marketplace add nick-parcel/builder` then `claude plugin install builder@builder`, and invoke the skills as `/builder:using-parcel-mcp` and `/builder:create-skill`.
- Pointed the homepage, repository, schema ids, and the release artifact contract at `nick-parcel/builder`.
- Rewrote both skill descriptions to lead with the phrases people type and to name the sibling skill to use instead, so the two skills never compete for the same request.
- Rewrote `README.md` as the plugin catalog: prerequisites, install, connecting Parcel over OAuth, a skill table with an example invocation each, other AI clients, and release artifacts.

### Added

- `docs/org-instructions/` with short and long text an administrator can paste into Claude organization preferences so Parcel questions route to the Parcel MCP server by default.
- Rolling `claude-org-plugin` release publishing `builder-plugin.zip`, the contents of `plugin/` with the manifest at the archive root, for upload in Claude organization plugin settings.
- CI hardening carried over from PR #12: actions pinned to commit SHAs and read-only workflow permissions.

## [0.1.0] - 2026-09-04

### Added

- Claude Code plugin manifest and MCP server declaration connecting clients to Parcel's Developer MCP over OAuth.
- `using-parcel-mcp` skill: connecting to Parcel's remote MCP server, discovering tools and scopes, and explaining refusals honestly.
- `create-skill` skill: authoring, revising, and publishing a Parcel skill through the MCP skill tools.
- Repository validator enforcing skill layout, frontmatter, and manifest correctness.
- Deterministic release artifact builder producing a content-addressed catalog and per-skill bundles.
- CI workflow running lint, typecheck, test, validation, plugin checks, and secret scanning on every pull request and push to `main`.
- Release workflow that builds and publishes reproducible release artifacts when a `v*` tag is pushed.
