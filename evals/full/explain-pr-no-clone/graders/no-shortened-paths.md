---
type: regex
target: { source: file, path: page.html }
pattern: '(class="filename"|<code>)[^<]*\.\.\./'
match: not_contains
---
