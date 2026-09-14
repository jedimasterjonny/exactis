// Conventional Commits, so the history stays greppable and every subject
// states what kind of change it is. config-conventional supplies the type
// enum, the lower-case subject and the 100-column header; nothing here
// narrows the scope list, since scopes are chosen per commit.
const commitlintConfig = { extends: ["@commitlint/config-conventional"] };

export default commitlintConfig;
