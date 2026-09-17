#!/usr/bin/env bash
# Brings nvm to the Node version .node-version pins: installs it if it is
# missing, points nvm's default alias at it, and switches this shell too when
# the script is sourced.
#
#   source scripts/use-node.sh   installs, moves the default, switches here
#   bash scripts/use-node.sh     installs and moves the default only
#
# nvm cannot be asked to do this on its own. nvm 0.40.7's nvm_find_nvmrc
# looks for .nvmrc and nothing else - read out of ~/.nvm/nvm.sh rather than
# remembered - so a bare `nvm use` here finds no version file and fails. A
# .nvmrc beside .node-version would fix that by giving the version a second
# place to be written, which is the one thing it must not have, so the
# version is read from the pin and passed to nvm explicitly instead.
#
# nvm is a shell function, so PATH moves only in the shell that ran it: an
# executed copy of this script switches a shell that exits a line later.
# Hence the two modes, and a closing report that says which shell ended up
# where. Not a package.json script for the same reason - `bun run` could only
# ever spawn the half that changes nothing the caller can see.
#
# No `set -e` or `set -u`: sourced, they stay set in the caller's interactive
# shell, where the next unset variable or failing command closes it. Every
# step below is checked by hand instead.

# How this copy is running. bash leaves $0 as the caller's name for a sourced
# file and sets BASH_SOURCE to the file's own; zsh carries :file in
# ZSH_EVAL_CONTEXT for code read from a sourced file and reads toplevel when
# the file is executed. Verified in both shells, both ways. Anything else
# reads as executed, which is the safe half to be wrong on: it only means the
# report tells the truth about a shell this script could not change.
__exactis_use_node_mode=executed
case "${ZSH_EVAL_CONTEXT-}" in
  *:file*) __exactis_use_node_mode=sourced ;;
esac
if [ -n "${BASH_VERSION-}" ] && [ "${BASH_SOURCE[0]-}" != "${0-}" ]; then
  __exactis_use_node_mode=sourced
fi

__exactis_use_node() {
  # Dropped while they still run, which both shells allow and neither
  # minds - verified, along with the `return` below still arriving as the
  # status of the `source`. A sourced script shares the caller's shell, so
  # whatever it defines and leaves behind is in that shell for the rest of
  # the day.
  unset -f __exactis_use_node
  unset __exactis_use_node_mode

  local mode="$1"
  local root version outer_node nvm_sh

  # Read before nvm is loaded, because sourcing nvm.sh activates the default
  # version: after that this is the script's own node rather than the node of
  # the shell the report is about.
  outer_node="$(node --version 2>/dev/null)" || outer_node=""

  root="$(git rev-parse --show-toplevel 2>/dev/null)" || root=""
  if [ -z "$root" ] || [ ! -f "$root/.node-version" ]; then
    echo "use-node: no .node-version above $PWD; run this inside the repo." >&2
    return 1
  fi

  # The file holds a bare version, so whitespace is all there is to strip.
  # Anything else wrong with it is nvm's to report, where the message names
  # the version it could not resolve rather than being guessed at here.
  version="$(tr -d '[:space:]' <"$root/.node-version")"
  if [ -z "$version" ]; then
    echo "use-node: $root/.node-version is empty." >&2
    return 1
  fi
  # nvm takes either spelling and the pin is written bare. Settling on one
  # here keeps the report below from printing whichever the file happened to
  # use, and keeps the comparison from missing on a leading v alone.
  version="${version#v}"

  # Usually already loaded by the caller's profile. Otherwise take it from
  # NVM_DIR, else from where the installer puts it.
  if ! command -v nvm >/dev/null 2>&1; then
    nvm_sh="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
    if [ ! -s "$nvm_sh" ]; then
      echo "use-node: no nvm at $nvm_sh. Install it from" \
        "https://github.com/nvm-sh/nvm, or point NVM_DIR at it." >&2
      return 1
    fi
    . "$nvm_sh" || return 1
  fi

  # Idempotent: it fetches the version when it is missing and says it is
  # already installed when it is not. --reinstall-packages-from is
  # deliberately not passed - bun is the package manager here, and rebuilding
  # whatever npm -g happens to hold is a surprise from a script whose job is
  # one version. The versions this replaces are left installed, since
  # deleting a toolchain is a decision to take deliberately: `nvm ls` lists
  # them and `nvm uninstall` removes one.
  nvm install "$version" || return 1

  # What a new shell gets, and what anything else reading nvm's default gets.
  nvm alias default "$version" || return 1

  if [ "$mode" = sourced ]; then
    # --silent because the install above already printed this, and the line
    # below is the one that says it is the pinned version.
    nvm use --silent "$version" || return 1
    echo "use-node: this shell is on $(node --version), the pinned version."
    return 0
  fi

  echo "use-node: nvm has v$version and its default now points at it."
  if [ "${outer_node#v}" = "$version" ]; then
    echo "use-node: the shell that called this was already on v$version."
  else
    echo "use-node: it still has ${outer_node:-no node};" \
      "\`source scripts/use-node.sh\` moves it too."
  fi
  return 0
}

if [ "$__exactis_use_node_mode" = sourced ]; then
  # No `exit` on this path: it would close the caller's shell rather than end
  # the script. The function's status is the last thing this file does, so it
  # is what the `source` reports.
  __exactis_use_node sourced
else
  __exactis_use_node executed
  exit $?
fi
