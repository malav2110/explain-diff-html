# Writing quality

This is the catalogue for step 6 of the workflow in `SKILL.md`. Give it to the
sub-agent that reads the draft cold, or run it inline when there is no
sub-agent.

The catalogue, trimmed to the tells that actually show up in a technical
explanation:

- Inflated significance. Calling the change pivotal, crucial, or a milestone.
  State what it does and let the reader judge.
- Promotional language. Seamless, robust, powerful, elegant, comprehensive.
- Overused AI vocabulary. Delve, leverage, utilize, underscore, showcase,
  navigate the complexities, it is worth noting, at its core, in the realm of.
- Superficial `-ing` analyses. A trailing clause that restates the sentence as
  significance: "improving performance and enhancing maintainability".
- Vague attribution. "Widely considered", "generally accepted", "many
  developers". Name the source or drop the claim.
- Negative parallelism. "Not only X but also Y", "It is not just A, it is B".
- Rule of three. Three-item lists and triple adjectives used as rhythm rather
  than because there are exactly three things.
- Em dash overuse. Use commas, periods, colons, or semicolons instead.
- Boldface overuse. Reserve it for a genuine warning. Headings carry structure.
- Filler. "It is important to note", "in order to", "at the end of the day".
- Hedge stacking. "May potentially somewhat", "could arguably tend to".
- Signposting. "In this section we will explore". Just explore it.
- Generic positive conclusion. A closing paragraph that praises the change and
  says nothing new.
- Reflexive systems metaphors. Orchestration, choreography, the beating heart,
  under the hood, plumbing, used as decoration rather than for a precise
  literal meaning.
- Invented compound terms. Coining a capitalised name for a concept the project
  does not name, then using it as though the reader knows it.

The tells above are about word choice. A page can pass every one of them and
still lose its reader through density, which is what a technical explanation
actually fails at. Ask for these too:

- Shorthand before its definition. A term the project uses freely, dropped in
  before the page says what it is. "Still set in italics the way value names
  are", where value name has not been introduced.
- An identifier cited but never named. Referring to a function only as
  `render.rs:157` while describing what it does, so the reader cannot connect
  the description to the name when the name finally appears. Name it where you
  first describe it.
- A back-reference reaching too far. "Both fall out of the render order below",
  pointing past three intervening examples. Either move the explanation closer
  or say where it is.
- Stacked noun phrases. "The flag-rendering match arms" reads more plainly as
  "the match arms that render each flag".
- Participial openers. "Marking the group required tells clap to reject..."
  becomes "A required group rejects...".
- Process-order narration. What you searched, tried, and found in the order it
  happened. The page carries the result.
- A fact with no consequence. A count or a diffstat that closes a section
  without telling the reader what it changes for them. Say what it means or cut
  it.
- Uniform sentence length. A long run of sentences at the same length reads as
  generated even when every one is correct. Vary them.

Write in the project's vocabulary, one idea per sentence, active voice with the
actor named, and the simplest word that carries the meaning.

Give a word one meaning per page. When a term already names something specific
in the explanation, do not reuse it for a second sense. On a page that discusses
test files, "test" belongs to those files, so a boolean condition is a check. The
reader cannot see your intent, only the word.

The sub-agent's prompt must also ask this, because it is what catches the
failures the catalogue misses:

- Is any sentence doing rhetorical work the evidence does not support? Name
  every place the page asserts a motive, an intent, a history, or a duration it
  has not shown. A phrase such as "this looked harmless for years" or "that is a
  deliberate extension point" reads as fact and is usually invention. Either
  quote the record that supports it or cut it. When the claim is the author's own
  inference, the page must say so.
- Where did you lose the thread, and which terms appear before they are
  introduced?
- Does Intuition give the core idea before the walkthrough starts, or does it
  ask the reader to take the central claim on trust until a later section?

## The quiz reader

Step 6 ends with a second sub-agent, the quiz reader. It reads only the copy
that `scripts/quiz-copy.sh` writes, which carries no answer feedback and no
`data-correct` marks. Its prompt must ask it to:

- Answer each question, with a one-line reason that cites the passage on the
  page it relied on.
- Name each question it answered by near-lookup, where a sentence on the page
  all but states the answer.
- Name each question it answered by ruling out the other options rather than
  by knowing the right one.
- Read the copy only, never the repository, the diff, or the draft.

Compare its answers with the marked answers, and act on each finding:

- A wrong answer means the page did not teach the mechanism. Fix the section
  the question tests, so it teaches the mechanism without stating the answer.
  Change the question only when the reason shows the stem itself misleads. On
  a familiar page, fix the prose and report a misleading stem instead.
- A correct answer whose reason cites nothing on the page may come from general
  knowledge. Flag it in the step 8 report.
- A near-lookup or an answer by elimination is a finding against the question.
  On a beginner page, rewrite the question to the rules in
  `references/quiz-design.md`. On a familiar page the quiz is fixed, so report
  the finding instead.

The quiz reader works because it has not seen the answers. Never give it the
draft, the feedback text, or your own summary of the page.
