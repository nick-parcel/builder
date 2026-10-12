# build-prospect-list live prompts

## Should trigger

- Build me a prospect list for Somerville.
- Who should we focus on this week?
- Top 15 projects we should chase this month, in priority buckets.
- Which developers should we be calling right now?

## Should not trigger

- Brief me on 101 Main St before my call. (project-brief)

## Behavior checks

- Loads the `icp` skill first; without one, asks a single round with recommended answers.
- Every row has a reason naming a dated signal or a fact, and blanks read "not named in public filings yet".
- Shows a projects table and an accounts table; no bucket is padded.
