// The command-line checks from step 7 of SKILL.md. What each check is, and why
// it exists, is in references/validation.md.
//
// Usage: node validate-output.ts <drafted page> <short commit>
//
// Run `npm ci --omit=dev` in this folder once first. Pass literal paths. A
// shell variable set in an earlier tool call is gone.
// Exits 0 when every pass/fail check passes, 1 when one fails, 2 on bad usage.

import { readFileSync, statSync } from "node:fs";
import { is, selectAll, selectOne } from "css-select";
import { isTag, isText, type AnyNode, type Document, type Element } from "domhandler";
import { getAttributeValue, textContent } from "domutils";
import { parse } from "parse5";
import { adapter } from "parse5-htmlparser2-tree-adapter";

export type Result =
  | { isFailed: false; message?: string }
  | { isFailed: true; message: string; findings: string[] };

export interface Page {
  document: Document;
  sha: string;
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
  return text !== "" && [...text].every((character) => characters.includes(character));
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
    !hostSuffixes.has(extension) &&
    lines.length <= 2 &&
    lines.every((line) => isMadeOf(line, digits))
  );
}

// L and digits, then the end or a character that cannot continue a word: #L9,
// #L3-L7, #L3-7, or #L3?plain=1 typed after the hash. #license is a heading anchor.
function isLineAnchor(hash: string): boolean {
  const fragment = hash.slice(1);
  let end = 1;
  while (digits.includes(fragment[end] ?? "_")) end += 1;
  const next = fragment[end];
  return (
    fragment[0]?.toLowerCase() === "l" &&
    end > 1 &&
    (next === undefined || !wordCharacters.includes(next))
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
    is<AnyNode, Element>(reference, ".srcref *") ||
    selectOne<AnyNode, Element>(".srcref", reference) !== null
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

// Text a reader sees: a <script> in the quiz holds option words a reader never reads.
function getVisibleText(node: AnyNode): string {
  if (isText(node)) return node.data;
  if (!isTag(node) || ["script", "style", "template"].includes(node.name)) return "";
  return node.children.map(getVisibleText).join(" ");
}

function getQuizText(document: Document): string {
  const quiz = selectOne<AnyNode, Element>("main #quiz", document);
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
    id: "quiz-present",
    run({ document }) {
      return getQuizText(document) === ""
        ? {
            isFailed: true,
            message: "no quiz section found, so the quiz checks read nothing",
            findings: [],
          }
        : { isFailed: false };
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
];

export function parsePage(html: string): Document {
  return parse(html, { treeAdapter: adapter });
}

export function validate(page: Page): { id: string; result: Result }[] {
  return checks.map((check) => ({ id: check.id, result: check.run(page) }));
}

function main(args: string[]): number {
  const [path, sha] = args;
  if (!path || !sha) {
    console.error("usage: node validate-output.ts <drafted page> <short commit>");
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
  const references = getReferences(document);
  const linked = selectAll<AnyNode, Element>(".srcref", document).length;
  const marked = references.filter(isMarkedBare).length;
  console.log(`references=${references.length} linked=${linked} marked-bare=${marked}`);

  let status = 0;
  for (const { result } of validate({ document, sha })) {
    if (result.isFailed) {
      console.log(`FAIL: ${result.message}`);
      for (const finding of result.findings) console.log(finding);
      status = 1;
    } else if (result.message) {
      console.log(`pass: ${result.message}`);
    }
  }

  console.log("advisory: ordinals in the quiz, read each one:");
  const ordinals = getOrdinalPhrases(getQuizText(document));
  console.log(ordinals.length === 0 ? "  none" : ordinals.join("\n"));

  return status;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
