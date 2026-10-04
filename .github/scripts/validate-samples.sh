#!/bin/sh
# Runs the skill's validate-output.sh on every page under samples/. The
# validate-samples workflow runs this on each pull request into main.
#
# Usage: sh .github/scripts/validate-samples.sh
#
# Exits 0 when every page passes, 1 when a page fails or no page is found.

root=$(cd "$(dirname "$0")/../.." && pwd)
validate="$root/skills/explain-diff-html/scripts/validate-output.sh"

status=0
count=0
while IFS= read -r page; do
  [ -n "$page" ] || continue
  count=$((count + 1))
  name=${page#"$root"/}
  # Both provenance forms end the commit with ", explained <date>".
  commit=$(tr '\n' ' ' < "$page" | grep -oE 'class="provenance"[^<]*' \
    | grep -oE '\b[0-9a-f]{7,40}, explained' | head -n 1 | sed 's/, explained$//')
  if [ -z "$commit" ]; then
    echo "::error file=$name::no short commit in the provenance line"
    status=1
    continue
  fi
  echo "::group::$name at $commit"
  result=0
  sh "$validate" "$page" "$commit" || result=$?
  echo "::endgroup::"
  if [ "$result" -ne 0 ]; then
    echo "::error file=$name::validate-output.sh exited $result"
    status=1
  fi
done <<EOF
$(find "$root/samples" -name '*-explanation.html' | sort)
EOF

if [ "$count" -eq 0 ]; then
  echo "::error::no sample pages found under samples/"
  exit 1
fi
echo "Checked $count sample pages."
exit $status
