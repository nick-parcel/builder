---
name: create-crm-opportunity
description: Use when someone wants to create an opportunity or deal for a project, add a project to HubSpot or Salesforce, log projects in the CRM, put a project under an account in the CRM, or update the CRM opportunity for a project. One Parcel project becomes one opportunity (Salesforce) or deal (HubSpot) under the account the member chooses. Do not use for drafting emails, use the research-and-write-outreach skill.
license: Apache-2.0
compatibility: Parcel Spec or any MCP client connected to Parcel, with a HubSpot or Salesforce connection available
metadata:
  parcel:
    schema-version: 1
    version: 0.3.1
    visibility:
      claude-plugin: true
      parcel-explore: true
      parcel-installable: true
      parcel-runtime: true
---

# Create a CRM opportunity

## Overview

In the CRM, one account can hold many opportunities, and each opportunity is one project. This skill turns a Parcel project into that opportunity under the account the member chooses, updates an existing one instead of duplicating it, and notes the link back in Parcel. In HubSpot the opportunity is a deal and the account is a company.

Read [the Parcel data notes](reference/parcel-data.md) first.

## Before you start

- A HubSpot or Salesforce connection must be available where you are running. If neither is connected, say so, tell the member they can connect one under Connectors, and stop.
- Load the workspace's `icp` skill for the CRM defaults: pipeline, starting stage, close-date offset, fee percentage, and owner.

## Workflow

1. Resolve the project or projects, up to 10 per run. If an address or name matches several projects, ask which.
2. Choose the account. Use the account the member named. If they did not name one, ask, listing the firms on the project with their roles (developer, owner, architect, and others) plus "another account", with no option preselected. Never pick the account yourself.
3. Find the account in the CRM: search companies (HubSpot) or accounts (Salesforce) by name, and by web domain when Parcel has one. If several match, ask which. If none match, propose creating it with the name, domain, city, and state, and create it only after the member approves.
4. Search before you create. Look through the account's existing deals or opportunities for this project by address and project name. If one exists, propose an update instead: refresh the description and facts (HubSpot deal properties; in Salesforce, update the fields and attach a note saying what changed). Never create a second opportunity for the same project.
5. Build the new record, one opportunity per project:
   - Name: project name or address, then city, for example "101 Main St, Somerville".
   - Pipeline and stage: from the ICP CRM defaults. When they are missing, read the stages already used on recent opportunities, propose one, and ask.
   - Close date: today plus the ICP close-date offset. When it is missing, ask; Salesforce requires one.
   - Amount: construction cost times the ICP fee percentage when both exist; otherwise leave it blank. Never put construction cost in the amount.
   - Description: project facts (use, units, stories, gross floor area, construction cost, stage), the team by role, the latest signal with its date, and the Parcel project id with the address.
   - HubSpot: link the deal to the company, and to contacts and other firms (architect, GC) that already exist in the CRM. Do not create contacts unless the member asks.
   - Salesforce: set the account only; list other firms and named contacts in the description, because contact roles are not available here.
6. Show exactly what will be written, then ask for approval. Every CRM write needs it.
7. After the CRM write succeeds, offer to add the `in-crm` tag to the project in Parcel and append a note with the CRM record's link or id and today's date, a write the member approves.
8. Report what happened per project: created, updated, or skipped, with the CRM link or id.

## Rules

- One opportunity per project, under one account. An account may hold many.
- Never move an existing opportunity to a different account unless the member asks.
- If a CRM write fails, show the error in plain words and stop that project; do not retry with guessed values.
- When CRM defaults were asked for in this run, suggest saving them in the ICP with Update ICP so the next run does not ask.
