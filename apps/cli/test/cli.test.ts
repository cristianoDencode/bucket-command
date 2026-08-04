import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { dataDirEnvName } from "@bucket-command/storage";
import { runCli } from "../src/index.js";

const tempDirs: string[] = [];

class MemoryWritable extends Writable {
  public output = "";

  public _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.output += chunk.toString();
    callback();
  }
}

const makeTempDir = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "bucket-command-cli-"));
  tempDirs.push(directory);
  return directory;
};

const run = async (
  dataDir: string,
  argv: string[],
  options: { input?: string; extraEnv?: NodeJS.ProcessEnv } = {}
): Promise<{ code: number; stdout: string; stderr: string }> => {
  const stdout = new MemoryWritable();
  const stderr = new MemoryWritable();
  const stdin = Readable.from([options.input ?? ""]);
  const code = await runCli({
    argv,
    env: {
      ...process.env,
      ...options.extraEnv,
      [dataDirEnvName]: dataDir
    },
    streams: {
      stdin,
      stdout,
      stderr
    }
  });

  return { code, stdout: stdout.output, stderr: stderr.output };
};

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("bucket-command CLI", () => {
  it("performs category and command CRUD with search, filters and raw alias recovery", async () => {
    const dataDir = makeTempDir();
    const multiline = "echo first\nprintf 'second\\n'";

    expect((await run(dataDir, ["category", "add", "--name", "bash", "--icon", "terminal"])).code).toBe(0);
    const categoryList = await run(dataDir, ["category", "list"]);
    expect(categoryList.stdout).toContain("bash");
    expect(categoryList.stdout).toContain("terminal");

    const tooLong = await run(dataDir, ["category", "add", "--name", "x".repeat(41)]);
    expect(tooLong.code).toBe(1);
    expect(tooLong.stderr).toContain("40 characters or fewer");

    const created = await run(dataDir, [
      "command",
      "add",
      "--title",
      "Multiline Bash",
      "--content",
      multiline,
      "--category",
      "bash",
      "--shell",
      "bash",
      "--alias",
      "multi",
      "--note",
      "prints two lines"
    ]);
    expect(created.code).toBe(0);
    expect(created.stdout).toContain("multi");

    const listed = await run(dataDir, ["command", "list", "--category", "BASH", "--shell", "bash"]);
    expect(listed.stdout).toContain("Multiline Bash");

    const searched = await run(dataDir, ["command", "search", "second"]);
    expect(searched.stdout).toContain("multi");

    const raw = await run(dataDir, ["command", "get", "MULTI", "--raw"]);
    expect(raw.stdout).toBe(multiline);

    const updated = await run(dataDir, ["command", "update", "multi", "--title", "Renamed", "--alias", "renamed"]);
    expect(updated.code).toBe(0);
    expect(updated.stdout).toContain("renamed");

    const shown = await run(dataDir, ["command", "show", "renamed"]);
    expect(shown.stdout).toContain("title: Renamed");
    expect(shown.stdout).toContain(multiline);

    expect((await run(dataDir, ["command", "delete", "renamed"])).code).toBe(0);
    expect((await run(dataDir, ["category", "delete", "bash"])).code).toBe(0);
  });

  it("keeps dangerous command content documental and rejects run/record actions", async () => {
    const dataDir = makeTempDir();
    const sentinel = join(dataDir, "sentinel.txt");
    const content = `printf touched > "$BUCKET_COMMAND_SENTINEL"`;

    await run(dataDir, ["category", "add", "--name", "bash"]);
    await run(dataDir, [
      "command",
      "add",
      "--title",
      "Dangerous",
      "--content",
      content,
      "--category",
      "bash",
      "--shell",
      "bash",
      "--alias",
      "danger"
    ]);

    const shown = await run(dataDir, ["command", "get", "danger"], {
      extraEnv: { BUCKET_COMMAND_SENTINEL: sentinel }
    });
    expect(shown.stdout).toContain(content);
    expect(existsSync(sentinel)).toBe(false);

    const runAttempt = await run(dataDir, ["command", "run", "danger", "--yes"], {
      extraEnv: { BUCKET_COMMAND_SENTINEL: sentinel }
    });
    expect(runAttempt.code).toBe(2);
    expect(runAttempt.stderr).toContain("Unknown command action.");
    expect(existsSync(sentinel)).toBe(false);

    const recordAttempt = await run(dataDir, [
      "command",
      "record",
      "-t",
      "Git status",
      "-c", "bash",
      "-s", "bash",
      "-a", "status",
      "--content", content
    ]);
    expect(recordAttempt.code).toBe(2);
    expect(recordAttempt.stderr).toContain("Unknown command action.");
    expect(existsSync(sentinel)).toBe(false);
    expect((await run(dataDir, ["command", "show", "status"])).code).toBe(1);
  });

  it("creates and shows command sequences only as documentation", async () => {
    const dataDir = makeTempDir();
    const sequenceFile = join(dataDir, "sequence.txt");

    await run(dataDir, ["category", "add", "--name", "bash"]);
    await run(dataDir, [
      "command",
      "add",
      "--title",
      "First",
      "--content",
      `printf first >> "$BUCKET_COMMAND_SEQUENCE_FILE"`,
      "--category",
      "bash",
      "--shell",
      "bash",
      "--alias",
      "first"
    ]);
    await run(dataDir, [
      "command",
      "add",
      "--title",
      "Second",
      "--content",
      `printf second >> "$BUCKET_COMMAND_SEQUENCE_FILE"`,
      "--category",
      "bash",
      "--shell",
      "bash",
      "--alias",
      "second"
    ]);

    const created = await run(dataDir, [
      "sequence",
      "add",
      "--title",
      "Both",
      "--category",
      "bash",
      "--shell",
      "bash",
      "--alias",
      "both",
      "--items",
      "first,second"
    ]);
    expect(created.code).toBe(0);
    expect(created.stdout).toContain("both");

    const shown = await run(dataDir, ["sequence", "show", "both"]);
    expect(shown.stdout).toContain("1. first");
    expect(shown.stdout).toContain("2. second");

    const runAttempt = await run(dataDir, ["command", "run", "both", "--yes"], {
      extraEnv: { BUCKET_COMMAND_SEQUENCE_FILE: sequenceFile }
    });
    expect(runAttempt.code).toBe(2);
    expect(runAttempt.stderr).toContain("Unknown command action.");
    expect(existsSync(sequenceFile)).toBe(false);
  });

  it("returns non-zero errors for missing aliases", async () => {
    const dataDir = makeTempDir();

    const missing = await run(dataDir, ["command", "show", "missing"]);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain("command alias was not found");
  });

  it("rejects shell shortcuts without mutating isolated profiles", async () => {
    const dataDir = makeTempDir();
    const home = makeTempDir();

    const installed = await run(dataDir, ["shortcuts", "install", "--shell", "all"], {
      extraEnv: { HOME: home }
    });

    expect(installed.code).toBe(2);
    expect(installed.stderr).toContain("Unknown resource 'shortcuts'.");
    expect(existsSync(join(home, ".bashrc"))).toBe(false);
    expect(existsSync(join(home, ".config", "powershell", "Microsoft.PowerShell_profile.ps1"))).toBe(false);
  });

  it("exports, imports and backs up the local library without executing stored content", async () => {
    const sourceDir = makeTempDir();
    const importedDir = makeTempDir();
    const backupDir = makeTempDir();
    const exportPath = join(makeTempDir(), "library.json");
    const multiline = "echo exported\nprintf 'still-documental\\n'";

    await run(sourceDir, ["category", "add", "--name", "bash", "--icon", "terminal"]);
    await run(sourceDir, [
      "command",
      "add",
      "--title",
      "Exported multiline",
      "--content",
      multiline,
      "--category",
      "bash",
      "--shell",
      "bash",
      "--alias",
      "exported",
      "--note",
      "portable note"
    ]);
    await run(sourceDir, [
      "command",
      "add",
      "--title",
      "Exported second",
      "--content",
      "echo second",
      "--category",
      "bash",
      "--shell",
      "bash",
      "--alias",
      "second"
    ]);
    await run(sourceDir, [
      "sequence",
      "add",
      "--title",
      "Exported sequence",
      "--category",
      "bash",
      "--shell",
      "bash",
      "--alias",
      "exported-sequence",
      "--items",
      "exported,second"
    ]);

    const exported = await run(sourceDir, ["library", "export", "--output", exportPath]);
    expect(exported.code).toBe(0);
    expect(exported.stdout).toContain("library exported");
    expect(existsSync(exportPath)).toBe(true);
    const json = JSON.parse(readFileSync(exportPath, "utf8")) as {
      format: string;
      version: number;
      categories: Array<{ iconKey: string | null }>;
      commands: unknown[];
    };
    expect(json.format).toBe("bucket-command-library");
    expect(json.version).toBe(1);
    expect(json.categories[0]?.iconKey).toBe("terminal");
    expect(json.commands).toHaveLength(2);

    const imported = await run(importedDir, ["library", "import", "--input", exportPath]);
    expect(imported.code).toBe(0);
    expect(imported.stdout).toContain("library imported");

    const raw = await run(importedDir, ["command", "get", "exported", "--raw"]);
    expect(raw.stdout).toBe(multiline);

    const searched = await run(importedDir, ["command", "search", "portable note"]);
    expect(searched.stdout).toContain("exported");

    const sequence = await run(importedDir, ["sequence", "show", "exported-sequence"]);
    expect(sequence.stdout).toContain("1. exported");
    expect(sequence.stdout).toContain("2. second");
    expect((await run(importedDir, ["category", "list"])).stdout).toContain("terminal");

    const conflicting = await run(importedDir, ["library", "import", "--input", exportPath]);
    expect(conflicting.code).toBe(1);
    expect(conflicting.stderr).toContain("already exists");
    expect((await run(importedDir, ["command", "list"])).stdout.split("Exported multiline")).toHaveLength(2);

    const backup = await run(sourceDir, ["library", "backup", "--output", backupDir]);
    expect(backup.code).toBe(0);
    expect(backup.stdout).toContain("library backup created");
    const backups = readdirSync(backupDir).filter((name) => name.startsWith("bucket-command-backup-") && name.endsWith(".json"));
    expect(backups).toHaveLength(1);

    const invalidIconPath = join(makeTempDir(), "invalid-icon.json");
    writeFileSync(invalidIconPath, JSON.stringify({ ...json, categories: [{ ...json.categories[0], iconKey: "sparkles" }] }), "utf8");
    const invalidIcon = await run(makeTempDir(), ["library", "import", "--input", invalidIconPath]);
    expect(invalidIcon.code).toBe(1);
    expect(invalidIcon.stderr).toContain("category.iconKey");
  });
});
