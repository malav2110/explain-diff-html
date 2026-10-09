# Self-check before saving

This is step 7 of the workflow in `SKILL.md`: what each check is, and why it
exists.

Start with the anchors, the code claims, and the links. Dispatch a read-only
sub-agent that re-reads each cited `path:line` at the target ref, checks that
what the page says about that code still holds, and reports mismatches. Wait for
that report, as step 2 of `SKILL.md` says, then fix every mismatch before
saving. A wrong anchor and a wrong claim both survive every check below. The
path exists, the line number is a number, and the sentence reads as if someone
looked. Only re-reading the file at the ref catches either one.

Give that same agent the links. It already holds both halves of every URL, the
ref and the path, so checking them there costs almost nothing. For each
reference it reports whether the path resolves in the repo at that ref, and
whether the href names that same commit in full 40-character form, which is not
what the provenance line prints. For a Markdown file, it also reports whether
the href carries `?plain=1`. A reference whose path does not
resolve has to be bare. An href carrying any other commit points a reader at
code the page never described.

Ask it two things about ranges specifically, because neither falls out of
checking that a line number matches. A reference written `path:42-48` needs an
href ending `#L42-L48`, not `#L42`; an agent told only to match the cited line
will pass the single-line form. And the end of the range has to be the last line
actually quoted. Count the lines in the block and compare, rather than trusting
the label: an off-by-one that runs the range onto a blank line reads as correct
in every other check.

When your tools include no way to dispatch a sub-agent, do both checks
yourself. Re-reading a line at a ref is mechanical, so the anchor check loses
nothing inline. Judging whether a claim still holds is not mechanical, so that
half is weaker. Read the code first and your own sentence about it second, and
say that the claim check ran inline when you report the finished page. The
sub-agent is there to keep whole files out of the main context.

The rest of the step is yours to run. `scripts/validate-output.ts` runs the
checks below that are commands. Give it the drafted page and the short commit
that the provenance line names. Write both out literally, because a shell
variable set in an earlier tool call no longer exists. `<this skill's folder>`
is the folder that holds `SKILL.md`:

```bash
[ -f "<this skill's folder>/scripts/node_modules/.package-lock.json" ] ||
  npm ci --omit=dev --prefix "<this skill's folder>/scripts"
node "<this skill's folder>/scripts/validate-output.ts" \
  "<work>/draft.html" "<short sha>"
```

If the output has no `pass:` or `FAIL:` line, the script never ran: Node is
older than 24.12 or the install failed. That is a setup failure, not a page
failure. Run the command checks in this file by hand, and say
in your report which ones ran that way. Flatten newlines before you search the
HTML, because prose wraps in the middle of a phrase.

Do not pass step 8's `$out` as the page. Step 8 defines it as the output
directory. The script refuses anything that is not a non-empty file, so that
mistake fails instead of reporting on a page the script never opened.

- Every code block is a `<pre>`, or a styled element whose CSS sets
  `white-space: pre` or `white-space: pre-wrap`. Scan each block in the HTML
  source and confirm this; otherwise the browser collapses newlines onto one
  line.

- Every code block is HTML-escaped: `&`, `<`, and `>` inside a `<pre>` or
  `<code>` block appear as `&amp;`, `&lt;`, `&gt;`, with the `.del` and `.add`
  spans wrapping the escaped text. Raw angle brackets are parsed as tags and
  silently break the document tree and every anchor below.

- Any Mermaid source in a `<pre class="mermaid">` block is HTML-escaped the same
  way. An unescaped `<br/>` vanishes from the rendered label and a bare `<`
  breaks the block; escaping lets `textContent` decode them back before Mermaid
  parses, so `<br/>` and `-->` survive.

- The file is self-contained: CSS and JS inline, no external request except the
  Mermaid CDN when a Mermaid diagram is present. A source link is not an
  external request. It fetches nothing until a reader clicks it, so the page
  still opens offline.

- The page linked the references it should have, and every link names the
  provenance commit in full. The script prints `references=N linked=M
  marked-bare=B`, then fails on each reference that is neither inside an
  `a.srcref` link nor marked `data-bare`, and lists those references. It skips
  that check when the provenance line says `References are not linked`, the
  host case, where every reference is bare by design. It also fails
  on any `/blob/` link whose sha is not the full 40 characters starting with the
  short commit, and on a link to a `.md` or `.markdown` file that has a line
  anchor and no `?plain=1`.

  Mark each reference you deliberately leave bare with a `data-bare` attribute
  naming the reason, as in `<code data-bare="outside-repo">main.py:8</code>` or
  `<p class="filename" data-bare="outside-repo">`. The attribute does not change
  how the page renders. It is how the script tells a deliberate choice from a
  reference the run forgot to link.

  The count takes a `<code>` span or `.filename` label that starts with
  `path.ext:line`. A `host:port` such as `example.com:8080` has the same shape,
  so the script drops one whose extension is a common top-level domain.

  The sha check alone proves nothing: with no links on the page it finds
  nothing and reports success, which is exactly when the feature is most
  broken. The count comparison is what catches that case.

