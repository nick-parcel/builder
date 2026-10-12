---
name: research-and-write-outreach
description: Use when someone wants to write, draft, or personalize an email to a developer, architect, owner, or contact, reach out about a project, write a cold email or intro, re-engage an account, or follow up after a meeting. Researches the account and its projects first, anchors the email on a dated public signal, and drafts it for review. It never sends. Do not use for a full project brief, use the project-brief skill.
license: Apache-2.0
compatibility: Parcel Spec, or any MCP client connected to Parcel
metadata:
  parcel:
    schema-version: 1
    version: 0.3.0
    visibility:
      claude-plugin: true
      parcel-explore: true
      parcel-installable: true
      parcel-runtime: true
---

# Research and write outreach

## Overview

Good outreach from Parcel is specific and timely: it names a real, dated event on the recipient's project and offers one relevant proof point. This skill researches first, then drafts, and leaves sending to the member.

Read [the Parcel data notes](reference/parcel-data.md) first.

## Workflow

1. Resolve who and what: the account, the project or projects, and the recipient. If no recipient is named, list the named contacts on that account and project with their roles and ask which. Never invent an email address. If the chosen contact has no email in Parcel, draft anyway and say the address is unknown.
2. Load the workspace's `icp` skill for the sender, tone, proof points, and phrases to avoid. Without it, ask for the sender's name and title and one proof point.
3. Research:
   - the account's active projects that fit the ICP, with stage;
   - the latest dated signals on those projects, which become the reason to write now;
   - who the account usually hires in our discipline, from the team roles on its projects;
   - our history: this workspace's status and notes on the account and its projects, plus CRM records and past email threads with the account's domain when those are connected (read only).
   Search the web only if the member asks, and say first that it spends credits.
4. Pick the relationship stage: cold first touch, warm re-engage, or follow-up after a meeting. Ask when the history does not make it clear.
5. Draft:
   - a subject line of eight words or fewer;
   - a body of 150 words or fewer, anchored on one dated fact, for example "your Sept 12 Planning Board filing for 101 Main St";
   - one proof point from the ICP outreach voice that matches the project's use or size;
   - one clear ask, usually a 15-minute call;
   - nothing the data does not support: no invented relationships, awards, or project details.
   Offer two follow-up touches on request, each shorter and each with a new reason to write.
6. Show the draft in the chat. Offer to save it as a draft in the member's connected mailbox, a write the member approves. Never send email, even when a send action is available; sending stays with the member.
7. For a batch from a prospect list, draft up to 10 emails, one per recipient, each with its own dated hook. Offer to add a note reading "outreach drafted" with today's date on each account or project, a write the member approves.

## Style

- Write like a peer, not a vendor: short sentences, no hype words, no exclamation marks.
- Lead with their project, not our firm.
- One ask per email.
