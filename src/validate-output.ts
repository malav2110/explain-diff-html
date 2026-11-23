// The command-line checks from step 7 of SKILL.md. What each check is, and why
// it exists, is in references/validation.md.
//
// Usage: node validate-output.js <drafted page> <short commit> [<work directory>]
//
// The skill ships this file bundled as scripts/validate-output.js; `npm run
// build` rebuilds it. Pass literal paths. A shell variable set in an earlier
// tool call is gone. The coverage check needs the work directory, which holds
// diff.txt.
// Exits 0 when every pass/fail check passes, 1 when one fails, 2 on bad usage.

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { is, selectAll, selectOne } from "css-select";
import { isTag, isText, type AnyNode, type Document, type Element } from "domhandler";
import { getAttributeValue, textContent } from "domutils";
import { parse } from "parse5";
import { adapter } from "parse5-htmlparser2-tree-adapter";

export type Result =
  | { isFailed: false; isSkipped?: boolean; message?: string }
  | { isFailed: true; message: string; findings: string[] };

// The work directory's diff.txt. Its text is empty when the file is missing.
export interface Diff {
  path: string;
  text: string;
}

export interface Page {
  document: Document;
  sha: string;
  diff?: Diff;
}

export interface Check {
  id: string;
  run(page: Page): Result;
}

const digits = "0123456789";
const hexDigits = "0123456789abcdef";
const letters = "abcdefghijklmnopqrstuvwxyz";
const alphanumerics = letters + letters.toUpperCase() + digits;
const wordCharacters = alphanumerics + "_";
const pathCharacters = wordCharacters + "./-";
const hostSuffixes = new Set([
  "com",
  "org",
  "net",
  "io",
  "dev",
  "app",
  "local",
  "internal",
  "localhost",
]);

function isMadeOf(text: string, characters: string): boolean {
  return text !== "" && Array.from(text).every((character) => characters.includes(character));
}

// A reference starts with path.ext:line or path.ext:line-line, then a space, a
// comma, or the end. A host:port such as example.com:8080 looks the same, so
// drop common top-level domains.
function isReferenceText(text: string): boolean {
  const token = text.split(" ")[0]?.split(",")[0] ?? "";
  const colon = token.lastIndexOf(":");
  const path = token.slice(0, colon);
  const dot = path.lastIndexOf(".");
  const extension = path.slice(dot + 1);
  const lines = token.slice(colon + 1).split("-");
  return (
    dot > 0 &&
    isMadeOf(path, pathCharacters) &&
    isMadeOf(extension, alphanumerics) &&
    isMadeOf(extension.slice(0, 1), letters + letters.toUpperCase()) &&
    !hostSuffixes.has(extension) &&
    lines.length <= 2 &&
    lines.every((line) => isMadeOf(line, digits))
  );
}

// L and digits, then the end, C and a column, or a character that cannot
// continue a word: #L9, #L3-L7, #L3-7, #L3C5-L4C9, or #L3?plain=1 typed after the
// hash. #license and #l1cache are heading anchors.
function isLineAnchor(hash: string): boolean {
  const fragment = hash.slice(1);
  let end = 1;
  while (digits.includes(fragment[end] ?? "_")) end += 1;
  const next = fragment[end];
  return (
    fragment[0]?.toLowerCase() === "l" &&
    end > 1 &&
    (next === undefined ||
      (next.toLowerCase() === "c" && digits.includes(fragment[end + 1] ?? "_")) ||
      !wordCharacters.includes(next))
  );
}

// HTML wraps freely, so compare and print text with its whitespace collapsed.
function getText(node: AnyNode): string {
  return textContent(node).replace(/\s+/g, " ").trim();
}

function getReferences(document: Document): Element[] {
  return selectAll<AnyNode, Element>("code, .filename", document).filter((node) => {
    // A label that wraps a reference <code> is counted through that <code>, not twice.
    const isLabelAroundReference =
      is<AnyNode, Element>(node, ".filename") &&
      selectAll<AnyNode, Element>("code", node).some((code) => isReferenceText(getText(code)));
    return !isLabelAroundReference && isReferenceText(getText(node));
  });
}

