# Parcel Skills

This repository holds open Parcel skills and a content-only Claude Code plugin
that connects clients to Parcel's Developer MCP at
`https://mcp.parcelengineering.com/mcp` over OAuth.

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

## Security

See [SECURITY.md](./SECURITY.md) for how to report vulnerabilities or
exposed credentials.
