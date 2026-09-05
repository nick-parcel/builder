# Claude organization instructions for Parcel

These files hold text an administrator pastes into Claude organization
preferences so that Parcel questions route to the Parcel MCP server by
default, without each person having to say "using Parcel".

- [`short.md`](./short.md): a few sentences. Start here.
- [`long.md`](./long.md): the same routing plus which tool family to prefer,
  field discovery, approvals, and the Personal skill boundary.

## Where to paste them

Open Claude organization settings, find the preferences or instructions field
that applies to every member, and paste the text below the horizontal rule in
one of the files. Pick one file, not both. Save the setting.

Propagation is not instant. Allow up to an hour before judging whether the
instructions took effect, and start a fresh conversation when you test.

## Prerequisites

The Parcel MCP server has to be connected for the instructions to have
anything to route to. Instructions change what the assistant reaches for;
they do not create a grant. Members still complete the OAuth authorization
themselves, and their grant still decides what they may do.

## How to test

Start a new conversation as an ordinary member and try one prompt of each
kind, without mentioning Parcel by name:

1. A data question, for example: "Which accounts did we add this quarter?"
2. A skills question, for example: "What skills do we have for account
   reviews?"

The sign that the instructions took effect is the tool the assistant reaches
for: a `search_*` tool for the data question, `find_skill` for the skills
question. An answer written from memory, a web search, or a request that you
say "using Parcel" first means the instructions have not propagated yet or
were pasted into a field that does not apply to that member.
