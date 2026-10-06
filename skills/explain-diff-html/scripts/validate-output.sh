#!/bin/sh
# The command-line checks from step 7 of SKILL.md. What each check is, and why
# it exists, is in references/validation.md.
#
# Usage: sh validate-output.sh <drafted page> <short commit> [<work directory>]
#
# Pass literal paths. A shell variable set in an earlier tool call is gone.
# The coverage check needs the work directory, which holds diff.txt.
# Exits 0 when every pass/fail check passes, 1 when one fails, 2 on bad usage.

page=$1
sha=$2
work=$3

if [ -z "$page" ] || [ -z "$sha" ]; then
  echo "usage: sh validate-output.sh <drafted page> <short commit> [<work directory>]" >&2
  exit 2
fi

# A directory passes test -s, and step 8's $out is a directory, so require a
# regular file as well.
if [ ! -f "$page" ] || [ ! -s "$page" ]; then
  echo "FAIL: $page is not a non-empty file" >&2
  exit 1
fi

status=0
m=$(printf '\001')

# The page on one line with its comments removed, so a FILL comment never
# counts as content.
uncommented() {
  LC_ALL=C tr '\r\n' '  ' < "$page" \
    | LC_ALL=C sed -e "s#-->#$m#g" -e "s#<!--[^$m]*$m# #g"
}

# The same, without the failed-check banner, so a path the banner names does
# not count as covered.
flat() {
  uncommented | LC_ALL=C sed -E 's#<div class="check-banner"([^<]|<[^d/]|</[^d])*</div># #'
}

# One token per line, each both as written and with a trailing :line or
# punctuation removed, so a path compares whole, even one such as (auth)/a.tsx.
tokens() {
  tr ' ' '\n' | sed -E 'p; s/:[0-9].*$//; s/[,.;:)]+$//; s/^[(]+//' | grep -v '^$'
}

# Lines that start a second sentence: a terminator followed by a capital. Code
# spans and common abbreviations are masked first, because `os.Path` and
# "e.g." carry a dot.
second_sentence() {
  sed -E 's#<code[^>]*>[^<]*</code>#CODE#g; s#<[^>]*># #g; s/  +/ /g
    s/(e\.g|i\.e|vs|etc)\./\1/g' \
    | LC_ALL=C grep -E "[.!?][\"')]* +[A-Z]"
}

