---
name: create-skill
description: Use when someone says create a Parcel skill, draft or revise a skill bundle, publish this skill, pick a Personal or Workspace audience, or fix the revision conflict on a draft. Do not use for general Parcel data questions such as searching accounts or reading workspace records, use `/builder:using-parcel-mcp` instead. Do not use for connecting or reauthorizing the MCP grant, use `/builder:using-parcel-mcp` instead.
license: Apache-2.0
compatibility: Any MCP client connected to Parcel with the skills read and write scope groups granted
metadata:
  parcel:
    schema-version: 1
    version: 0.2.1
    visibility:
      claude-plugin: true
      parcel-explore: false
      parcel-installable: false
      parcel-runtime: false
---

# Authoring a Parcel skill

## Overview

A Parcel skill is a portable Markdown bundle that Parcel stores as a draft, then as a published revision. You draft it with Parcel's MCP skill tools. Publishing is a human decision, and a skill never confers authority: it is instruction text, and the reader's grant still decides what may run.

If the person would rather write Markdown by hand, say so: the Parcel app has a Markdown editor for skills and no model has to be involved. That is a complete alternative, not a fallback.

## Interview before you draft

Never draft from a one-line request. Collect all five, in the person's words:

1. Purpose: the job the skill does, in one sentence.
2. Triggers: the situations where a reader should pick it up.
3. Expected output: what the reader should produce when it applies.
4. Examples: one real case, with the input and the good result.
5. Success criteria: how you would both know the skill worked.

If any answer is missing, ask. A skill written from guesses fails quietly and is expensive to unwind.

## Workflow

1. Call `find_skill` with the person's own words, and `list_skills` to see what the workspace already has. If a close match exists, propose revising it. Two skills that trigger on the same situation both lose.
2. Confirm the audience, then call `create_skill` with `audience` and a portable bundle. Personal keeps it private to its owner; Workspace makes it available to every active member. Ask; do not infer from tone.
3. Call `get_skill` to read the stored source and the current `draftVersion`. It takes a `locator`, never a bare id, and it needs `view: "draft"` or it returns the published revision instead. Read what Parcel stored, not what you meant to send.
4. Propose three realistic test prompts, run them past the person, and fold the result into a revision with `update_skill`, carrying the `expectedDraftVersion` you just read.
5. Stop and ask for approval to publish. When the person approves that specific call, and only then, call `publish_skill` with the current `expectedDraftVersion`.

Every write takes an `idempotencyKey`. Generate a fresh one per logical write and reuse it only when retrying that same write.

## Bundle shape

Frontmatter is portable and carries exactly these keys. Host execution fields such as `version`, `allowed-tools`, `tools`, `hooks`, `commands`, or `scripts` are refused.

```text
---
name: <skill-slug>
description: Use when <trigger>, <trigger>, or <trigger>.
license: Apache-2.0
compatibility: <where this skill applies>
metadata:
  parcel:
    schema-version: 1
    version: 0.1.0
---
```

The slug must match `^[a-z0-9]+(-[a-z0-9]+)*$`, and `create-skill` and `improve-skill` are reserved: Parcel refuses them as `slug_conflict` with reason `reserved_slug`. Pick a name for what the reader does.

A minimal create call:

```json
{
  "name": "create_skill",
  "arguments": {
    "audience": "workspace",
    "idempotencyKey": "<unique-key>",
    "bundle": {
      "files": [
        {
          "path": "SKILL.md",
          "mediaType": "text/markdown",
          "content": "---\nname: weekly-pipeline-review\ndescription: Use when preparing the Monday pipeline review.\nlicense: Apache-2.0\ncompatibility: Parcel workspaces that track projects\nmetadata:\n  parcel:\n    schema-version: 1\n    version: 0.1.0\n---\n\n# Weekly pipeline review\n\n..."
        }
      ]
    }
  }
}
```

Reading that draft back:

```json
{
  "name": "get_skill",
  "arguments": {
    "locator": { "source": "custom", "skillId": "<skill-id>", "view": "draft" }
  }
}
```

The `draftVersion` in that response is the exact value to send as `expectedDraftVersion` on the next `update_skill` or `publish_skill`. To inspect a supporting file rather than SKILL.md, call `get_skill_file` with the same locator plus `path`.

Supporting files may be `.md`, `.markdown`, `.txt`, or `.json`, with a media type matching the extension. Every relative Markdown link must point at a file you shipped in the same bundle.

## Revising without overwriting

`update_skill` and `publish_skill` both take `expectedDraftVersion`. If someone edited the draft since your last read, Parcel answers `revision_conflict` with reason `stale_draft_version` and `details.currentDraftVersion`.

```json
{
  "error": {
    "code": "revision_conflict",
    "reason": "stale_draft_version",
    "details": { "currentDraftVersion": 4 }
  }
}
```

Recover in this order, every time:

1. Call `get_skill` again and read the current draft.
2. Tell the person what changed underneath you.
3. Reapply your edit on top of the new text and call `update_skill` with the version Parcel just reported.

Never take `details.currentDraftVersion` and resend your old body against it. That is a silent overwrite of someone else's work.

## Audience and moderation

- Personal skills belong to one member. Do not read, revise, move, or publish another member's Personal skill, and do not ask them to hand you one.
- API-key principals never touch Personal skills at all. A `forbidden` answer with reason `personal_denied` is the correct behavior, not an obstacle. Move the work to a Workspace skill or to an interactive session.
- Any active member may create and publish a Workspace skill. Owners and admins may additionally unpublish, delete, transfer, or otherwise moderate one, but moderation never changes who authored it. Never describe an owner action as authorship.
- Drafts are never discoverable. If the person expects a colleague to find the skill, it has to be published.

## Handling refusals honestly

| Error code | Usual cause | What to do |
| --- | --- | --- |
| `validation` | The bundle broke a format rule | Read the reason, fix the bundle, resend |
| `limit_exceeded` | Too many files or too much content | Cut scope, do not split into decoy skills |
| `slug_conflict` | Name taken or reserved | Propose a new name to the person |
| `revision_conflict` | Stale `expectedDraftVersion` | Re-read, reapply, retry |
| `forbidden` | Scope, role, or Personal boundary | Report it and stop |
| `lifecycle_conflict` | The skill is not in a state that allows this | Read the lifecycle back with `get_skill` |

Validation reasons describe the rule, not your content. Fix the bundle rather than asking the person to relax the rule.

## Red flags

- Calling `publish_skill` because the draft looks finished. Publishing needs the person's approval of that call.
- Resending a body after a conflict without re-reading the draft first.
- Writing frontmatter keys that the portable format does not allow, then wondering why validation fails.
- Reusing one idempotency key across different writes.
- Creating a second skill that triggers on the same situation as an existing one.
