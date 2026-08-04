import type { Readable, Writable } from "node:stream";

export interface CliStreams {
  stdin: Readable;
  stdout: Writable;
  stderr: Writable;
}