- Every table-of-contents link resolves to a section anchor on the page, and
  every section on the page appears in the table of contents.

- Every unused template placeholder is deleted. A stray `FILL:` comment or an
  empty diagram block ships as a blank box on the page.

- The quiz is not answerable without reading it. Count the words in every option
  and check two things: that no option in a question runs more than about a
  quarter longer than the shortest, and that the longest option is the correct
  one in no more than one or two of the five questions. Guessing "longest"
  should do no better than guessing at random, and this is the one quiz defect
  that survives the shuffle, because shuffling changes position and not length.

- No quiz feedback names an option by its position. The script shuffles the
  options on every page load, so "the first option" points at a different option
  than the one the sentence means, and the reader is sent to the wrong text.
  Name the option by its content instead. This check is mechanical, and the
  script runs it. The script reads the visible text of the quiz section and
  fails on phrases such as "the first option" or "the latter".

  The script reads the parsed page, not lines of HTML. Prose in the HTML wraps,
  and every sample in this repository has a quiz line ending in "the", so a
  phrase split across two lines is common. The parsed text joins those lines.
  The script confines the search to the element whose `id` is `quiz` inside
  `<main>`, since the template's own comments say things like "the first
  render". It skips `<script>` and `<style>` inside the quiz, because a reader
  never sees their text. It fails when it finds no quiz text at all, because a
  check that reads nothing reports clean.

  The script then prints a wider sweep, which is advisory rather than pass or
  fail. This one catches an ordinal used on its own, as in "the first names a
  real practice", which points at a position without ever saying "option". It
  also fires on ordinary prose such as "the second check" or "the first call",
  so expect hits and read each one. The question for each is whether the
  ordinal names a quiz option or a thing in the code. Do not try to tighten the
  pattern until it returns nothing; across the samples in this repository every
  hit was the second kind, and a pattern narrow enough to clear them would be
  narrow enough to miss the first kind.

  Stating the rule is not enough on its own. It has been violated by authors who
  had it in front of them, and by an author whose check reported clean because it
  was searching line by line.

- The page is checked in dark mode, not only in light. Any Mermaid diagram is
  the thing that breaks here: the loader switches Mermaid's theme with the
  reader's system, while `classDef` fills do not follow, so a diagram that reads
  correctly in light mode can be unreadable in dark mode. Confirm every node
  label and edge label is legible against what sits behind it.

- The page is checked at 400px wide, and nothing scrolls sideways. A wide
  comparison table is the usual cause. The template scrolls `table.vals` in its
  own box at narrow widths, so a table may overflow its container, but the
  document must not: `document.documentElement.scrollWidth` has to equal the
  viewport width.

- Every number the page states about the change is produced by a command, not by
  looking at a snippet: files changed, lines or characters added or removed,
  occurrences of a pattern, how many call sites a helper has. Read a count off the
  screen and a five-line block becomes "four lines". Run it:

  ```bash
  # lines in each <pre>, in page order, which each range label has to match
  awk '
    # A block starts. Remember its line, so you can find the label above it.
    /<pre[ >]/ { block++; start = NR; lines = 0; open = 1 }
    # Count every line of the block, tag lines included.
    open { lines++ }
    # Skip the opening line when no code follows the tag on it.
    open && /<pre[^>]*>[ \t]*(<\/pre|$)/ { lines-- }
    # Skip the closing line when nothing comes before the tag on it.
    open && /^[ \t]*<\/pre/ { lines-- }
    # The block ends at </pre, even when its > sits on the next line.
    open && /<\/pre/ { print "block " block " (line " start "): " lines " lines"; open = 0 }
  ' "<work>/draft.html"
  wc -l fastapi/cli.py                             # lines in a file
  grep -o 'pattern' path | wc -l                   # occurrences
  ```

  The `<pre>` count prints one line per block, so match each block to the label
  above it rather than reading one total. It counts a code line that shares a
  line with the opening tag, and it matches `</pre` without the `>`, because a
  formatter can split the closing tag across two lines.

  Then grep the page for every number it states and confirm each against the
  command that produced it. A count is the easiest claim to get wrong and the
  easiest for a reader to check, and no other check on this list can catch it.
