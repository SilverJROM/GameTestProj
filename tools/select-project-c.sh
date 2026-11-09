#!/bin/sh
# Run only when the developer chooses Project C.
set -eu
source_url='https://github.com/rinc3w1nd/developer-test-sophias-world.git'
source_commit='46c7d817f5ad5c7e29ea4fef9cac56f9f4f300b9'
starter_instructions_blob='b32d377ff662b04a3e1f8bef506ca248b54d888d'
fail() { printf '%s\n' "$*" >&2; exit 1; }

cd "$(git rev-parse --show-toplevel)" || exit 1
if git merge-base --is-ancestor "$source_commit" HEAD 2>/dev/null; then
    printf '%s\n' 'This checkout already contains Sophia’s World.'
    exit 0
fi
starter_root=$(git rev-list --max-parents=0 HEAD)
[ "$(git rev-parse "$starter_root:AGENTS.md" 2>/dev/null)" = "$starter_instructions_blob" ] ||
    fail 'Open the developer-test-starter checkout first.'
changes=$(git status --porcelain=v1 --untracked-files=all --ignore-submodules=none)
[ -z "$changes" ] || fail 'The checkout has local changes. Save your work before switching to Project C.'
# A pinned, detached starter checkout is supported, but never leave an
# unreferenced local commit behind when changing branches.
refs=$(git for-each-ref --contains=HEAD --format='%(refname)' refs/heads refs/remotes)
[ -n "$refs" ] || fail 'Save this detached commit on a branch before selecting C.'
if git show-ref --verify --quiet refs/heads/project-c; then
    fail 'A project-c branch already exists. Inspect it before continuing.'
fi
git fetch --no-tags --no-recurse-submodules "$source_url" refs/heads/main
received=$(git rev-parse --verify 'FETCH_HEAD^{commit}')
[ "$received" = "$source_commit" ] || fail 'The supplied Project C revision has changed. Contact your evaluator.'
git switch --no-overwrite-ignore --no-track -c project-c "$source_commit"
printf '%s\n' 'Project C is ready in this folder. Use your own private submission repository for pushes.'
