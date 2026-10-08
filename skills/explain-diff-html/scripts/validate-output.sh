#!/bin/sh
# The command-line checks from step 7 of SKILL.md. What each check is, and why
# it exists, is in references/validation.md.
#
# Usage: sh validate-output.sh <drafted page> <short commit>
#
# Pass literal paths. A shell variable set in an earlier tool call is gone.
# Exits 0 when every pass/fail check passes, 1 when one fails, 2 on bad usage.

page=$1
sha=$2

if [ -z "$page" ] || [ -z "$sha" ]; then
  echo "usage: sh validate-output.sh <drafted page> <short commit>" >&2
  exit 2
fi
if ! printf '%s\n' "$sha" | grep -qE '^[0-9a-f]{4,40}$'; then
  echo "usage: <short commit> must be 4 to 40 lowercase hex characters" >&2
  exit 2
fi

# A directory passes test -s, and step 8's $out is a directory, so require a
# regular file as well.
if [ ! -f "$page" ] || [ ! -s "$page" ]; then
  echo "FAIL: $page is not a non-empty file" >&2
  exit 1
fi

status=0

# Flatten, then strip anchors, so a linked reference still counts as a reference.
# A reference is a <code> span or .filename label that starts with path.ext:line.
# A host:port such as example.com:8080 looks the same, so drop common TLDs.
flat=$(tr '\n' ' ' < "$page" | sed -E 's#</?a[^>]*>##g; s/  +/ /g')
ref='(<code[^>]*>|class="filename"[^>]*>) *[A-Za-z0-9_./-]+\.[A-Za-z0-9]+:[0-9]+(-[0-9]+)?[ ,<]'
tld='\.(com|org|net|io|dev|app|local|internal|localhost):'
count() { printf '%s\n' "$flat" | grep -oE "$ref" | grep -vE "$tld" | grep -cE "$1"; }
refs=$(count '.')
marked=$(count 'data-bare=')
links=$(grep -o 'class="srcref"' "$page" | wc -l | tr -d ' ')
echo "references=$refs linked=$links marked-bare=$marked"

# Every reference is linked unless the page marks it with data-bare, or the
# provenance line says the host could not be linked at all.
if printf '%s\n' "$flat" | grep -q 'References are not linked'; then
  echo "pass: provenance says references are not linked"
elif [ "$links" -lt $((refs - marked)) ]; then
  echo "FAIL: $((refs - marked - links)) references are neither linked nor marked data-bare"
  status=1
else
  echo "pass: every reference is linked or marked data-bare"
fi

# A link names the full 40-character sha. GitHub resolves an abbreviation only
# while the commit is on a branch, so a short sha 404s once a squash merge lands.
full="/blob/${sha}[0-9a-f]{$((40 - ${#sha}))}/"
wrong=$(grep -o 'href="[^"]*/blob/[^"]*"' "$page" | grep -vE "$full")
if [ -n "$wrong" ]; then
  echo "FAIL: links that do not name the full 40-character sha starting $sha:"
  echo "$wrong"
  status=1
else
  echo "pass: every blob link names the full sha of $sha"
fi

# GitHub renders Markdown, and the rendered view ignores a line anchor. Match
# every Markdown line link, whatever query it carries, then keep the bare ones.
md='href="[^"]*/blob/[^"]*\.(md|markdown)(\?[^"#]*)?#L[^"]*"'
bare=$(grep -oiE "$md" "$page" | grep -v 'plain=1')
if [ -n "$bare" ]; then
  echo "FAIL: Markdown links with a line anchor and no ?plain=1:"
  echo "$bare"
  status=1
else
  echo "pass: every Markdown line link carries ?plain=1"
fi

quiz() {
  sed -n '/<section id="quiz"/,/<\/section>/p' "$page" \
    | tr '\n' ' ' | sed -E 's/<[^>]+>/ /g; s/  +/ /g'
}

positional=$(quiz | grep -oEi 'the (first|second|third|last) option|the (former|latter)\b')
if [ -n "$positional" ]; then
  echo "FAIL: quiz text names an option by position:"
  echo "$positional"
  status=1
else
  echo "pass: no quiz option named by position"
fi

echo "advisory: ordinals in the quiz, read each one:"
quiz | grep -oEi 'the (first|second|third|last|former|latter)\b[^.]{0,40}' || echo "  none"

exit $status
