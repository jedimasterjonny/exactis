#!/usr/bin/env bash
# Refuses a commit, a push or a command of Claude's that carries a term from
# .private-terms, the household's real names, places and figures, which this
# public repository must never hold. The list is local and gitignored: one
# term per line, blank lines and # comments skipped, each matched whole-word,
# case-blind and literally. It is read from the root of the main checkout, so
# a worktree is held to the same list, and with no list there is nothing to
# check, so a fresh clone and CI pass with a note.
#
#   message <file>  a commit message, from .husky/commit-msg
#   staged          the lines the staged diff adds, from .husky/pre-commit
#   push            git's pre-push lines on stdin, from .husky/pre-push: each
#                   branch name, and the message and added lines of every
#                   commit the remote does not already have
#   text            stdin
#   claude-hook     a PreToolUse event on stdin, from .claude/settings.json:
#                   a gh pr, gh issue, gh api, git commit or git push command,
#                   and every file it names as a body or a field
#
# A hit says where and never what, so a term is not echoed into a terminal
# or a transcript. The git modes exit 1; text and claude-hook exit 2, which
# is what a Claude Code hook blocks on.
#
# ponytail: literal values only. A figure written another way, a file's name,
# and a file Claude names through a variable or after a cd all pass; the git
# hooks still see whatever reaches a commit.
set -euo pipefail

mode="${1:-}"
root="$(dirname "$(git -C "$(dirname "$0")" rev-parse --path-format=absolute --git-common-dir)")"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if [ -f "$root/.private-terms" ]; then
  sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e '/^#/d' -e '/^$/d' \
    "$root/.private-terms" > "$work/terms"
fi
if [ ! -s "$work/terms" ]; then
  echo "private-terms: no terms in $root/.private-terms, nothing checked." >&2
  exit 0
fi

# Reads a patch made with -U0 --no-prefix and prints each added line as
# "<prefix><file>:<line><TAB><text>". A +++ line inside a hunk is content.
added() {
  awk -v at="$1" '
    /^diff --git / { hunk = 0; next }
    !hunk && /^\+\+\+ / { file = substr($0, 5); next }
    /^@@/ { hunk = 1; split($3, start, ","); line = substr(start[1], 2); next }
    hunk && /^\+/ { print at file ":" line "\t" substr($0, 2); line++ }
  '
}

# Prints each line on stdin as "<where> line <n><TAB><text>".
numbered() {
  awk -v at="$1" '{ print at " line " NR "\t" $0 }'
}

# Each mode writes "<where><TAB><text>" lines, matched against the list below.
case "$mode" in
  message)
    # Below git's scissors line is the diff `commit -v` shows, not message.
    sed '/^# -\{24\} >8 -\{24\}$/,$d' "$2" | numbered "commit message"
    ;;
  staged)
    git diff --cached -U0 --no-prefix --no-color --no-ext-diff | added ""
    ;;
  push)
    zero='^0+$'
    while read -r _local_ref local_sha remote_ref remote_sha; do
      [[ $local_sha =~ $zero ]] && continue
      printf 'branch name\t%s\n' "$remote_ref"
      # A remote commit this clone has never fetched cannot bound a range.
      if [[ $remote_sha =~ $zero ]] || ! git cat-file -e "$remote_sha^{commit}" 2>/dev/null; then
        range=("$local_sha" --not --remotes)
      else
        range=("$remote_sha..$local_sha")
      fi
      shas="$(git rev-list --reverse "${range[@]}")"
      for sha in $shas; do
        short="$(git rev-parse --short "$sha")"
        git log -1 --format=%B "$sha" | numbered "commit $short message"
        git diff-tree -p -U0 --no-prefix --no-commit-id --root "$sha" | added "commit $short "
      done
    done
    ;;
  text)
    numbered "stdin"
    ;;
  claude-hook)
    event="$(cat)"
    command="$(jq -r '.tool_input.command // ""' <<< "$event")"
    grep -qE 'gh[[:space:]]+(pr|issue|api)|git[[:space:]].*(commit|push)' <<< "$command" || exit 0
    # A relative path in the command is relative to where Claude runs it.
    cd "$(jq -r '.cwd // "."' <<< "$event")" 2> /dev/null || true
    numbered "the command" <<< "$command"
    # The value after --body-file, --file, --input, -F, and the @file of a
    # -f or -F key=@file field, quotes stripped.
    refs="$(grep -oE -- "(^|[[:space:]])(--body-file|--file|--input|--field|--raw-field|-[fF])(=|[[:space:]]+)(\"[^\"]*\"|'[^']*'|[^[:space:]\"';&|)]+)" <<< "$command" |
      sed -E -e 's/^[[:space:]]*[^=[:space:]]+(=|[[:space:]]+)//' -e "s/^[\"']//" -e "s/[\"']\$//")" || true
    while read -r ref; do
      case "$ref" in
        *=@*) file="${ref#*=@}" ;;
        *=*) continue ;;
        *) file="$ref" ;;
      esac
      file="${file/#\~/$HOME}"
      if [ -f "$file" ]; then
        awk -v at="$file" '{ print at ":" NR "\t" $0 }' "$file"
      fi
    done <<< "$refs"
    ;;
  *)
    echo "usage: $0 message <file> | staged | push | text | claude-hook" >&2
    exit 64
    ;;
esac > "$work/lines"

cut -f2- "$work/lines" | grep -nwiF -f "$work/terms" > "$work/hits" || [ $? -eq 1 ]
[ -s "$work/hits" ] || exit 0
cut -d: -f1 "$work/hits" |
  awk -F'\t' 'NR == FNR { hit[$1]; next } FNR in hit { print "private-terms: a term from .private-terms is in " $1 }' \
    - "$work/lines" >&2
case "$mode" in
  text | claude-hook) exit 2 ;;
  *) exit 1 ;;
esac