function isMarkedBare(reference: Element): boolean {
  return is<AnyNode, Element>(reference, "[data-bare], .filename[data-bare] code");
}

function isLinked(reference: Element): boolean {
  return (
    is<AnyNode, Element>(reference, "a.srcref *") ||
    selectOne<AnyNode, Element>("a.srcref", reference) !== null
  );
}

// A relative href resolves against github.com, so its path is checked too.
function parseHref(href: string): URL | null {
  return URL.parse(href, "https://github.com");
}

function getBlobHrefs(document: Document): string[] {
  return selectAll<AnyNode, Element>('[href*="/blob/"]', document).map(
    (node) => getAttributeValue(node, "href") ?? "",
  );
}

// Elements whose text a reader never reads.
const hiddenTags = new Set(["script", "style", "template"]);

// Text a reader sees: a <script> in the quiz holds option words a reader never reads.
function getVisibleText(node: AnyNode): string {
  if (isText(node)) return node.data;
  if (!isTag(node) || hiddenTags.has(node.name)) return "";
  return node.children.map(getVisibleText).join(" ");
}

// A missing quiz is quiz-present's failure, so quiz-count and
// quiz-longest-option pass silently without one.
function getQuiz(document: Document): Element | null {
  return selectOne<AnyNode, Element>("main #quiz", document);
}

function getQuizQuestions(quiz: Element): Element[] {
  return selectAll<AnyNode, Element>(".quiz-question", quiz);
}

function getQuizText(document: Document): string {
  const quiz = getQuiz(document);
  return quiz ? getVisibleText(quiz).replace(/\s+/g, " ").trim() : "";
}

interface Word {
  text: string;
  start: number;
  end: number;
}

const wordSegmenter = new Intl.Segmenter("en", { granularity: "word" });
const positions = new Set(["first", "second", "third", "last"]);
const pairPositions = new Set(["former", "latter"]);

// The segmenter keeps a possessive whole, so "option's" ends before its 's.
function getWords(text: string): Word[] {
  return [...wordSegmenter.segment(text)]
    .filter((segment) => segment.isWordLike)
    .map(({ segment, index }) => {
      const lower = segment.toLowerCase();
      const word = lower.endsWith("'s") || lower.endsWith("’s") ? lower.slice(0, -2) : lower;
      return { text: word, start: index, end: index + word.length };
    });
}

function isNextWord(text: string, word: Word, next: Word | undefined): next is Word {
  return next !== undefined && text.slice(word.end, next.start) === " ";
}

// "the first option" or "the latter": a phrase that names a quiz option by position.
function getPositionalPhrases(text: string): string[] {
  const words = getWords(text);
  const phrases: string[] = [];
  for (const [index, the] of words.entries()) {
    const position = words[index + 1];
    const option = words[index + 2];
    if (the.text !== "the" || !isNextWord(text, the, position)) continue;
    if (pairPositions.has(position.text)) {
      phrases.push(text.slice(the.start, position.end));
    } else if (
      positions.has(position.text) &&
      isNextWord(text, position, option) &&
      (option.text === "option" || option.text === "options")
    ) {
      phrases.push(text.slice(the.start, option.end));
    }
  }
  return phrases;
}

// Every "the <ordinal>", with up to 40 characters of its sentence after it.
function getOrdinalPhrases(text: string): string[] {
  const words = getWords(text);
  const phrases: string[] = [];
  let previousEnd = 0;
  for (const [index, the] of words.entries()) {
    const ordinal = words[index + 1];
    if (the.start < previousEnd || the.text !== "the" || !isNextWord(text, the, ordinal)) continue;
    if (!positions.has(ordinal.text) && !pairPositions.has(ordinal.text)) continue;
    const period = text.indexOf(".", ordinal.end);
    previousEnd = Math.min(ordinal.end + 40, period === -1 ? text.length : period);
    phrases.push(text.slice(the.start, previousEnd));
  }
  return phrases;
}

