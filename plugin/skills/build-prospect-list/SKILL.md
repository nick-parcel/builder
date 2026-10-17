---
name: build-prospect-list
description: Use when someone asks for a prospect list, who to focus on, the top projects or accounts this week or month, priority buckets, the best opportunities in a city, or which developers or architects to target now. Ranks active and stalled projects and the accounts behind them into Priority, Secondary, and Watch with reasons. Do not use for one project, use the project-brief skill; for drafting emails, use the research-and-write-outreach skill; for setting up the ICP, use the build-icp skill.
license: Apache-2.0
compatibility: Parcel Spec, or any MCP client connected to Parcel
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

# Build a prospect list

## Overview

A prospect list answers where to spend this week: active and stalled projects that fit the ICP, the accounts that would hire us on them, and why each one is timely. Every row carries its reason and what is unknown, so the member can trust the ranking or overrule it.

Read [the Parcel data notes](reference/parcel-data.md) first.

## Workflow

1. Read the firm's ICP page in knowledge (Go-to-market/ICP), plus any other knowledge pages about who the firm targets. If there is none, ask for the minimum in one round (markets, uses, size range, stage window, who usually hires us), each with a recommended answer, and suggest the build-icp skill afterwards so the next list needs no questions.
2. Confirm scope only if the request leaves it open: market, use, time window (default: signals in the last 90 days), and list size (default: 25 projects).
3. Pull candidates: active and stalled projects in the target markets whose use, size, and stage fit the profile. Read only the fields you need: address, city, uses, units, gross floor area, stories, construction cost, stage, disposition, latest signal and its date, and the team by role.
4. Remove disqualifiers: a firm in our discipline already named on the team, a completed project, a denied, withdrawn, expired, or cancelled one, and anything the profile's disqualifiers list.
5. Attach the client account: the firm the profile says usually hires us (developer or architect). If the profile says it depends, show both. Add each account's ICP tier, Atlas Score, and number of matching projects.
6. Bucket every project with the profile's priority buckets. When the profile has none, use:
   - Priority: meets every must-have, has a why-now signal in the last 90 days, and our seat is open.
   - Secondary: fits, but no why-now signal in the window.
   - Watch: fits, but key data is missing or the project is early in its stage.
   Within a bucket, put active ahead of stalled, then order by the strength and recency of the latest signal, then by the account's Atlas Score.
7. Write a one-line reason per row that names the evidence, for example "Planning Board filing on Sept 12; 6 stories, 120 units; structural engineer not named in public filings yet". Add a missing-data note when a size field or the architect is blank.
8. Show two tables:
   - Projects: bucket, address and city, use, size, stage and disposition, latest signal and date, client account, reason.
   - Accounts: account, type, ICP tier, Atlas Score, matching projects, best bucket.
   Show a map of Priority projects when the surface can draw one.
9. Offer next steps: save the Priority projects as a saved view (a write the member approves), brief one project with the project-brief skill, draft outreach for the top accounts with the research-and-write-outreach skill, or log projects in the CRM with the create-crm-opportunity skill.

## Judgment

- Thin data is not a bad fit. A project with no architect named may be the best opening; put it in Watch only when the missing field decides the fit.
- Do not let the Atlas Score alone place a project. It measures an account's activity, not a project's fit.
- Never pad a bucket. Three real Priority projects beat ten weak ones.
- If the candidate set runs past what one read returns, narrow by market or stage and say what you narrowed, rather than ranking a partial list as if it were complete.
