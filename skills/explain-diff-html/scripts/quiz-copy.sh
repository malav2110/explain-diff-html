#!/bin/sh
# Writes the copy of a drafted page that the quiz reader in step 6 of SKILL.md
# reads: no answer feedback, no data-correct marks, and no style, scripts, or
# comments. What the quiz reader does with it is in
# references/writing-quality.md.
#
# Usage: sh quiz-copy.sh <drafted page> <copy>
#
# Pass literal paths. A shell variable set in an earlier tool call is gone.
# Exits 0 when the copy carries no feedback, 1 when some survives or the copy
# cannot be written, 2 on bad usage.

page=$1
copy=$2

if [ -z "$page" ] || [ -z "$copy" ]; then
  echo "usage: sh quiz-copy.sh <drafted page> <copy>" >&2
  exit 2
fi

if [ ! -f "$page" ] || [ ! -s "$page" ]; then
  echo "FAIL: $page is not a non-empty file" >&2
  exit 1
fi

# Comments, style, and scripts go first: the style block's selectors name
# quiz-feedback, and a comment can hold an answer. Each feedback div then goes
# with everything nested in it, counted while the page still has its lines.
# The text of each removed feedback block goes to stdout, so the copy can be
# searched for it below. A block's opening words alone can match a sentence
# the prose also states, so the search uses the whole block.
snippets=$(LC_ALL=C awk -v copy="$copy" '
  { s = s $0 "\n" }
  function cut(t, from, to,   out, i, j) {
    out = ""
    while ((i = index(t, from)) > 0) {
      j = index(substr(t, i + length(from)), to)
      if (j == 0) break
      out = out substr(t, 1, i - 1)
      t = substr(t, i + length(from) + j - 1 + length(to))
    }
    return out t
  }
  function words(t,   a, n, i, w) {
    gsub(/<[^>]*>/, " ", t); gsub(/&[#A-Za-z0-9]+;/, " ", t)
    n = split(t, a, /[ \t\r\n]+/); w = ""
    for (i = 1; i <= n; i++) if (a[i] != "") w = w (w == "" ? "" : " ") a[i]
    return w
  }
  END {
    s = cut(s, "<!--", "-->")
    s = cut(s, "<style", "</style>")
    s = cut(s, "<script", "</script>")
    out = ""; removed = 0
    while ((i = index(s, "<div")) > 0) {
      gt = index(substr(s, i), ">")
      if (gt == 0) break
      tag = substr(s, i, gt)
      if (tag !~ /class="[^"]*quiz-feedback/) {
        out = out substr(s, 1, i + gt - 1)
        s = substr(s, i + gt)
        continue
      }
      out = out substr(s, 1, i - 1)
      s = substr(s, i + gt)
      body = ""; depth = 1
      while (depth > 0) {
        o = index(s, "<div"); c = index(s, "</div>")
        if (c == 0) exit 4
        if (o > 0 && o < c) { depth++; body = body substr(s, 1, o + 3); s = substr(s, o + 4) }
        else { depth--; body = body substr(s, 1, c - 1); s = substr(s, c + 6) }
      }
      removed++
      print words(body)
    }
    s = out s
    # The attribute bare, or with a value in double, single, or no quotes.
    q = "\047"
    gsub("[ \t\r\n]data-correct(=(\"[^\"]*\"|" q "[^" q "]*" q "|[^ \t\r\n>]*))?", "", s)
    questions = gsub(/class="([^"]* )?quiz-question[ "]/, "&", s)
    printf "%s", s > copy
    if (removed < questions) exit 3
  }' "$page")
result=$?

if [ "$result" -eq 3 ]; then
  echo "FAIL: a quiz question has no quiz-feedback div to remove"
  exit 1
elif [ "$result" -eq 4 ]; then
  echo "FAIL: a quiz-feedback div never closes"
  exit 1
elif [ "$result" -ne 0 ] || [ ! -s "$copy" ]; then
  echo "FAIL: could not write $copy"
  exit 1
fi

# Only markup counts. A page may name these words in its own prose or code.
if LC_ALL=C tr '\n' ' ' < "$copy" \
  | grep -Eq '<[^>]*(class="[^"]*quiz-feedback|[ \t]data-correct)'; then
  echo "FAIL: $copy still carries quiz-feedback or data-correct markup"
  exit 1
fi

text=$(LC_ALL=C tr '\n' ' ' < "$copy" | sed -E 's/<[^>]*>/ /g; s/&[#A-Za-z0-9]+;/ /g; s/[[:space:]]+/ /g')
left=""
while IFS= read -r snippet; do
  [ -n "$snippet" ] || continue
  if printf '%s\n' "$text" | grep -Fq -- "$snippet"; then
    left="$left
  $snippet"
  fi
done <<EOF
$snippets
EOF
if [ -n "$left" ]; then
  echo "FAIL: feedback text still appears in $copy:$left"
  exit 1
fi

echo "pass: $copy carries no answer feedback"
