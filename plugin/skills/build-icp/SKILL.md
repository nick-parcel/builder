---
name: build-icp
description: Use when someone wants to set up, define, or update the firm's ICP (ideal customer profile), decide which developers, architects, or projects to target, set ICP tiers on accounts, or asks who we should be targeting. Saves the result as the knowledge page ICP in the Go-to-market folder, which the other Parcel skills read. Do not use for ranking today's projects, use the build-prospect-list skill instead.
license: Apache-2.0
compatibility: Parcel Spec, or any MCP client connected to Parcel with the skills, knowledge, and workspace read and write scope groups granted
metadata:
  parcel:
    schema-version: 1
    version: 0.4.0
    visibility:
      claude-plugin: true
      parcel-explore: true
      parcel-installable: true
      parcel-runtime: true
---

# Build the ICP

## Overview

The ICP (ideal customer profile) says which accounts and projects this firm wins: who hires it, where, what kind of work, at what size and stage, and which public events make the timing right. Parcel uses it in three places: the workspace's knowledge, as the page ICP in the Go-to-market folder, which every Parcel business skill reads first; the ICP tier on each account; and the alert subscriptions whose priorities weight the Atlas Score. This skill writes all three, with the member's approval at each write.

Read [the Parcel data notes](reference/parcel-data.md) before you start. The profile's exact shape is in [the ICP template](reference/icp-template.md).

## Before you start

Check that you can write the workspace's knowledge where you are running: creating and editing knowledge pages has to be one of the actions open to you.

Save in this conversation. If this conversation cannot write knowledge, say so before asking anything, and at the end give the member the finished profile to paste into a knowledge page named ICP in the Go-to-market folder.

## Workflow

1. Check for an existing profile. Look in the workspace's knowledge for the ICP page (Go-to-market/ICP). If it exists, read it and treat this run as an update: change only what the member wants changed.
2. Gather evidence before asking anything. Read what the workspace already shows:
   - accounts that already carry an ICP tier, and their types;
   - projects with a workspace status, notes, or tags, and their cities, uses, sizes, and stages;
   - saved views and their filters;
   - alert subscriptions and their priorities;
   - if a CRM is connected, closed-won deals from the last two years and the companies on them.
   Summarize the pattern in a few lines, for example "your tracked projects are mostly 4 to 7 story residential in Somerville and Cambridge, at filed or under review".
3. Interview. Ask at most three rounds of up to four questions, each with a recommended answer drawn from the evidence. Skip anything the evidence already answers. Cover, in this order: who we are and who usually hires us; target projects; target accounts and competitors; priority buckets and why-now signals; outreach voice; CRM defaults. CRM defaults are optional; leave them "Not set" if the member wants to move on.
4. Draft the profile in the template's shape and show it in full. Take edits until the member is happy.
5. Save the profile as the knowledge page ICP in the Go-to-market folder: create it, or edit only the sections that changed. Knowledge is shared, so every member and every Parcel skill reads the same profile. In Parcel the member approves the change on a card before it is written; in another assistant, name the page and the change before you save. Read the page back after saving. If the page changed since you read it, read it again and reapply only the member's edits.
6. Propose ICP tiers. Find accounts active in the target markets over the last two years whose type and projects fit the profile. Rank them, take the top 100 plus every named target and every excluded account, and propose a tier for each with a one-line reason:
   - Tier 1: named targets, and accounts whose recent projects fit on market, use, size, and stage.
   - Tier 2: fit on most of those.
   - Tier 3: in our markets but outside the core profile.
   - Disqualified: excluded accounts and competitors.
   Show the proposal as a table. Write the tiers the member approves, in batches of up to 100 accounts per write. Leave accounts the member did not approve untouched. Mention that Atlas Scores recompute after the write.
7. Offer alerts and a view. Offer alert subscriptions for the why-now signal types at their priorities (high, medium, low), and a saved view of projects that fit the target projects section. A view cannot filter by disposition, so say it also lists closed projects. Each is its own write and its own approval. Both are optional.
8. Close with what changed: the ICP page created or updated, how many tiers were written, and which alerts and views were created.

## Good profiles

- Specific beats broad. "Residential, 40 to 200 units, 4 to 8 stories, Somerville, Cambridge, and Everett, filed through approved" ranks projects; "multifamily in Greater Boston" does not.
- Disqualifiers carry the most value: a discipline already named on the team, a use the firm does not do, a market it does not cover.
- Name competitors as competitors. An engineering firm in our discipline on a project means the seat is likely filled.
- Who usually hires us decides which firm the other skills treat as the client. If the answer is "depends", record what it depends on.

## What not to do

- Do not invent evidence. If the workspace has no tiers, statuses, or views yet, say so and rely on the interview.
- Do not tier accounts the profile does not cover.
- Do not write the firm's criteria anywhere but the ICP page in the workspace's knowledge (Go-to-market/ICP).