// A <code> span reads as one word, because `os.Path` carries a dot that ends nothing.
function getSentenceText(node: AnyNode): string {
  if (isText(node)) return node.data;
  if (!isTag(node)) return "";
  if (node.name === "code") return "CODE";
  return node.children.map(getSentenceText).join(" ");
}

function getSentence(node: AnyNode): string {
  return getSentenceText(node).replace(/\s+/g, " ").trim();
}

const abbreviations = ["e.g", "i.e", "vs", "etc"];

// A period, "!", or "?", then any closing quotes or brackets, a space, and a
// capital letter starts a second sentence.
function hasSecondSentence(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? "";
    if (!".!?".includes(character)) continue;
    const before = text.slice(0, index);
    const isAbbreviation = abbreviations.some((word) => {
      if (!before.endsWith(word)) return false;
      const preceding = before.at(-word.length - 1);
      return preceding === undefined || !wordCharacters.includes(preceding);
    });
    if (character === "." && isAbbreviation) continue;
    let next = index + 1;
    while (isMadeOf(text[next] ?? "", `"')`)) next += 1;
    if (text[next] === " " && isMadeOf(text[next + 1] ?? "", letters.toUpperCase())) return true;
  }
  return false;
}

// A word is any run between spaces that holds a letter or a digit, so a lone
// "→" counts as nothing.
function countWords(text: string): number {
  return text
    .split(/\s+/)
    .filter((token) => Array.from(token).some((character) => alphanumerics.includes(character)))
    .length;
}

// A question's correct option is the longest when it has more words than every other option.
function isCorrectLongest(question: Element): boolean {
  let correct = -1;
  let other = -1;
  for (const option of selectAll<AnyNode, Element>("button", question)) {
    const words = countWords(getVisibleText(option));
    if (getAttributeValue(option, "data-correct") !== undefined) correct = words;
    else other = Math.max(other, words);
  }
  return correct > other;
}

// The reason is the last cell of each "Also changed" row.
function getTableReasons(document: Document): string[] {
  return selectAll<AnyNode, Element>("table.also-changed tr", document).flatMap((row) => {
    const reason = selectAll<AnyNode, Element>("td", row).at(-1);
    return reason ? [getSentence(reason)] : [];
  });
}

const escapes: Record<string, number> = { t: 9, n: 10, '"': 34, "\\": 92 };

