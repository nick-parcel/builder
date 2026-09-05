---
name: create-skill
description: Use when someone says create a Parcel skill, save this as a skill, automate this workflow, make Parcel do this every week, draft or revise a skill bundle, publish this skill, pick a Personal or Workspace audience, or fix a revision conflict on a draft. Do not use for general Parcel data questions such as searching accounts or reading records, use `/builder:using-parcel-mcp` instead. Do not use for connecting or reauthorizing the MCP grant, use `/builder:using-parcel-mcp` instead.
license: Apache-2.0
compatibility: Any MCP client connected to Parcel with the skills read and write scope groups granted
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

# Authoring a Parcel skill

## Overview

A Parcel skill is a portable Markdown bundle that Parcel stores as a draft, then as a published revision. You draft it with Parcel's MCP skill tools. Publishing is the person's decision, and a skill never confers authority: it is instruction text, and the reader's grant decides what may run.

If the person would rather write the Markdown themselves, say so: the Parcel app has a skill editor, and that is a complete alternative, not a fallback.

Creating one is a loop, not a form: understand what it should do, draft it, test it on realistic prompts, show the results and ask what they would change, revise, publish once the person approves, then tune the description so it triggers.

Find where the person already is and jump in there. If they arrive with a draft, go straight to testing. If this conversation already holds the workflow, for example someone saying "turn this into a skill", pull the purpose, triggers, steps, and their corrections out of the history first and confirm that summary rather than re-running the interview. If they just want a quick draft, give them one; the loop is a default, not a toll gate.

## Talking to non-technical members

Most people who want a skill know their own work, not a file format. Say "the header at the top of the file" rather than "frontmatter" unless the person is clearly technical. Workflow, template, and test prompt land fine. Explain a term once when in doubt. Nobody should have to learn YAML to get a skill.

## Understand before you draft

A skill written from guesses fails quietly. Collect all five, in the person's words, from the history or by asking:

1. Purpose: the job the skill does, in one sentence.
2. Triggers: the situations and phrases where a reader picks it up.
3. Expected output: what the reader produces when it applies.
4. Examples: one real case, with the input and the good result.
5. Success criteria: how you would both know it worked.

## Workflow

1. Call `find_skill` with the person's own words, and `list_skills` to see what the workspace has. If a close match exists, propose revising it. Two skills that trigger on the same situation both lose.
2. Confirm the audience, then call `create_skill` with `audience` and a portable bundle. Personal keeps it private to its owner; Workspace opens it to every active member. Ask; do not infer from tone.
3. Call `get_skill` to read the stored source and the current `draftVersion`. It takes a `locator`, never a bare id, and needs `view: "draft"` or it returns the published revision instead. Read what Parcel stored, not what you meant to send.
4. Run the test prompts, show the person what came out, and fold their feedback into a revision with `update_skill`, carrying the `expectedDraftVersion` you read.
5. Stop and ask for approval to publish. When the person approves that specific call, and only then, call `publish_skill` with the current `expectedDraftVersion`.

Every write takes an `idempotencyKey`. Generate a fresh one per logical write, and reuse it only when retrying that write.

## Bundle shape

The header carries exactly `name`, `description`, `license`, `compatibility`, and `metadata`, whose `parcel` map holds `schema-version: 1` and a semver `version`. Host execution fields such as a top-level `version`, `allowed-tools`, `tools`, `hooks`, `commands`, or `scripts` are refused.

The slug must match `^[a-z0-9]+(-[a-z0-9]+)*$`. `create-skill` and `improve-skill` are reserved: Parcel refuses them as `slug_conflict` with reason `reserved_slug`. Name the skill for what the reader does.

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
          "content": "---\nname: weekly-pipeline-review\ndescription: Use when preparing the Monday pipeline review.\nlicense: Apache-2.0\ncompatibility: Workspaces that track projects\nmetadata:\n  parcel:\n    schema-version: 1\n    version: 0.1.0\n---\n\n# Weekly pipeline review\n"
        }
      ]
    }
  }
}
```

Read the draft back:

```json
{
  "name": "get_skill",
  "arguments": {
    "locator": { "source": "custom", "skillId": "<skill-id>", "view": "draft" }
  }
}
```

The `draftVersion` in that response is the exact value to send as `expectedDraftVersion` on the next `update_skill` or `publish_skill`. To read a supporting file instead of SKILL.md, call `get_skill_file` with the same locator plus `path`.

## Write the description

The description is the only thing a host reads before deciding whether to open the skill, and hosts under-trigger. Write it for the person who has forgotten the skill exists.

- Use the verbs and nouns people say, not the internal name of the process.
- Name the Parcel concepts it touches: accounts, contacts, projects, signals, views.
- Include near-miss phrases: someone may say "account health check" when they mean the pipeline review, so carry both.
- When a sibling skill covers the neighboring request, add one or two negative-routing sentences naming it, so the two never compete.

```text
Before: Generate a quarterly pipeline review for an account.

