## Checklist

- [ ] Frontmatter is portable (`name`, `description`, `license`, `compatibility`, `metadata` only)
- [ ] No secrets, tokens, local paths, or executable content
- [ ] Every referenced file exists
- [ ] Evals are updated for any changed skill
- [ ] `pnpm test` passes
- [ ] `claude plugin validate --strict ./plugin` passes
- [ ] No generated artifacts are committed
- [ ] Changelog is updated
