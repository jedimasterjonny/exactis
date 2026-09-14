// Conventional Commits, so the history stays greppable and every subject
// states what kind of change it is. config-conventional supplies the type
// enum, the lower-case subject and the 100-column header; nothing here
// narrows the scope list, since scopes are chosen per commit.
const commitlintConfig = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // config-conventional ships this as a warning, so a body run straight on
    // to the subject line is reported and then let through. No commit parser
    // reads that as a body, git's own included, so it fails here instead.
    "body-leading-blank": [2, "always"],
    // Not in config-conventional at all, so feat(TS) passes today. A scope
    // names a config surface - ts, lint, hooks - and one that varies in case
    // is one you cannot grep for.
    "scope-case": [2, "always", "lower-case"],
  },
};

export default commitlintConfig;
