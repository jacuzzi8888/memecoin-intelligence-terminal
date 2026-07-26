import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const TEST_FILE_PATTERN = /\.(test|spec)\.[cm]?[jt]sx?$/;
const SEARCH_ROOTS = ["src", "test", "tests"];
const IGNORED_DIRS = new Set(["node_modules", "dist", ".next", ".turbo", "coverage"]);

function hasTestFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      if (hasTestFiles(join(dir, entry.name))) return true;
      continue;
    }

    if (entry.isFile() && TEST_FILE_PATTERN.test(entry.name)) {
      return true;
    }
  }

  return false;
}

const rootsToSearch = SEARCH_ROOTS
  .map((name) => join(process.cwd(), name))
  .filter((dir) => {
    try {
      return statSync(dir).isDirectory();
    } catch {
      return false;
    }
  });

const foundTests = rootsToSearch.some((dir) => hasTestFiles(dir));

if (!foundTests) {
  console.log("No test files found; skipping Vitest.");
  process.exit(0);
}

const result = spawnSync("pnpm", ["exec", "vitest", "run", "--passWithNoTests", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
