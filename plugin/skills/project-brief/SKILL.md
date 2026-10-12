---
name: project-brief
description: Use when someone asks for a brief on a project or address, prep for a meeting or call about a project, what is going on with a development, who is on a project team, or whether to pursue a project. Covers stage, dated timeline, team and open seats, the players and who they hire, ICP fit with a go or no-go, and talking points. Do not use for lists of projects, use the build-prospect-list skill; for writing an email, use the research-and-write-outreach skill.
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

# Project brief

## Overview

A brief gets a member ready to talk about one project in five minutes of reading: what it is, how fast it is moving, who is on it, which seat is still open, how it fits our ICP, and what to say. Every fact carries its date and source.

Read [the Parcel data notes](reference/parcel-data.md) first.

## Workflow

1. Resolve the project from the address, name, or record the member gives. If several match, ask which one, listing address, city, and stage for each.
2. Load the workspace's `icp` skill if there is one, for fit and for our discipline.
3. Pull the record:
   - facts: uses, units, gross floor area, stories, height, parking, construction cost, stage, disposition, description;
   - every signal, oldest first, with its date and source document;
   - the team by role, including specific roles such as structural or MEP engineer;
   - photos, when the surface shows them;
   - this workspace's status, notes, and tags on the project and its accounts;
   - if a CRM is connected, any opportunity or deal already open for this project or its client account (read only).
4. Pull the players. For the developer and the architect: their other projects in Parcel with stage, and which firms in our discipline they hired on those projects. Repeat hires are the strongest relationship signal Parcel has.
5. Decide fit against the ICP: a bucket (Priority, Secondary, or Watch) and a go or no-go with the one or two facts that decide it, plus what would change the call.
6. Write three to five talking points, each tied to a dated fact, for example "congratulations on the Sept 12 Zoning Board approval; a building permit filing usually comes next".
7. List unknowns: what Parcel does not show yet, such as an architect not named in public filings yet, no construction cost stated, or no signal in six months.
8. Search the web only if the member asks or the record is too thin to brief from. Say first that web search spends credits, and date every web fact.

## Format

Use these sections, in this order:

- Snapshot: one paragraph and a facts table.
- Timeline: dated signals, oldest to newest.
- Team and open seats: roles filled, roles open, our seat called out.
- Players: developer and architect, their other projects, who they usually hire.
- Fit, with the go or no-go.
- Talking points.
- Unknowns.

Keep it to one screen where possible. Nothing is written by default. Offer to save a short note on the project (a write the member approves), to draft outreach with the research-and-write-outreach skill, or to log the project with the create-crm-opportunity skill.