# Advisory: words per section, the count the release tests compare.
LC_ALL=C tr '\r\n' '  ' < "$page" | LC_ALL=C sed \
  -e "s#-->#$m#g" -e "s#<!--[^$m]*$m# #g" \
  -e "s#</style>#$m#g" -e "s#<style[^$m]*$m# #g" \
  -e "s#</script>#$m#g" -e "s#<script[^$m]*$m# #g" \
  -e "s#</pre>#$m#g" -e "s#<pre[ >][^$m]*$m# #g" \
  -e "s#<section id=\"#$m#g" | LC_ALL=C tr "$m" '\n' |
  LC_ALL=C awk 'NR>1{id=$0;sub(/".*/,"",id);sub(/<\/section>.*/,"");sub(/^[^>]*>/,"");
    gsub(/<[^>]*>/," ");gsub(/&[#A-Za-z0-9]+;/," ");n=0;
    for(i=1;i<=NF;i++)if($i~/[A-Za-z0-9]/)n++;t+=n;printf "%s %d  ",id,n}
    END{printf "total %d\n",t}' | sed 's/^/words: /'

# Flatten, then strip anchors, so a linked reference still counts as a reference.
refs=$(tr '\n' ' ' < "$page" | sed -E 's#</?a[^>]*>##g; s/  +/ /g' \
  | grep -oE '(<code[^>]*>|class="filename"[^>]*>) *[^<]*\.[A-Za-z]+:[0-9]+' | wc -l | tr -d ' ')
links=$(grep -o 'class="srcref"' "$page" | wc -l | tr -d ' ')
echo "references=$refs linked=$links"

wrong=$(grep -o 'href="[^"]*/blob/[^"]*"' "$page" | grep -v "$sha")
if [ -n "$wrong" ]; then
  echo "FAIL: links that do not name $sha:"
  echo "$wrong"
  status=1
else
  echo "pass: no blob link names another commit"
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

# The "Also changed" table's markup, and the text of its first column. Only the
# first column names files, because a reason such as "same fix as src/" must
# not cover anything.
table=$(flat | sed 's#</table>#\
#g' | grep '<table [^>]*also-changed' | sed 's#.*<table [^>]*also-changed[^>]*>##')
first_column=$(printf '%s\n' "$table" | sed 's#<tr#\
<tr#g' | grep '<td' | sed -E 's#</td>.*##; s#.*<td[^>]*>##; s#<[^>]*># #g')
table_tokens=$(printf '%s\n' "$first_column" | tokens)

# Coverage: every path in the diff appears on the page, and the table caption
# counts what the table covers. The paths come from the diff --git headers,
# because a binary file has no +++ line.
if [ -z "$work" ]; then
  echo "skip: coverage, no work directory given"
elif [ ! -s "$work/diff.txt" ]; then
  echo "FAIL: $work/diff.txt is missing or empty"
  status=1
else
  page_text=$(flat | sed 's#<[^>]*># #g; s/  */ /g')
  page_tokens=$(printf '%s\n' "$page_text" | tokens)
  # Git quotes a path that holds unusual characters.
  paths=$(sed -n -e 's#^diff --git "a/.*" "b/\(.*\)"$#\1#p' -e 't' \
    -e 's#^diff --git a/.* b/##p' "$work/diff.txt")
  files=0
  in_table=0
  missing=""
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    files=$((files + 1))
    covered=no
    # A path with a space never survives tokenizing, so match it as text.
    case $f in
      *' '*)
        if printf '%s\n' "$first_column" | grep -Fq -- "$f"; then
          covered=table
        elif printf '%s\n' "$page_text" | grep -Fq -- "$f"; then
          covered=page
        fi
        ;;
    esac
    if [ "$covered" != no ]; then
      :
    elif printf '%s\n' "$table_tokens" | grep -Fqx -- "$f"; then
      covered=table
    else
      # A directory row names a parent directory with a trailing slash.
      d=$f
      while [ "$covered" = no ] && [ "${d%/*}" != "$d" ]; do
        d=${d%/*}
        printf '%s\n' "$table_tokens" | grep -Fqx -- "$d/" && covered=table
      done
    fi
    if [ "$covered" = table ]; then
      in_table=$((in_table + 1))
    elif [ "$covered" = no ] && ! printf '%s\n' "$page_tokens" | grep -Fqx -- "$f"; then
      missing="$missing
  $f"
    fi
  done <<EOF
$paths
EOF
  if [ "$files" -eq 0 ]; then
    echo "FAIL: $work/diff.txt has no diff --git headers"
    status=1
  elif [ -n "$missing" ]; then
    echo "FAIL: changed files the page never names:$missing"
    status=1
  else
    echo "pass: all $files changed files appear on the page"
  fi
  if [ -n "$table" ]; then
    caption=$(printf '%s\n' "$table" | sed 's#<[^>]*># #g' \
      | grep -oE 'Every other changed file \( *[0-9]+ +of +[0-9]+ *\)' \
      | tr -s ' ' | sed 's/( */(/; s/ *)/)/')
    if [ "$caption" = "Every other changed file ($in_table of $files)" ]; then
      echo "pass: table caption counts $in_table of $files"
    else
      echo "FAIL: table caption reads '${caption:-no caption}', expected ($in_table of $files)"
      status=1
    fi
  fi
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

# Quiz count: three questions for at most two core steps, five otherwise, or a
# lower count the quiz section declares with a reason.
section=$(flat | sed 's#<section id="#\
<section id="#g' | grep '^<section id="quiz"' | sed 's#</section>.*##')
if [ -z "$section" ]; then
  echo "FAIL: the page has no quiz section"
  status=1
