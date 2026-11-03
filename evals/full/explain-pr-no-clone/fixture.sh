#!/bin/bash
# The workspace stays empty and is not a git checkout, so the skill must take
# the no-clone path. It needs an authenticated gh to reach the repository.
set -e
gh auth status >/dev/null
! git rev-parse --git-dir >/dev/null 2>&1
