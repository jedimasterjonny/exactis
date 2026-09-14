// Conventional Commits, so the history stays greppable and every subject
// states what kind of change it is. config-conventional supplies the type
// enum, the lower-case subject and the 100-column header; nothing here
// narrows the scope list, since scopes are chosen per commit.
const commitlintConfig = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // A subject alone records what changed and never why, and why is the
    // half that cannot be read back off the diff.
    //
    // What it cannot do is tell an absent body from one the parser threw
    // away. conventional-commits-parser treats any line beginning with a
    // `word:` token as the start of the footer, so a body opening on one -
    // `lib: esnext types every proposal-stage API...` - is footer in its
    // entirety and the body it plainly has parses as empty. That is not
    // fixable in configuration, and it is why the two commits this rule
    // used to fail were reworded rather than exempted.
    "body-empty": [2, "never"],
    // config-conventional ships this as a warning, so a body run straight on
    // to the subject line is reported and then let through. No commit parser
    // reads that as a body, git's own included, so it fails here instead.
    "body-leading-blank": [2, "always"],
    // What it guards is the `Co-Authored-By:` trailer. Git reads a trailer
    // block only when a blank line sets it off from what precedes it, so a
    // co-author line run on to the body is not a trailer at all: it renders
    // as prose and `git interpret-trailers --parse` returns nothing, which
    // means every tool that asks git rather than grepping the text loses
    // the attribution.
    //
    // The `word:` token above is the other way to trip it, and the more
    // insidious one, because the wrap decides. The second reworded commit
    // read `...Verified the rule fires and` / `autofixes: a bare import`,
    // where `autofixes:` reached the start of a line only because the
    // sentence wrapped at eighty columns. The parser cut a footer there,
    // mid-sentence, with no blank line above it.
    "footer-leading-blank": [2, "always"],
    // Not in config-conventional at all, so feat(TS) passes today. A scope
    // names a config surface - ts, lint, hooks - and one that varies in case
    // is one you cannot grep for.
    "scope-case": [2, "always", "lower-case"],
  },
};

export default commitlintConfig;