else
  steps=$(flat | grep -oE '<h3 [^>]*class="[^"]*core-step' | wc -l | tr -d ' ')
  asked=$(printf '%s\n' "$section" | grep -o 'class="[^"]*quiz-question' | wc -l | tr -d ' ')
  expected=5
  [ "$steps" -le 2 ] && expected=3
  declared=$(printf '%s\n' "$section" | sed -n 's#^<section id="quiz"[^>]*data-quiz-count="\([0-9]*\)".*#\1#p')
  reason=$(printf '%s\n' "$section" | sed -n 's#^<section id="quiz"[^>]*data-quiz-reason="\([^"]*\)".*#\1#p')
  if [ -n "$declared" ]; then
    if [ "$declared" -ge 1 ] && [ "$declared" -le "$expected" ] \
      && [ "$asked" -eq "$declared" ] && [ -n "$reason" ] \
      && ! printf '%s' "$reason" | grep -q 'FILL'; then
      echo "pass: $asked questions, the declared count, because: $reason"
    else
      echo "FAIL: $asked questions, declared $declared of at most $expected, reason '${reason}'"
      status=1
    fi
  elif [ "$asked" -eq "$expected" ]; then
    echo "pass: $asked questions for $steps core steps"
  else
    echo "FAIL: $asked questions for $steps core steps, expected $expected"
    status=1
  fi

  # Longest option: count the questions whose correct option has more words
  # than every other option.
  longest=$(printf '%s\n' "$section" | sed 's#class="[^"]*quiz-question[^"]*"#\
Q #g; s#<button#\
<button#g' | awk '
    function words(t,  a, n, i, c) {
      gsub(/<[^>]*>/, " ", t); gsub(/&[#A-Za-z0-9]+;/, " ", t)
      n = split(t, a, " "); c = 0
      for (i = 1; i <= n; i++) if (a[i] ~ /[A-Za-z0-9]/) c++
      return c
    }
    function finish() { if (q && right > other) hits++ }
    /^Q / { finish(); q = 1; right = -1; other = -1; next }
    /^<button/ && q {
      t = $0; sub(/<\/button>.*/, "", t)
      is_right = (t ~ /^<button[^>]*data-correct/); sub(/^<button[^>]*>/, "", t)
      n = words(t)
      if (is_right) right = n; else if (n > other) other = n
    }
    END { finish(); print hits + 0 }')
  allowed=1
  [ "$asked" -ge 5 ] && allowed=2
  if [ "$longest" -le "$allowed" ]; then
    echo "pass: the longest option is correct in $longest of $asked questions"
  else
    echo "FAIL: the longest option is correct in $longest of $asked questions, at most $allowed allowed"
    status=1
  fi
fi

# Caps: the lead is one sentence, and so is each table reason.
lead=$(flat | grep -o '<p class="lead"[^>]*>.*' | sed 's#</p>.*##; s#^<p[^>]*>##')
if [ -z "$(printf '%s' "$lead" | sed 's#<[^>]*>##g; s/ //g')" ]; then
  echo "FAIL: the page has no p.lead sentence"
  status=1
elif printf '%s\n' "$lead" | second_sentence > /dev/null; then
  echo "FAIL: p.lead runs past one sentence"
  status=1
else
  echo "pass: p.lead is one sentence"
fi

if [ -n "$table" ]; then
  long=$(printf '%s\n' "$table" | sed 's#<tr#\
<tr#g' | grep '<td' | sed -E 's#.*<td[^>]*>##; s#</td>.*##' | second_sentence)
  if [ -n "$long" ]; then
    echo "FAIL: table reasons that run past one sentence:"
    echo "$long"
    status=1
  else
    echo "pass: every table reason is one sentence"
  fi
fi

# A path shortened with "..." cannot be linked, so the reference stays bare.
# Code blocks are blanked first, because a quoted line may carry "..." itself.
elided=$(tr '\n' ' ' < "$page" \
  | LC_ALL=C sed -e "s#</pre>#$m#g" -e "s#<pre[ >][^$m]*$m# #g" -e 's/  */ /g' \
  | grep -oE '(<code[^>]*>|class="filename"[^>]*>)( *<a[^>]*>)? *[^<]*\.\.\./[^<]*')
if [ -n "$elided" ]; then
  echo "FAIL: references with a shortened path:"
  echo "$elided"
  status=1
else
  echo "pass: no reference shortens its path with ..."
fi

# The level the provenance line records. Only that line counts, because a page
# may quote a level elsewhere. A page that records none predates levels, and is
# read as beginner.
provenance=$(flat | grep -o '<p class="provenance"[^>]*>.*' | sed 's#</p>.*##; s#<[^>]*># #g')
level=beginner
printf '%s\n' "$provenance" | grep -Eq 'Level: +familiar' && level=familiar

# Collapsed blocks: none on a familiar page, at most one on a beginner page.
blocks=$(flat | grep -o '<details[ >]' | wc -l | tr -d ' ')
most=1
[ "$level" = familiar ] && most=0
if [ "$blocks" -le "$most" ]; then
  echo "pass: $blocks collapsed blocks on a $level page"
else
  echo "FAIL: $blocks collapsed blocks on a $level page, at most $most allowed"
  status=1
fi

# Names: each identifier-shaped <code> name in a quiz stem or option, and in
# the Code section's prose, looked up in the Background and Intuition prose
# outside the collapsed block. Answer feedback is not checked. Each output line
# is a kind and a name: quiz for a quiz name never introduced, block for a name
# introduced only inside the block, code for a Code name never introduced. The
# last line is "done", or "skip" when a section is missing, so an awk that
# fails part way cannot read as a pass.
names=$(flat | LC_ALL=C awk '
  function cut(t, from, to,   out, i, j) {
    out = ""
    while ((i = index(t, from)) > 0) {
      j = index(substr(t, i + length(from)), to)
      if (j == 0) break
      out = out substr(t, 1, i - 1) " "
      t = substr(t, i + length(from) + j - 1 + length(to))
    }
    return out t
  }
  function spans(t, from, to,   out, i, j) {
    out = ""
    while ((i = index(t, from)) > 0) {
      j = index(substr(t, i), to)
      if (j == 0) break
      out = out " " substr(t, i, j - 1)
      t = substr(t, i + j - 1 + length(to))
    }
    return out
  }
  # The index just past the </div> that closes the div opening at i, nested
  # divs included, or 0 when it never closes.
  function divend(t, i,   depth, p, o, c) {
    p = i + 4; depth = 1
    while (depth > 0) {
      o = index(substr(t, p), "<div"); c = index(substr(t, p), "</div>")
      if (c == 0) return 0
      if (o > 0 && o < c) { depth++; p += o + 3 }
      else { depth--; p += c + 5 }
    }
    return p
  }
  # The divs whose opening tag starts with opener: their markup when keep is
  # 1, or t without them when keep is 0.
  function divs(t, opener, keep,   out, i, e) {
    out = ""
    while ((i = index(t, opener)) > 0) {
      e = divend(t, i)
      if (e == 0) break
      out = out (keep ? " " substr(t, i, e - i) : substr(t, 1, i - 1) " ")
      t = substr(t, e)
    }
    return keep ? out : out t
  }
  function text(t) {
    gsub(/<[^>]*>/, " ", t); gsub(/&nbsp;/, " ", t)
    gsub(/&lt;/, "<", t); gsub(/&gt;/, ">", t); gsub(/&amp;/, "\\&", t)
    return t
  }
  # The name a <code> span gives, or "" when it is not identifier-shaped or is
  # exempt: a value after "=", a file name, an example address, a builtin, or
  # a one-letter placeholder such as T or n.
  function name(x) {
    x = text(x)
    sub(/=.*/, "", x); gsub(/^[ @#$]+|[ ]+$/, "", x)
    sub(/\(.*/, "", x); sub(/[.,;:]+$/, "", x)
    if (length(x) < 2) return ""
    if (x !~ /^[A-Za-z_][A-Za-z0-9_]*((\.|::)[A-Za-z_][A-Za-z0-9_]*)*$/) return ""
    if (x ~ /\.(py|pyi|ts|tsx|js|jsx|mjs|cjs|java|kt|kts|scala|groovy|rs|go|rb|php|cs|cpp|hpp|swift|dart|vue|svelte|jsp|jspf|tld|md|json|ya?ml|toml|html|css|scss|less|svg|sh|sql|txt|xml|properties|gradle|lock|cfg|ini|conf|env)$/) return ""
    if (x ~ /(^|\.)example(\.|$)/ || x ~ /\.(com|org|net|io|dev)$/ || x == "localhost") return ""
    if (x in builtin) return ""
    return x
  }
  function collect(t, into,   x) {
    while (match(t, /<code[^>]*>[^<]*<\/code>/)) {
      x = name(substr(t, RSTART, RLENGTH))
      t = substr(t, RSTART + RLENGTH)
      if (x != "") into[x] = 1
    }
  }
  # Whole-word search, so "id" does not match inside "valid". The offset p
  # keeps each test against the whole string, not a trimmed copy.
  function found(t, x,   i, p) {
    p = 0
    while ((i = index(substr(t, p + 1), x)) > 0) {
      i += p
      if ((i == 1 || substr(t, i - 1, 1) !~ /[A-Za-z0-9_]/) &&
          substr(t, i + length(x), 1) !~ /[A-Za-z0-9_]/) return 1
      p = i
    }
    return 0
  }
  # Builtin types, exceptions, and annotations, and the keywords of the
  # languages the samples use.
  BEGIN {
    split("bool int str float bytes list dict tuple set object None True " \
      "False self cls type len print range Exception string number boolean " \
      "null undefined true false void any unknown never Object Array Promise " \
      "Map Set String Number Boolean Error Integer Long Double List Optional " \
      "TypeError ValueError KeyError RuntimeError AttributeError IndexError " \
      "RangeError ReferenceError SyntaxError NotImplementedError Override " \
      "Deprecated SuppressWarnings FunctionalInterface this nil async await " \
      "return new if else elif try catch except finally raise throw throws " \
      "break continue for while do switch case default with yield def class " \
      "import from export const let var function static public private " \
      "protected final abstract interface extends implements in is not and " \
      "or pass del global lambda typeof instanceof delete of super enum assert " \
      "Any Union Callable Iterable Iterator Sequence Mapping StopIteration " \
      "OSError Date RegExp Symbol Function NaN Infinity JSON Math console " \
      "dataclass property staticmethod classmethod GET POST PUT PATCH DELETE", b, " ")
    for (k in b) builtin[b[k]] = 1
  }
  {
    s = cut(cut(cut($0, "<style", "</style>"), "<script", "</script>"), "<pre", "</pre>")
    bg = index(s, "<section id=\"background\""); cd = index(s, "<section id=\"code\"")
    qz = index(s, "<section id=\"quiz\"")
    if (cd == 0 || qz == 0) { print "skip"; exit }
    if (bg == 0 || bg > cd) bg = 1
    intro = substr(s, bg, cd - bg)
    code = substr(s, cd, qz - cd)
    quiz = substr(s, qz); sub(/<\/section>.*/, "", quiz)
    block = text(spans(intro, "<details", "</details>"))
    rest = cut(intro, "<details", "</details>")
    # "<p>" and "<p " but not "<path", and the same for the other tags.
    prose = text(spans(rest, "<p>", "</p>") spans(rest, "<p ", "</p>") \
      spans(rest, "<li>", "</li>") spans(rest, "<li ", "</li>") \
      spans(rest, "<td>", "</td>") spans(rest, "<td ", "</td>") \
      divs(rest, "<div class=\"callout", 1))
    collect(divs(quiz, "<div class=\"quiz-feedback", 0), asked)
    code = cut(cut(code, "<a class=\"srcref\"", "</a>"), "<table", "</table>")
    collect(code, used)
    for (x in asked) {
      if (found(prose, x)) continue
      print (found(block, x) ? "block " : "quiz ") x
    }
    for (x in used) {
      if ((x in asked) || found(prose, x)) continue
      print (found(block, x) ? "block " : "code ") x
    }
    print "done"
  }' | sort)
unnamed=$(printf '%s\n' "$names" | sed -n 's/^quiz //p')
hidden=$(printf '%s\n' "$names" | sed -n 's/^block //p')
if printf '%s\n' "$names" | grep -qx skip; then
  echo "skip: names, the page has no Code or Quiz section"
elif ! printf '%s\n' "$names" | grep -qx done; then
  echo "FAIL: the naming check did not run"
  status=1
else
  if [ -n "$unnamed" ]; then
    echo "FAIL: quiz names never introduced in Background or Intuition prose:"
    printf '%s\n' "$unnamed" | sed 's/^/  /'
    status=1
  else
    echo "pass: every quiz name is introduced before the walkthrough"
  fi
  if [ -n "$hidden" ]; then
    echo "FAIL: names introduced only inside the collapsed block:"
    printf '%s\n' "$hidden" | sed 's/^/  /'
    status=1
  else
    echo "pass: no name is introduced only inside the collapsed block"
  fi
  echo "advisory: Code names that appear nowhere before the walkthrough, read each one:"
  printf '%s\n' "$names" | sed -n 's/^code /  /p' | grep . || echo "  none"
fi

# The banner: it names at least one check, and it is gone once every check
# passes. This runs last, because it reads the status of every check above.
banner=$(uncommented | grep -oE '<div class="check-banner"([^<]|<[^d/]|</[^d])*</div>')
if [ -n "$banner" ]; then
  named=$(printf '%s' "$banner" | sed 's#<[^>]*># #g; s/Failed checks://; s/ //g')
  if [ -z "$named" ]; then
    echo "FAIL: the check banner names no check"
    status=1
  elif [ "$status" -eq 0 ]; then
    echo "FAIL: the check banner is still on a page whose checks pass"
    status=1
  else
    echo "pass: the check banner names the failed checks"
  fi
fi

exit $status
