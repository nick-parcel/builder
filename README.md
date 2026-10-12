# Parcel builder plugin

Connect an AI client to Parcel over OAuth and use open Parcel skills.

## Prerequisites

- The Claude Code CLI.
- A Parcel workspace on the Pro plan, which is what gates the MCP surface.

Nothing else. The plugin ships no executable content: only a manifest, an MCP
server declaration, and skill prose.

## Install

```
claude plugin marketplace add nick-parcel/builder
claude plugin install builder@builder
```

Verify the install:

```
claude plugin list
```

`builder@builder` should appear as enabled, with seven skills and one MCP
server.

To develop against a checked-out copy of this repository, add the marketplace
from a local path instead of the GitHub shorthand, then install the same
plugin:

```
claude plugin marketplace add /path/to/your/builder/checkout
claude plugin install builder@builder
```

### Claude organization plugin upload

Claude organization settings take a plugin as a zip archive rather than a
marketplace reference. A rolling bundle of the current `main` is published at:

```
https://github.com/nick-parcel/builder/releases/download/claude-org-plugin/builder-plugin.zip
```

Download that file and upload it in the organization's plugin settings. The
archive holds the contents of `plugin/`, so `.claude-plugin/plugin.json` sits
at the archive root, which is the layout the uploader expects.

## Connect Parcel

The plugin registers a remote MCP server named `parcel` at
`https://mcp.parcelengineering.com/mcp`. It never embeds a token, header, or
credential. The first time a tool is needed, your client prompts you to
complete an OAuth authorization in the browser and stores the grant itself.

You can start that flow yourself with `/mcp` inside Claude Code, or with
`claude mcp login parcel` from a shell. Never paste an access token or a
bearer header into a chat, a skill, or this repository. If a call fails with
an authorization error, reconnect through your client's own MCP settings.

## Skills

| Skill | Description |
| --- | --- |
| `/builder:using-parcel-mcp` | Connect to Parcel, discover which tools and scope groups the grant carries, search Parcel data, read or update workspace records, and explain a refusal honestly. |
| `/builder:create-skill` | Author, test, revise, and publish a Parcel skill through Parcel's MCP skill tools, including description triggering, the Personal or Workspace audience choice, and revision conflicts. |
| `/builder:build-icp` | Set up or update the firm's ICP, save it as the workspace's own `icp` skill, set ICP tiers on accounts, and offer matching alerts. |
| `/builder:build-prospect-list` | Rank active projects and the accounts behind them into Priority, Secondary, and Watch, with a reason and the unknowns for every row. |
| `/builder:project-brief` | Brief one project: stage, dated timeline, team and open seats, the players and who they hire, ICP fit with a go or no-go, and talking points. |
| `/builder:research-and-write-outreach` | Research an account and its projects, then draft a short email anchored on a dated public signal. Never sends. |
| `/builder:create-crm-opportunity` | Turn a Parcel project into one HubSpot deal or Salesforce opportunity under the account you choose, updating instead of duplicating. |

### `/builder:using-parcel-mcp`

Picks up when you ask what tools you have, want Parcel data searched, want a
workspace record read or updated, or want to know why a call was refused. It
inspects the live grant instead of reciting a tool list from memory, checks
fields before composing an unfamiliar filter, and reports scope, plan, and
expired-grant refusals rather than routing around them.

```
/builder:using-parcel-mcp what tools do I have
```

### `/builder:create-skill`

Picks up when you want to write, revise, or publish a Parcel skill. It meets
you wherever you already are in the loop, drafts from your own words, tries
the draft on realistic test prompts and shows you the results, helps you write
a description that actually triggers, asks which audience the skill is for,
waits for your approval before publishing, and recovers from a revision
conflict by re-reading the draft instead of overwriting someone else's edit.

```
/builder:create-skill draft a workspace skill for weekly account reviews
```

### `/builder:build-icp`

Picks up when you want to define or update who the firm targets. It reads what
your workspace already shows, asks at most three rounds of questions with a
recommended answer each, saves the profile as a Workspace skill named `icp`
after you approve, and offers ICP tiers and alerts as separate approved writes.

```
/builder:build-icp set up our ICP
```

### `/builder:build-prospect-list`

Picks up when you ask who to focus on. It loads your `icp` skill, pulls active
projects that fit, drops the ones whose seat is already filled, and sorts the
rest into Priority, Secondary, and Watch with a dated reason per row and the
client account behind each project.

```
/builder:build-prospect-list top projects in Somerville this month
```

### `/builder:project-brief`

Picks up when you want to get ready for one project. It lays out the facts, a
dated signal timeline, the team with your open seat called out, who the
developer and architect usually hire, a go or no-go against your ICP, talking
points tied to dated facts, and what Parcel does not show yet.

```
/builder:project-brief 101 Main St, Somerville
```

### `/builder:research-and-write-outreach`

Picks up when you want to email a developer, architect, or contact. It
researches the account and its projects, anchors a short draft on one dated
public signal and one proof point from your ICP, and leaves sending to you.

```
/builder:research-and-write-outreach email the developer of 101 Main St
```

### `/builder:create-crm-opportunity`

Picks up when you want a project in HubSpot or Salesforce. It asks which
account the opportunity belongs to, searches for an existing one before
creating anything, builds one opportunity per project from your ICP's CRM
defaults, and waits for your approval before every CRM write.

```
/builder:create-crm-opportunity add 101 Main St to HubSpot
```

## Other AI clients

Cursor and Codex mirrors of this plugin are planned. Until they ship, point
any other MCP client at Parcel directly by following the MCP setup pages in
the Parcel developer documentation:
<https://docs.parcelengineering.com/developers/mcp-reference/>.

## Org preferences

`docs/org-instructions/` holds text an administrator can paste into Claude
organization preferences so that questions about accounts, contacts,
projects, signals, saved views, and Parcel skills reach the Parcel MCP server
without anyone having to say "using Parcel". Start with
[docs/org-instructions/README.md](./docs/org-instructions/README.md).

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
through a checked-in sync tool; it never fetches GitHub at runtime. Every
skill's version in `catalog.json` equals `PLUGIN_VERSION`, since each skill's
`metadata.parcel.version` always tracks the plugin manifest version.

The `claude-org-plugin` zip described above is separate: it rolls forward with
`main` and is not tied to a tag.

## Verification status

Release 0.2.0 was certified by a clean-room install, uninstall, and reinstall
of the plugin from a fresh client profile; by `claude plugin validate
--strict` against the plugin and the marketplace; by deterministic artifact
verification (`pnpm check:generated`) and a byte-for-byte rebuild of the
tagged commit; and by this repository's automated format and eval tests.

The live OAuth authorization flow and a live skill-lifecycle exercise
against production Parcel MCP are not part of this repository's CI. The
maintainer performs that exercise on the Parcel side as a pre-merge check
before each import of a tagged release.

## Security

Skills in `plugin/` are content only: no hooks, no executables, no scripts,
and no secrets. See [SECURITY.md](./SECURITY.md) for how to report
vulnerabilities or exposed credentials through private vulnerability
reporting; do not open a public issue.

## License

Apache-2.0. See [LICENSE](./LICENSE).
