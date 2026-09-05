# Parcel Skills

This repository holds open Parcel skills and a content-only Claude Code
plugin that connects clients to Parcel's Developer MCP at
`https://mcp.parcelengineering.com/mcp` over OAuth.

## What this plugin is

The `parcel` plugin gives an AI client an MCP connection to Parcel plus two
skills that teach it how to use that connection well. The plugin ships no
executable content: only a manifest, an MCP server declaration, and skill
prose.

## Skills

- `using-parcel-mcp`: connects to Parcel's remote MCP server, discovers which
  tools and scope groups are granted, and explains scope or grant refusals
  honestly instead of guessing.
- `create-skill`: authors, revises, and publishes a Parcel skill through
  Parcel's MCP skill tools, including choosing a Personal or Workspace
  audience and recovering from a revision conflict.

## Layout

- `plugin/` is the only distributable directory. It ships as a Claude Code
  plugin and contains no executable content, only skills and manifests.
- Everything else in this repository is tooling: CI, tests, scripts, and
  governance documents used to build and validate `plugin/`.

## Install

```
claude plugin marketplace add nick-parcel/parcel-skills
claude plugin install parcel@parcel-skills
```

For local development against a checked-out copy of this repository, add the
marketplace from a local path instead:

```
claude plugin marketplace add /path/to/parcel-skills
claude plugin install parcel@parcel-skills
```

## How OAuth works

The plugin declares Parcel's MCP server but never embeds a token, header, or
credential. When you connect, your client prompts you to complete an OAuth
authorization flow in the browser and stores the resulting grant itself.
Never paste an access token or bearer header into a chat, a skill, or this
repository. If a tool call fails with an authorization error, reconnect
through your client's own MCP or connector settings.

## Security

Skills in `plugin/` are content only: no hooks, no executables, no scripts,
and no secrets. See [SECURITY.md](./SECURITY.md) for how to report
vulnerabilities or exposed credentials through private vulnerability
reporting; do not open a public issue.

## Release artifacts

Each tagged release publishes three kinds of file, built from the exact
commit the tag points at:

- `catalog.json`: an index of every published skill, its version, and its
  content sha256.
- `skills/<slug>.<sha256>.json`: one content-addressed artifact per skill,
  containing the skill's frontmatter, instructions, and files.
- `SHA256SUMS`: the checksums of every artifact in the release, including the
  catalog itself.

These artifacts are reproducible: running `pnpm check:generated` against the
tagged commit, with `SOURCE_COMMIT`, `RELEASE_TAG`, and `PLUGIN_VERSION` set
to match the tag, rebuilds byte-identical files and verifies the working tree
is clean afterward. Parcel imports a tagged release of this repository
through a checked-in sync tool; it never fetches GitHub at runtime.
