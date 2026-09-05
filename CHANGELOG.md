# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-09-04

### Added

- Claude Code plugin manifest and MCP server declaration connecting clients to Parcel's Developer MCP over OAuth.
- `using-parcel-mcp` skill: connecting to Parcel's remote MCP server, discovering tools and scopes, and explaining refusals honestly.
- `create-skill` skill: authoring, revising, and publishing a Parcel skill through the MCP skill tools.
- Repository validator enforcing skill layout, frontmatter, and manifest correctness.
- Deterministic release artifact builder producing a content-addressed catalog and per-skill bundles.
- CI workflow running lint, typecheck, test, validation, plugin checks, and secret scanning on every pull request and push to `main`.
- Release workflow that builds and publishes reproducible release artifacts when a `v*` tag is pushed.
