---
name: using-parcel-mcp
description: Use when someone says connect Parcel, what Parcel tools do I have, search Parcel for an account or contact, read or update a workspace record, or why did Parcel refuse that, including reconnecting an expired OAuth grant and reporting a scope or plan refusal honestly. Do not use for authoring, revising, or publishing a Parcel skill, use `/builder:create-skill` instead.
license: Apache-2.0
compatibility: Any MCP client that can connect to a remote HTTP MCP server and complete an OAuth authorization flow
metadata:
  parcel:
    schema-version: 1
    version: 0.2.2
    visibility:
      claude-plugin: true
      parcel-explore: false
      parcel-installable: false
      parcel-runtime: false
---

# Using Parcel over MCP

## Overview

Parcel serves a remote HTTP MCP server at `https://mcp.parcelengineering.com/mcp`. Everything you may do there is decided by the OAuth grant the person authorized, by their plan, and by their client's approval prompt. This skill is documentation; reading it changes none of those.

Two facts drive every decision below:

- The tool list and the scope groups are properties of the live grant, not of this document. Inspect them.
- The workspace is pinned by the grant. No Parcel tool takes a workspace id, so there is nothing to guess.

## Connect first

If Parcel tools are missing or every call returns an authorization error, the grant is not connected. Ask the person to complete their client's own flow:

- Claude Code: run `/mcp`, or `claude mcp login parcel`.
- Other hosts: use that host's connector or authorization screen.

Never ask for a token, header, cookie, or API key, and never offer to paste one anywhere. The OAuth flow is the only path.

## Workflow

1. Call `tools/list` and read what the grant actually exposes, including which scope groups it carries. Do not assume a fixed inventory; it changes between releases and between grants.
2. Call `workspace_get_info` to pin the workspace and read its plan, entitlements, and settings before acting. It costs no credits. Use `workspace_get_credits` when the person asks what a search will leave them.
3. Call `search_fields` (and `get_fields` for one field) before composing any filter you have not used before. Field discovery costs no credits and returns the real filter keys and enum values, so it replaces guessing.
4. Call the data tool itself, for example `search_contacts`, with the filter you just verified. Report what came back, then stop and let the person choose the next step.

Work with the identifiers the server gave you in an earlier response. If you do not have an id, search for the record instead of inventing one; a fabricated id is a wrong answer, not a shortcut.

## Global data tools and workspace tools

| Family | What it touches | What it costs |
| --- | --- | --- |
| `search_*` and `get_*` over accounts, contacts, projects, signals | Parcel's own datasets | credits per record returned |
| `search_fields`, `get_fields`, `workspace_get_info`, `workspace_get_credits` | Schema and account context | no credits |
| `workspace_*` reads and writes | This member's own workspace book, Views, subscriptions, members, invitations | no credits for reads |

Global reads spend the workspace's credits, so say what a broad search will cost before you run it and prefer a narrow filter. Workspace writes change the person's own records, so name the record and the field you are about to change before you call the tool. Destructive deletes and membership changes are not offered to MCP clients at all; when someone asks for one, say it belongs in the Parcel app.

## Approvals

The client's own approval prompt is the only confirmation surface. Parcel cannot draw a confirmation card inside another product. So:

- Ask for a decision in your own words before a write or an expensive search, and let the client's prompt do the rest.
- If the person declines, stop. Do not re-run the same call with a smaller argument to slip past the prompt.
- Never describe a tool as pre-approved because it appeared in `tools/list`.

## When a call is refused

Report the refusal in plain language, say what would fix it, and stop. Do not retry a refused call unchanged, and do not route around it with a different tool.

| What you see | What it means | What to say |
| --- | --- | --- |
| Tool missing from `tools/list` | The grant does not carry that scope group | The grant needs to be reauthorized with the missing scope group selected |
| `forbidden` on a tool that exists | The scope, role, or principal is not allowed here | Name the scope group and let the person decide |
| Plan refusal | The workspace is not on the Pro plan | The plan gates the whole MCP surface; upgrading is the person's call |
| 401 or `unauthorized` mid-session | The grant expired or was revoked | Reconnect through the host, then retry once |
| Skill tools absent on an older grant | The grant predates skill scopes | Reconnect so `skills:read` and `skills:write` are included |

Say "this grant cannot do that" and stop. Guessing an id, retrying in a loop, or telling the person a refusal is a bug is worse than the refusal.

## Red flags

- Writing a workspace id into any argument.
- Composing a filter from a field name you have not seen in `search_fields`.
- Listing Parcel's tools, prices, or plan limits from memory instead of from the live response.
- Running a broad global search "to see what happens" while credits are metered.
- Explaining away a refusal instead of reporting it.
