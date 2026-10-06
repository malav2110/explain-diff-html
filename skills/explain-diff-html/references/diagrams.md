# Diagrams

This is step 4 of the workflow in `SKILL.md`.

Draw one diagram per idea. A second picture of an idea the page already drew
repeats it, so leave it out.

Pick a small number of diagram families and reuse them across the page. Do not
use ASCII diagrams; build them in HTML and CSS. The template carries three:

- A simplified version of the app UI, to explain what the user sees change.
  Skip it for a change with no user-visible surface.
- A system diagram showing data flow between components. Always include example
  data on the arrows. Wrap every node after the first with its incoming arrow in
  a `.step`, as the template shows. The row wraps between steps, so a flow
  longer than the column stays readable instead of leaving an arrow pointing at
  nothing. How many nodes fit one line depends on how long their labels are, not
  on the count, so expect wrapping and keep the labels to a few words. The
  `.step` wrapper is what makes a wrapped flow read correctly.
- A node or recursion tree, for syntax trees, nesting, or recursive structures.

For structural diagrams where a node-and-edge picture is clearer, use Mermaid
loaded from a CDN. Match the diagram type to the change:

- State machine or entity relationship: a state or ER diagram, when the shape
  of the states or the data is the point.
- Interaction over time: a sequence diagram, when the change is a
  request and response exchange, a retry or polling loop, an async handshake,
  or a back-and-forth between a user, a client, and a service. Prefer it over
  the data-flow family when the ordering of messages, the waits, and the
  repeats carry the meaning; keep the data-flow family when one linear path
  with example payloads says enough.
- A branching decision, or one thing contained inside another: a flowchart, when
  the change turns on which branch a value takes, or when the point is that a
  file, a context, or a component sits inside another. Subgraphs are the only
  way any of these types draws containment. Use it sparingly: a linear path is
  the data-flow family's job, and a flowchart drawn for a linear path wastes
  vertical space and adds nothing.

A sequence diagram is the easiest of these to reach for wrongly. It earns its
place when ordering, waiting, or a real back-and-forth carries the meaning. When
both lanes are a single pass with no wait and no reply, the shape is wrong, and a
participant talking only to itself is the tell.

Validate every Mermaid source before pasting it. Write the diagram to a scratch
`.mmd` file, run the validator, then paste the source into a
`<pre class="mermaid">` block.

```bash
npx -y @probelabs/maid@0.0.29 --strict <file.mmd>
```

The version is pinned on purpose. `npx -y` installs without prompting, so an
unpinned name runs whatever npm resolves as latest at that moment, on the
developer's machine, with no lockfile and no integrity check. The Mermaid CDN
load in the template is pinned the same way and for the same reason. To move
versions, change the number here after checking the release, the way you would
for the CDN below.

Five `--strict` rules catch people out:

- Every node label must be double-quoted. Write `H["SYNOPSIS section"]`, not
  `H[SYNOPSIS section]`. Unquoted labels parse fine in Mermaid itself, so this
  one only appears when you validate, which is the reason to validate first.
- State-diagram transition labels reject hyphens and commas, so phrase labels
  without them.
- Flowchart edge labels must use pipe syntax, not quotes. Write
  `B -->|yes| C`, not `B -- "yes" --> C`.
- Sequence-diagram `participant ... as` aliases reject commas. Message text and
  `Note` lines accept them, so only the alias needs rephrasing.
- An apostrophe inside a double-quoted node label breaks the parse. Write
  `A["a file only uPortal has"]`, not `A["uPortal's own file"]`.

All five are quick to hit and quick to fix, which is the reason to validate
before pasting rather than after.

The `.mermaid` container style and a non-blocking loader already ship in the
template, so a pasted block renders with no extra wiring. The loader pins an
exact Mermaid version and checks it with a Subresource Integrity hash. To move
versions, change the `@x.y.z` in the `src` and recompute the hash:

```bash
curl -sfL <url> | openssl dgst -sha384 -binary | openssl base64 -A
```

A stale hash makes the browser block the script, and the diagrams then fail
silently with no console error a reader would notice.

When you paste the validated source into the `<pre class="mermaid">` block,
HTML-escape `&`, `<`, and `>` the same as a code block. The block is parsed as
HTML before Mermaid reads its `textContent`, so an unescaped `<br/>` in a label
is consumed as a real void element and its line break silently vanishes, and a
bare `<` opens an unclosed tag. The browser decodes the entities back before
Mermaid parses `textContent`, so arrows such as `-->` survive and an escaped
`<br/>` renders as a line break.

Color Mermaid nodes only when color carries meaning, and take the colors from
the template's own tokens so the diagrams match the page:

| Role                        | Fill      | Stroke    |
| --------------------------- | --------- | --------- |
| Neutral node, the default   | `#f6f7f9` | `#d7dbdf` |
| The node the change touches | `#e8eefc` | `#3b6cf6` |
| Success or accepted path    | `#e4f3ea` | `#1a7f47` |
| Failure or rejected path    | `#fbe7e9` | `#c62a3b` |
| Edge case or caveat         | `#fbefe1` | `#b5620a` |

Apply them with `classDef`, and give every `classDef` an explicit `color:` for
the label text:

```
classDef ok fill:#e4f3ea,stroke:#1a7f47,color:#16181b
```

Use the neutral fill as the default and add at most three of the
meaning-carrying roles to one diagram; past that, the colors stop
distinguishing anything.

The `color:` is not optional. The template's loader switches Mermaid to its
dark theme when the reader's system is dark, and that theme paints node labels
a light grey. The fills above stay light regardless, because `classDef` writes
them with `!important`. A label left to the theme therefore lands at about
1.4:1 against its own node, and the diagram is unreadable in dark mode while
looking correct in light mode. Pinning the text dark holds in both themes and
measures above 15:1 on every fill in the table.
