# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