// Git quotes a path that holds a non-ASCII or control character. It names
// \a \b \t \n \v \f \r, \", and \\, and writes other bytes in octal, so café.py
// arrives as caf\303\251.py. Only the escapes in the table decode, and the rest
// read as letters. A path holding \v, \f, or \r fails coverage either way,
// because the page text collapses whitespace.
function unquotePath(quoted: string): string {
  const encoder = new TextEncoder();
  const bytes: number[] = [];
  for (let index = 0; index < quoted.length; index += 1) {
    const character = quoted[index] ?? "";
    const octal = quoted.slice(index + 1, index + 4);
    const next = quoted[index + 1] ?? "";
    if (character !== "\\") {
      bytes.push(...encoder.encode(character));
    } else if (octal.length === 3 && isMadeOf(octal, "01234567")) {
      bytes.push(Number.parseInt(octal, 8));
      index += 3;
    } else {
      bytes.push(escapes[next] ?? next.charCodeAt(0));
      index += 1;
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

// A binary file has no +++ line, so the paths come from the diff --git headers.
function getChangedPaths(diff: string): string[] {
  return diff.split("\n").flatMap((line) => {
    if (!line.startsWith("diff --git ")) return [];
    const isQuoted = line.endsWith('"');
    const marker = isQuoted ? ' "b/' : " b/";
    // A file that is not renamed fills both halves of the header, so the first
    // half is its path even when the path holds " b/".
    const rest = line.slice("diff --git a/".length);
    const half = (rest.length - marker.length) / 2;
    if (!isQuoted && rest.slice(half) === `${marker}${rest.slice(0, half)}`) {
      return [rest.slice(0, half)];
    }
    const start = line.lastIndexOf(marker);
    if (start === -1) return [];
    const path = line.slice(start + marker.length, isQuoted ? -1 : undefined);
    return [isQuoted ? unquotePath(path) : path];
  });
}

// Text a reader sees outside the failed-check banner, so a path the banner
// names does not count as covered.
function getPageText(node: AnyNode): string {
  if (isTag(node) && is<AnyNode, Element>(node, ".check-banner")) return "";
  if (!isTag(node) || hiddenTags.has(node.name)) {
    return getVisibleText(node);
  }
  return node.children.map(getPageText).join(" ");
}

// A token without its :line suffix, trailing punctuation, or leading
// parentheses, so prose such as "(src/a.py:9)," names src/a.py.
function getBarePath(token: string): string {
  let end = token.length;
  for (let index = 0; index < token.length; index += 1) {
    if (token[index] === ":" && isMadeOf(token[index + 1] ?? "", digits)) {
      end = index;
      break;
    }
  }
  let bare = token.slice(0, end);
  while (isMadeOf(bare.at(-1) ?? "", ",.;:)")) bare = bare.slice(0, -1);
  while (bare.startsWith("(")) bare = bare.slice(1);
  return bare;
}

// Each token as written and as a bare path. The written copy keeps a path that
// starts with a parenthesis, such as (auth)/a.tsx, which getBarePath would strip.
function getTokens(text: string): Set<string> {
  const tokens = text.split(/\s+/).filter((token) => token !== "");
  return new Set(tokens.flatMap((token) => [token, getBarePath(token)]));
}

// A directory row names a parent directory with a trailing slash.
function isTableRow(path: string, tableTokens: Set<string>): boolean {
  const parts = path.split("/");
  return (
    tableTokens.has(path) ||
    parts.slice(1).some((_, index) => tableTokens.has(`${parts.slice(0, index + 1).join("/")}/`))
  );
}

interface Coverage {
  tableCount: number;
  missing: string[];
}

// Only the table's first column covers a file, because a reason such as "same
// fix as src/" must not cover anything. A path with a space never survives
// tokenizing, so it matches as text.
function getCoverage(document: Document, paths: string[]): Coverage {
  const body = selectOne<AnyNode, Element>("body", document);
  const pageText = body ? getPageText(body).replace(/\s+/g, " ") : "";
  const pageTokens = getTokens(pageText);
  const firstColumn = selectAll<AnyNode, Element>("table.also-changed tr", document)
    .flatMap((row) => selectAll<AnyNode, Element>("td", row).slice(0, 1))
    .map(getText)
    .join(" ");
  const tableTokens = getTokens(firstColumn);
  let tableCount = 0;
  const missing: string[] = [];
  for (const path of paths) {
    const hasSpace = path.includes(" ");
    const isNamedAsText = hasSpace && pageText.includes(path);
    if (hasSpace && firstColumn.includes(path)) tableCount += 1;
    else if (!isNamedAsText && isTableRow(path, tableTokens)) tableCount += 1;
    else if (!isNamedAsText && !pageTokens.has(path)) missing.push(path);
  }
  return { tableCount, missing };
}

// Prose a reader reads: a <pre> is code, not words.
function getProseText(node: AnyNode): string {
  if (isTag(node) && node.name === "pre") return "";
  if (!isTag(node) || hiddenTags.has(node.name)) {
    return getVisibleText(node);
  }
  return node.children.map(getProseText).join(" ");
}

interface SectionWords {
  id: string;
  words: number;
}

// Words per section, for the step 8 report and the SKILL.md rule that
// Background runs no longer than the Code walkthrough.
function getSectionWords(document: Document): SectionWords[] {
  return selectAll<AnyNode, Element>("section[id]", document).map((section) => ({
    id: getAttributeValue(section, "id") ?? "",
    words: countWords(getProseText(section)),
  }));
}

function getWordsLine(counts: SectionWords[]): string {
  const total = counts.reduce((sum, { words }) => sum + words, 0);
  const sections = counts.map(({ id, words }) => `${id} ${words}`);
  return `words: ${[...sections, `total ${total}`].join("  ")}`;
}

// 0 when Background is no longer than Code, or when either section is absent.
function getBackgroundExcess(counts: SectionWords[]): number {
  const getWords = (id: string) => counts.find((count) => count.id === id)?.words;
  const background = getWords("background");
  const code = getWords("code");
  if (background === undefined || code === undefined) return 0;
  return Math.max(0, background - code);
}

// The "N of M" inside "Every other changed file (N of M)".
function getCaptionCount(table: Element): string | undefined {
  const label = "Every other changed file (";
  const text = getText(table);
  const start = text.indexOf(label);
  const end = text.indexOf(")", start);
  return start === -1 || end === -1 ? undefined : text.slice(start + label.length, end).trim();
}

export const checks: Check[] = [
  {
    id: "unlinked-reference",
    run({ document }) {
      const provenance = selectOne<AnyNode, Element>(".provenance", document);
      if (provenance && getText(provenance).includes("References are not linked")) {
        return { isFailed: false, message: "provenance says references are not linked" };
      }
      const unlinked = getReferences(document).filter(
        (reference) => !isLinked(reference) && !isMarkedBare(reference),
      );
      if (unlinked.length === 0) {
        return { isFailed: false, message: "every reference is linked or marked data-bare" };
      }
      return {
        isFailed: true,
        message: `${unlinked.length} references are neither linked nor marked data-bare`,
        findings: unlinked.map(getText),
      };
    },
  },
  {
    // GitHub resolves an abbreviation only while the commit is on a branch, so a
    // short sha 404s once a squash merge lands.
    id: "full-sha",
    run({ document, sha }) {
      const wrongHrefs = getBlobHrefs(document).filter((href) => {
        const pathname = parseHref(href)?.pathname ?? "";
        const commit = pathname.split("/blob/")[1]?.split("/")[0] ?? "";
        return !(commit.length === 40 && isMadeOf(commit, hexDigits) && commit.startsWith(sha));
      });
      return wrongHrefs.length === 0
        ? { isFailed: false, message: `every blob link names the full sha of ${sha}` }
        : {
            isFailed: true,
            message: `links that do not name the full 40-character sha starting ${sha}:`,
            findings: wrongHrefs.map((href) => `href="${href}"`),
          };
    },
  },
  {
    // GitHub renders Markdown, and the rendered view ignores a line anchor.
    id: "markdown-plain",
    run({ document }) {
      const bareHrefs = getBlobHrefs(document).filter((href) => {
        const url = parseHref(href);
        if (!url) return false;
        const pathname = url.pathname.toLowerCase();
        const isMarkdown = pathname.endsWith(".md") || pathname.endsWith(".markdown");
        const hasLineAnchor = isLineAnchor(url.hash);
        return isMarkdown && hasLineAnchor && url.searchParams.get("plain") !== "1";
      });
      return bareHrefs.length === 0
        ? { isFailed: false, message: "every Markdown line link carries ?plain=1" }
        : {
            isFailed: true,
            message: "Markdown links with a line anchor and no ?plain=1:",
            findings: bareHrefs.map((href) => `href="${href}"`),
          };
    },
  },
  {
    id: "coverage",
    run({ document, diff }) {
      if (!diff) {
        return { isFailed: false, isSkipped: true, message: "coverage, no work directory given" };
      }
      if (diff.text === "") {
        return { isFailed: true, message: `${diff.path} is missing or empty`, findings: [] };
      }
      const paths = getChangedPaths(diff.text);
      if (paths.length === 0) {
        return { isFailed: true, message: `${diff.path} has no diff --git headers`, findings: [] };
      }
      const { missing } = getCoverage(document, paths);
      return missing.length === 0
        ? { isFailed: false, message: `all ${paths.length} changed files appear on the page` }
        : { isFailed: true, message: "changed files the page never names:", findings: missing };
    },
  },
  {
    id: "table-caption",
    run({ document, diff }) {
      const table = selectOne<AnyNode, Element>("table.also-changed", document);
      if (!diff || diff.text === "" || !table) return { isFailed: false };
      const paths = getChangedPaths(diff.text);
      const expected = `${getCoverage(document, paths).tableCount} of ${paths.length}`;
      const count = getCaptionCount(table);
      const caption = count === undefined ? "no caption" : `Every other changed file (${count})`;
      return count === expected
        ? { isFailed: false, message: `table caption counts ${expected}` }
        : {
            isFailed: true,
            message: `table caption reads '${caption}', expected (${expected})`,
            findings: [],
          };
    },
  },
  {
    id: "quiz-present",
    run({ document }) {
      return getQuizText(document) === ""
        ? {
            isFailed: true,
            message: "no quiz section found, so the quiz checks read nothing",
            findings: [],
          }
        : { isFailed: false, message: "quiz section found" };
    },
  },
  {
    id: "quiz-positional",
    run({ document }) {
      const positionalPhrases = getPositionalPhrases(getQuizText(document));
      return positionalPhrases.length === 0
        ? { isFailed: false, message: "no quiz option named by position" }
        : {
            isFailed: true,
            message: "quiz text names an option by position:",
            findings: positionalPhrases,
          };
    },
  },
  {
    id: "quiz-count",
    run({ document }) {
      const quiz = getQuiz(document);
      if (!quiz) return { isFailed: false };
      // A large change walks themes, so a theme's core edits set the size.
      const edits = selectAll<AnyNode, Element>("h4.core-edit", document).length;
      const coreCount =
        edits > 0 ? edits : selectAll<AnyNode, Element>("h3.core-step", document).length;
      const coreLabel = edits > 0 ? "core edits" : "core steps";
      const asked = getQuizQuestions(quiz).length;
      const expected = coreCount <= 2 ? 3 : 5;
      const declared = getAttributeValue(quiz, "data-quiz-count");
      if (declared !== undefined && !isMadeOf(declared, digits)) {
        return {
          isFailed: true,
          message: `data-quiz-count is '${declared}', not a number of questions`,
          findings: [],
        };
      }
      if (declared === undefined) {
        return asked === expected
          ? { isFailed: false, message: `${asked} questions for ${coreCount} ${coreLabel}` }
          : {
              isFailed: true,
              message: `${asked} questions for ${coreCount} ${coreLabel}, expected ${expected}`,
              findings: [],
            };
      }
      const count = Number(declared);
      const reason = getAttributeValue(quiz, "data-quiz-reason") ?? "";
      const isDeclaredCountValid =
        count >= 1 &&
        count <= expected &&
        asked === count &&
        reason !== "" &&
        !reason.includes("FILL");
      return isDeclaredCountValid
        ? { isFailed: false, message: `${asked} questions, the declared count, because: ${reason}` }
        : {
            isFailed: true,
            message: `${asked} questions, declared ${count} of at most ${expected}, reason '${reason}'`,
            findings: [],
          };
    },
  },
  {
    // Someone who has not understood picks the longest option, so it may be the
    // correct one only as often as chance allows.
    id: "quiz-longest-option",
    run({ document }) {
      const quiz = getQuiz(document);
      if (!quiz) return { isFailed: false };
      const questions = getQuizQuestions(quiz);
      const longest = questions.filter(isCorrectLongest).length;
      const allowed = questions.length >= 5 ? 2 : 1;
      const counts = `${longest} of ${questions.length} questions`;
      return longest <= allowed
        ? { isFailed: false, message: `the longest option is correct in ${counts}` }
        : {
            isFailed: true,
            message: `the longest option is correct in ${counts}, at most ${allowed} allowed`,
            findings: [],
          };
    },
  },
  {
    id: "lead-sentence",
    run({ document }) {
      const lead = selectOne<AnyNode, Element>("p.lead", document);
      const sentence = lead ? getSentence(lead) : "";
      if (sentence === "") {
        return { isFailed: true, message: "the page has no p.lead sentence", findings: [] };
      }
      return hasSecondSentence(sentence)
        ? { isFailed: true, message: "p.lead runs past one sentence:", findings: [sentence] }
        : { isFailed: false, message: "p.lead is one sentence" };
    },
  },
  {
    id: "table-reason-sentence",
    run({ document }) {
      const reasons = getTableReasons(document);
      if (reasons.length === 0) return { isFailed: false };
      const longReasons = reasons.filter(hasSecondSentence);
      return longReasons.length === 0
        ? { isFailed: false, message: "every table reason is one sentence" }
        : {
            isFailed: true,
            message: "table reasons that run past one sentence:",
            findings: longReasons,
          };
    },
  },
  {
    // A page names the checks it could not fix in the banner, and drops the
    // banner once they pass.
    id: "check-banner",
    run(page) {
      const banner = selectOne<AnyNode, Element>(".check-banner", page.document);
      if (!banner) return { isFailed: false };
      if (getText(banner).replace("Failed checks:", "").trim() === "") {
        return { isFailed: true, message: "the check banner names no check", findings: [] };
      }
      const isAnyCheckFailed = checks.some(
        (check) => check.id !== "check-banner" && check.run(page).isFailed,
      );
      return isAnyCheckFailed
        ? { isFailed: false, message: "the check banner names the failed checks" }
        : {
            isFailed: true,
            message: "the check banner is still on a page whose checks pass",
            findings: [],
          };
    },
  },
];

export function parsePage(html: string): Document {
  return parse(html, { treeAdapter: adapter });
}

export function validate(page: Page): { id: string; result: Result }[] {
  return checks.map((check) => ({ id: check.id, result: check.run(page) }));
}

export function readDiff(work: string): Diff {
  const path = join(work, "diff.txt");
  const stats = statSync(path, { throwIfNoEntry: false });
  return { path, text: stats?.isFile() ? readFileSync(path, "utf8") : "" };
}

function main(args: string[]): number {
  const [path, sha, work] = args;
  if (!path || !sha) {
    console.error(
      "usage: node validate-output.js <drafted page> <short commit> [<work directory>]",
    );
    return 2;
  }
  if (sha.length < 4 || sha.length > 40 || !isMadeOf(sha, hexDigits)) {
    console.error("usage: <short commit> must be 4 to 40 lowercase hex characters");
    return 2;
  }
  // A directory is not a page, and step 8's $out is a directory.
  const stats = statSync(path, { throwIfNoEntry: false });
  if (!stats?.isFile() || stats.size === 0) {
    console.error(`FAIL: ${path} is not a non-empty file`);
    return 1;
  }

  const document = parsePage(readFileSync(path, "utf8"));
  const sectionWords = getSectionWords(document);
  console.log(getWordsLine(sectionWords));
  const references = getReferences(document);
  const linked = selectAll<AnyNode, Element>("a.srcref", document).length;
  const marked = references.filter(isMarkedBare).length;
  console.log(`references=${references.length} linked=${linked} marked-bare=${marked}`);

  let status = 0;
  const diff = work ? readDiff(work) : undefined;
  for (const { result } of validate({ document, sha, diff })) {
    if (result.isFailed) {
      console.log(`FAIL: ${result.message}`);
      for (const finding of result.findings) console.log(finding);
      status = 1;
    } else if (result.message) {
      console.log(`${result.isSkipped ? "skip" : "pass"}: ${result.message}`);
    }
  }

  console.log("advisory: ordinals in the quiz, read each one:");
  const ordinals = getOrdinalPhrases(getQuizText(document));
  console.log(ordinals.length === 0 ? "  none" : ordinals.join("\n"));

  const excess = getBackgroundExcess(sectionWords);
  if (excess > 0) {
    const words = excess === 1 ? "word" : "words";
    console.log(`advisory: Background runs ${excess} ${words} past Code; report how many and why`);
  }

  return status;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
