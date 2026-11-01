# Contributing

Thanks for your interest in contributing to explain-diff-html!

## Ways to contribute

- Report bugs or incorrect explanations
- Report a problem in a sample page
- Suggest improvements to the generated output
- Improve validation
- Improve documentation
- Submit fixes or enhancements

## Before opening a PR

If you're planning a change to the skill, please open an issue first so we can
discuss the approach.

Small fixes, such as typos and README edits, can be submitted directly as a pull
request.

## Sample pages

The skill generates the pages under `samples/`, and we regenerate them when the
skill changes. Please don't edit them by hand, and leave them out of your pull
request. If a sample is wrong, open an issue that names the page and the
problem.

## Pull requests

Please:

1. Keep the change focused.
2. Explain what problem the change addresses, and link the issue if there is
   one.
3. For changes to skill behavior or generated output, test the change on a real
   PR that exercises it.

   Install the skill from your checkout:

   ```sh
   npx skills add <path to your checkout> -g
   ```

   This replaces any installed copy. It copies the files, so run it again after
   each change. When you're done testing,
   `npx skills add malav2110/explain-diff-html -g` puts the released version
   back. The README's Requirements section lists the tools needed for a run.

   Then, from a checkout of the repository that owns the PR, ask the agent to
   explain it. The generated page will be written to `~/code-explanations/`.

   Include the PR you tested against in your pull request description, or
   describe it if its repository is private.

4. If you ran that test, validate the generated page from the root of your
   explain-diff-html checkout:

   ```sh
   node skills/explain-diff-html/scripts/validate-output.js <page> <short commit>
   ```

   The short commit is the one named at the top of the page. Fix what the script
   reports before you open your pull request.

## Changing the validator

The validator's source is `src/validate-output.ts`. The skill ships
`skills/explain-diff-html/scripts/validate-output.js`, a single file that
`npm run build` builds from the source with its dependencies inlined. The build
also writes their licenses to `THIRD-PARTY-LICENSES.txt` beside it. Commit the
source and both built files: CI fails when the built files do not match the
source. `scripts/package.json` exists only to mark the bundle as a JavaScript
module, so it loads in a project whose own `package.json` says CommonJS.

Working on the validator needs a Node version that Vite+ supports: 22.18 or
later on the 22 line, 24.11 or later on the 24 line, or 26 and later. Install
the dependencies, then run the checks CI runs:

```sh
npm ci
npm run build
npm run check
npm test
```

To add a regression case, add a page to `tests/validate-output/pass/` if every
check should pass, or to `tests/validate-output/fail/<check id>/` if that one
check should fail. Every link on a case page names the commit
`0123456789abcdef0123456789abcdef01234567`, except in `fail/full-sha/`, where a
link names it short or wrong on purpose.

AI-assisted pull requests are welcome. Check the code, the generated page, and
every claim in the PR body yourself before you open it.

## License

By contributing, you license your contributions under the MIT License, the same
license this project uses.

## Feedback

Real-world examples are especially useful. If the skill produces something
incorrect, unclear, or unnecessarily verbose, please open an issue with the
PR/repository you tested it against. If that repository is private, describe
the change instead of linking it.
