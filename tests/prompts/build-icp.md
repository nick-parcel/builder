# build-icp live prompts

Run each in Spec (from Explore, Set up on Build ICP) and in Claude Code with the plugin and Parcel MCP connected.

## Should trigger

- Set up our ICP.
- Help us define who we should be targeting.
- Update our ideal customer profile, we stopped doing lab work.
- Tier our accounts based on who we actually win with.

## Should not trigger

- Give me the top 20 projects to chase this month. (build-prospect-list)

## Behavior checks

- In an ordinary Spec chat, says it cannot save a skill there and points to Set up before asking anything.
- Reads workspace evidence and summarizes it before the first question.
- Asks no more than three rounds of questions, each with a recommended answer.
- Leaves a ready-to-publish `icp` draft in Spec (published from the draft card); over MCP, publishes only after approval.
- Proposes tiers in a table and writes them only after approval, in batches of 100 or fewer.
