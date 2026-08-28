#!/bin/bash
# Cowork sessions only. Makes Marcos's local TimeSpent folder (mounted at $HOME/mnt/TimeSpent) identical to the
# clone's main branch, working tree AND .git metadata. Needed because the sandbox cannot delete files in the
# folder, so `git pull`/`git checkout` fail there. Usage: tools/sync-folder.sh [path-to-clone]   (default $HOME/ts)
# Rules: never run git commands that write inside the folder; never write INTO objects/*/tmp_obj_* files
# (they are hard links of real objects - writing corrupts the repo); renaming them is fine.
set -u
CLONE=${1:-$HOME/ts}; FOLDER=${FOLDER:-$HOME/mnt/TimeSpent}
cd "$CLONE" || exit 1
[ "$(git symbolic-ref --short HEAD)" = main ] || { echo "clone must be on main (git switch main && git pull)"; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "clone has uncommitted changes"; exit 1; }
# 1) working tree
git ls-files | while read -r f; do mkdir -p "$FOLDER/$(dirname "$f")"; cmp -s "$f" "$FOLDER/$f" || cp -f "$f" "$FOLDER/$f"; done
comm -13 <(git ls-files | sort) <(git -C "$FOLDER" --no-optional-locks ls-files 2>/dev/null | sort) | sed 's/^/  removed on main, delete on the Mac: /'
# 2) .git metadata (objects incl. packs, refs, logs, index, HEAD, config, packed-refs)
(cd .git && find . -type f ! -path './hooks/*' ! -path './info/*' ! -name description ! -name '*.lock' ! -name 'tmp_obj_*' | while read -r f; do
   d="$FOLDER/.git/$f"; mkdir -p "$(dirname "$d")"
   if [ -e "$d" ]; then cmp -s "$f" "$d" && continue; chmod u+w "$d" 2>/dev/null; fi
   cp -f "$f" "$d" || echo "copy failed: $f"; done)
# 3) collapse git's undeletable leftovers (*.lock, tmp_obj_*) into HEAD by renaming
(cd "$FOLDER/.git" && printf 'ref: refs/heads/main\n' > .chain.tmp && cur=.chain.tmp &&
  while read -r f; do mv -f "$cur" "$f" && cur="$f"; done < <(find . -type f \( -name '*.lock' -o -name 'tmp_obj_*' \)) &&
  mv -f "$cur" HEAD)
# 4) verify (read-only commands)
cd "$FOLDER" && git fsck --no-progress 2>&1 | grep -v '^dangling'; git --no-optional-locks status -sb; git --no-optional-locks log --oneline -1
echo "leftovers: $(find .git -type f \( -name '*.lock' -o -name 'tmp_obj_*' \) | wc -l)"
