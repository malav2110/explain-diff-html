# Quiz design

This is step 5 of the workflow in `SKILL.md`. Three of the question shapes
below, and the rule that difficulty belongs in the stem rather than in
near-identical options, are adapted from the learning-opportunities skill by Cat
Hicks, used under CC-BY-4.0:
<https://github.com/DrCatHicks/learning-opportunities>

Each question renders as an interactive multiple-choice block: clicking an
option reveals whether it was correct and gives feedback that connects the
choice to the underlying reasoning.

The walkthrough sets the count, so fix its `h3.core-step` headings before you
draft a question. The quiz has three questions when the page has at most two of
those headings, and five otherwise. A change can carry fewer testable decisions
than that. Then ask only as many questions as it carries, and declare the lower
count and its reason on the quiz section:

```html
<section id="quiz" data-quiz-count="2" data-quiz-reason="FILL: why two">
```

The step 8 report repeats the reason.

Build the questions from these shapes, at most two of any one shape. Below five
questions, use each shape at most once:

- Why this approach. Ask why the change is shaped the way it is, and make the
  distractors the alternatives a competent engineer would actually consider.
- Trace the path. Give a concrete input and ask what the changed code produces,
  or which branch it takes.
- Change one condition. Ask how the behavior differs if a flag, an input, or a
  precondition were different.
- Spot the break. Ask what would fail if a specific line were removed or
  reversed.
- When would the other choice win. Ask under what circumstances the rejected
  alternative would have been right, which is the strongest test of transfer.
- Connect two mechanisms. Ask a question neither mechanism answers alone, so the
  reader has to hold both at once. A page that explains three mechanisms
  separately and then tests each separately never finds out whether the reader
  joined them up.
- Apply it elsewhere. Take the concept the change turns on and ask how it would
  land at a different site in the same codebase, one the page has already named.
  Knowledge tied to a single context stays tied to it.
- Name the general principle. Ask what the change is an instance of, and make
  the distractors neighboring principles rather than wrong facts. This is the
  shape least tied to this particular diff.

Eight rules bind every question, whichever shape it takes:

- Avoid any question whose answer can be copied straight out of the diff. If a
  reader who has not understood the change can still answer it by pattern
  matching on a variable name, replace it.
- Avoid any question the page has already answered. A callout that explains why
  a guard existed, then a question asking why that guard existed, tests whether
  the reader scrolled. Check each question against the prose above it, not only
  against the diff, and move whichever of the two is weaker.
- Ground each distractor in a plausible misunderstanding, not an obviously
  wrong throwaway. A distractor a reader can eliminate without thinking teaches
  nothing, and it makes the correct answer findable by elimination.
- Keep the options within one question the same length. A reader who has not
  understood picks the longest option, and the correct answer attracts length
  because it is the one carrying its own justification. No option may run more
  than about a quarter longer than the shortest in its question. Then count
  across the whole quiz. The longest option may be the correct one in at most
  two of five questions, and in at most one question of a shorter quiz. Past
  that, the page can be answered by word count no matter where the answers sit.
  The fix is not to pad the distractors, which makes every option unreadable.
  It is to cut the reasoning out of the correct option and put it in the
  feedback block, which is where the reasoning belongs, leaving each option as
  a bare claim.
- Vary where the correct option sits in the source. The template's script
  shuffles the options on every page load, so position is random for the reader
  either way. Vary it anyway. Write each question with its correct answer first,
  which is how the reasoning falls out, then move it to a different position per
  question. That keeps the raw HTML honest for anyone reading the
  file, printing it, or opening it with scripts disabled, where the shuffle never
  runs. Count the positions before saving.
- Write each stem so it stands alone. Restate the data the question works on,
  and leave out the reasoning step it tests. Never point at a section or an
  example by its place on the page, as in "the toy URL from Intuition". A
  familiar page keeps this quiz but shortens Intuition, Background, and the
  walkthrough. A stem that points back can then name something that page lacks.
- Write each option so it stands alone. The shuffle reorders them, so an option
  cannot refer to another by position: no "both of the above", no "the first
  option but for the router path". The feedback block may discuss the options by
  their content, never by their order.
- Make a question harder by giving less setup, never by making the options more
  alike. Difficulty belongs in what the reader has to work out, not in how
  finely they have to read. Options that differ by a word or two test attention;
  a stem that withholds a step tests understanding. This also stops the length
  rule above from being satisfied the wrong way, by grinding three options into
  near-identical strings nobody can tell apart.

This is a static file, so it cannot pause for the reader's input and respond to
it. When the reader wants that fuller, interactive method, offer to run a live
exercise in conversation instead.
