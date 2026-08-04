import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const projectRoot = resolve(process.cwd());
const releaseDir = join(projectRoot, "release");
const hasWhitespace = /\s/.test(projectRoot);

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: "inherit",
    shell: false
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const copyProjectToStage = (stageDir) => {
  rmSync(stageDir, { force: true, recursive: true });
  mkdirSync(stageDir, { recursive: true });

  cpSync(projectRoot, stageDir, {
    dereference: false,
    errorOnExist: false,
    force: true,
    preserveTimestamps: true,
    recursive: true,
    filter: (source) => {
      const relative = source.slice(projectRoot.length + 1);
      const firstPart = relative.split("/")[0];

      return ![
        ".git",
        ".ai",
        ".agents",
        ".codex",
        "release",
        "coverage",
        "playwright-report",
        "test-results"
      ].includes(firstPart);
    }
  });
};

run("npm", ["run", "build"], projectRoot);
rmSync(releaseDir, { force: true, recursive: true });
mkdirSync(releaseDir, { recursive: true });

if (!hasWhitespace) {
  run("electron-builder", ["--linux", "deb"], projectRoot);
  process.exit(0);
}

const stageDir = join(tmpdir(), `bucket-command-package-${process.pid}`);

console.log(`Packaging from temporary path without whitespace: ${stageDir}`);
copyProjectToStage(stageDir);
run(join(stageDir, "node_modules", ".bin", "electron-builder"), ["--linux", "deb"], stageDir);

const stageReleaseDir = join(stageDir, "release");
if (existsSync(stageReleaseDir)) {
  cpSync(stageReleaseDir, releaseDir, {
    force: true,
    recursive: true,
    filter: (source) => basename(source) !== "builder-debug.yml"
  });
}

rmSync(stageDir, { force: true, recursive: true });
