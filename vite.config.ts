import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "vite-plus";
import type { Rolldown } from "vite-plus/pack";

const bundle = "skills/explain-diff-html/scripts/validate-output.js";

// The MIT, BSD-2-Clause, and ISC licenses of the inlined packages require their
// notices to travel with every copy, so the build writes them beside the bundle.
const thirdPartyLicenses: Rolldown.Plugin = {
  name: "third-party-licenses",
  generateBundle(_options, output) {
    const packageFolders = new Set<string>();
    for (const chunk of Object.values(output)) {
      if (chunk.type !== "chunk") continue;
      for (const id of chunk.moduleIds) {
        // The last node_modules/ in a path names the package a nested copy belongs to.
        const at = id.lastIndexOf("node_modules/");
        if (at === -1) continue;
        const end = at + "node_modules/".length;
        const parts = id.slice(end).split("/");
        const name = parts[0]?.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
        if (name) packageFolders.add(id.slice(0, end) + name);
      }
    }
    const notices = [...packageFolders].sort().map((folder) => {
      const { name, version, license } = JSON.parse(
        readFileSync(join(folder, "package.json"), "utf8"),
      ) as { name: string; version: string; license: string };
      const file = readdirSync(folder).find((entry) => /^licen[cs]e/i.test(entry));
      if (!file) throw new Error(`${name} has no LICENSE file to ship`);
      const text = readFileSync(join(folder, file), "utf8").trim();
      return `${name} ${version} (${license})\n\n${text}\n`;
    });
    this.emitFile({
      type: "asset",
      fileName: "THIRD-PARTY-LICENSES.txt",
      source: `validate-output.js includes these packages.\n\n${notices.join("\n")}`,
    });
  },
};

export default defineConfig({
  // The skill ships one file with its packages inlined, so an installed copy
  // needs no npm install and no registry access.
  pack: {
    entry: { "validate-output": "src/validate-output.ts" },
    outDir: "skills/explain-diff-html/scripts",
    clean: false,
    format: ["esm"],
    platform: "node",
    target: "node22.18",
    fixedExtension: false,
    // The bundle is always the entry point. On Node 20, import.meta.main is
    // undefined, and the bundle would exit 0 having checked nothing.
    define: { "import.meta.main": "true" },
    banner:
      "// Built from src/validate-output.ts by `npm run build`. Edit the source, not this file.\n// The licenses of the packages it includes are in THIRD-PARTY-LICENSES.txt.",
    plugins: [thirdPartyLicenses],
  },
  lint: {
    ignorePatterns: [bundle],
    options: { typeAware: true, typeCheck: true, denyWarnings: true },
  },
  // Format only TypeScript. The Markdown and HTML are prose and templates.
  fmt: {
    ignorePatterns: [bundle, "**/*.md", "**/*.html", "**/*.json", "**/*.yml"],
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