After: Use when someone asks for a pipeline review, QBR prep, a quarterly
summary, an account health check, or how an account's projects are moving.
Do not use for looking up one contact, use the contact skill.
```

After publishing, have the person test triggering in a new chat: the phrase they would normally type, a casual abbreviation, and a neighboring request that should still reach the skill. If it does not fire, broaden the description. If it fires where it should not, narrow it, then re-run the other prompts before keeping that change.

## Write the body

Explain why instead of stacking capitalized MUSTs. The reader is a capable model: given the reason it handles the case you did not foresee, while a rigid rule covers only the case you wrote down. Typing ALWAYS or NEVER is a signal to say what goes wrong.

Write for the general case, not the one example on the table. That example is how you two move fast, but a skill that fits only it is worth nothing on the fourth run.

Keep SKILL.md short and push detail into supporting files, which the bundle format supports: up to 25 files ending `.md`, `.markdown`, `.txt`, or `.json`, each with a media type matching its extension, and SKILL.md under 100 KB. A long reference belongs in its own file, with one sentence in SKILL.md saying when to read it, so it loads only when it matters. Every relative Markdown link must point at a file shipped in the same bundle.

## Test prompts as a loop

Propose two or three prompts a real member would type, and check them with the person before running anything. Then walk each one through the draft as if you were meeting the skill for the first time, and show the real result in the conversation, not a summary of it. Ask: how does this look, what would you change.

Generalize from what comes back. The feedback is about one case; the skill has to hold for many. Patching that single case produces a skill that works once, so ask what the correction is an instance of and write that. Cut instructions that did not earn their place, especially ones that sent you doing work nobody wanted. Send the revision with `update_skill` and run the prompts again.

Stop when the person is happy, the feedback comes back empty, or the revisions stop changing anything.

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

Recover in this order, always:

1. Call `get_skill` again and read the current draft.
2. Tell the person what changed underneath you.
3. Reapply your edit on top of the new text and call `update_skill` with the version Parcel just reported.

Never take `details.currentDraftVersion` and resend your old body against it. That silently overwrites someone else's work.

## Managing existing skills

- To see what exists, call `list_skills`, which filters on `source`, `lifecycle`, `audience`, and `installed`, and `find_skill` for a phrase search. Say what you found before proposing a change.
- To revise, read the draft with `get_skill`, tell the person what it does today, agree the change, then send `update_skill` with that `expectedDraftVersion`, and re-test.
- To promote a Personal skill to the workspace, call `move_skill` with `skillId`, `expectedVersion`, and the new `audience`. Promotion is about audience, not maturity: a polished skill can stay Personal if it encodes one person's habits.
- `unpublish_skill`, `delete_skill`, and `transfer_skill` each take `expectedVersion`, and `transfer_skill` also takes `newMaintainerId`. Deleting and transferring are owner or admin actions. Name the exact skill back first; there is no undo.
- `fork_skill` takes a `source` locator and an `audience`, for when someone wants their own copy rather than an edit to the shared skill.

## Audience and moderation

- Personal skills belong to one member. Do not read, revise, move, or publish another member's Personal skill, and do not ask them to hand you one.
- API-key principals never touch Personal skills. A `forbidden` answer with reason `personal_denied` is correct behavior, not an obstacle. Move the work to a Workspace skill or an interactive session.
- Any active member may create and publish a Workspace skill. Owners and admins may additionally unpublish, delete, transfer, or otherwise moderate one, but moderation never changes who authored it. Never describe moderation as authorship.
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
| `disabled` | The capability is off for this workspace | Say so plainly and stop |

Validation reasons describe the rule, not your content. Fix the bundle rather than asking the person to relax it.

## Red flags

- Calling `publish_skill` because the draft looks finished. Publishing needs the person's approval of that call.
- Resending a body after a conflict without re-reading the draft.
- Rewriting the description narrower because one prompt over-triggered, without re-running the other prompts to see what the narrowing broke.
- Writing header keys the portable format does not allow, then wondering why validation fails.
- Reusing one idempotency key across different writes.
- Creating a second skill that triggers on the same situation as an existing one.
