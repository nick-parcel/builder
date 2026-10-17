# build-icp live prompts

Run each in Spec (from Explore, Set up or Update ICP on Build ICP, or any chat) and in Claude Code with the plugin and Parcel MCP connected.

## Should trigger

- Set up our ICP.
- Help us define who we should be targeting.
- Update our ideal customer profile, we stopped doing lab work.
- Tier our accounts based on who we actually win with.

## Should not trigger

- Give me the top 20 projects to chase this month. (build-prospect-list)

## Behavior checks

- Reads workspace evidence and summarizes it before the first question.
- Asks no more than three rounds of questions, each with a recommended answer.
- Creates or edits the knowledge page Go-to-market/ICP, with the member's approval, and reads it back; an update edits only the sections that changed.
- Proposes tiers in a table and writes them only after approval, in batches of 100 or fewer.
- When this conversation cannot write knowledge, says so before asking anything and hands over the finished profile to paste.
