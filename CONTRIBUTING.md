# Contributing

## Frontmatter

Skill frontmatter is portable only: `name`, `description`, `license`,
`compatibility`, `metadata`. Never `allowed-tools`, hooks, MCP manifests, or
any host execution field. Parcel catalog data lives under `metadata.parcel`.

## No secrets, no executables

Never commit secrets, tokens, local paths, or executable content. This
means no shebangs, no shell or code fences tagged as executable languages,
no scripts, and no `bin/` directory anywhere under `plugin/`.

## Referenced files

Every file referenced from a skill or manifest must exist in the repository.

## Evals

Every skill needs at least one eval case.

## Review

Human review is required for all source and manifest changes.

## Releases

Releases are built from a clean tagged commit. Each release records the
commit, the tag, the schema version, and checksums of the built artifact.

## Style

Code comments are one line. No em dashes anywhere.
