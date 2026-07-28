import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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

    expect((await run(dataDir, ["category", "add", "--name", "bash"])).code).toBe(0);
    const categoryList = await run(dataDir, ["category", "list"]);
    expect(categoryList.stdout).toContain("bash");

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

  it("does not execute command content during retrieval and respects cancellation", async () => {
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

    const cancelled = await run(dataDir, ["command", "run", "danger"], {
      input: "n\n",
      extraEnv: { BUCKET_COMMAND_SENTINEL: sentinel }
    });
    expect(cancelled.code).toBe(130);
    expect(cancelled.stderr).toContain("Run cancelled.");
    expect(existsSync(sentinel)).toBe(false);
  });

  it("runs Bash only with explicit --yes and preserves the shell exit code", async () => {
    const dataDir = makeTempDir();
    const sentinel = join(dataDir, "run.txt");

    await run(dataDir, ["category", "add", "--name", "bash"]);
    await run(dataDir, [
      "command",
      "add",
      "--title",
      "Exit seven",
      "--content",
      `printf run > "$BUCKET_COMMAND_SENTINEL"\nexit 7`,
      "--category",
      "bash",
      "--shell",
      "bash",
      "--alias",
      "exit-seven"
    ]);

    const executed = await run(dataDir, ["command", "run", "exit-seven", "--yes"], {
      extraEnv: { BUCKET_COMMAND_SENTINEL: sentinel }
    });

    expect(executed.code).toBe(7);
    expect(readFileSync(sentinel, "utf8")).toBe("run");
  });

  it("returns non-zero errors for missing aliases and unavailable shell targets", async () => {
    const dataDir = makeTempDir();

    const missing = await run(dataDir, ["command", "show", "missing"]);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain("command alias was not found");

    await run(dataDir, ["category", "add", "--name", "scripts"]);
    await run(dataDir, [
      "command",
      "add",
      "--title",
      "PowerShell script",
      "--content",
      "Write-Output ok",
      "--category",
      "scripts",
      "--shell",
      "powershell",
      "--alias",
      "ps"
    ]);

    const unavailable = await run(dataDir, ["command", "run", "ps", "--yes"]);
    expect(unavailable.code).toBe(2);
    expect(unavailable.stderr).toContain("not available");
  });
});
