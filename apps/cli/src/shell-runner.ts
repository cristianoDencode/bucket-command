import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import type { Readable, Writable } from "node:stream";
import { createInterface } from "node:readline/promises";
import type { CommandRecord } from "@bucket-command/core";
import { formatCommandDetails } from "./output.js";

export interface CliStreams {
  stdin: Readable;
  stdout: Writable;
  stderr: Writable;
}

export interface ShellRunner {
  run(command: CommandRecord, streams: CliStreams): Promise<number>;
}

export class BashShellRunner implements ShellRunner {
  private readonly env: NodeJS.ProcessEnv;

  public constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = env;
  }

  public async run(command: CommandRecord, streams: CliStreams): Promise<number> {
    if (command.shellTarget !== "bash") {
      streams.stderr.write(`Shell target '${command.shellTarget}' is not available in the Linux CLI MVP.\n`);
      return 2;
    }

    try {
      await access("/bin/bash");
    } catch {
      streams.stderr.write("Shell 'bash' is not available.\n");
      return 2;
    }

    return new Promise<number>((resolve) => {
      const child = spawn("bash", ["-s"], {
        env: this.env,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"]
      });

      child.stdout.pipe(streams.stdout, { end: false });
      child.stderr.pipe(streams.stderr, { end: false });
      child.stdin.end(command.content);

      child.on("error", () => {
        streams.stderr.write("Shell 'bash' is not available.\n");
        resolve(2);
      });
      child.on("close", (code) => {
        resolve(code ?? 1);
      });
    });
  }
}

export const confirmRun = async (command: CommandRecord, streams: CliStreams): Promise<boolean> => {
  streams.stdout.write(`${formatCommandDetails(command)}\n\nRun this command? [y/N] `);

  const readline = createInterface({
    input: streams.stdin,
    output: streams.stdout,
    terminal: false
  });

  try {
    const answer = await readline.question("");
    return ["y", "yes"].includes(answer.trim().toLocaleLowerCase());
  } finally {
    readline.close();
  }
};
