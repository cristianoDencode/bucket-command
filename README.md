# Bucket Command

Bucket Command is a local command library for developers. It lets you save, categorize, search, copy, and reuse shell commands from a terminal CLI or a desktop dashboard.

Commands are stored in a local SQLite database. Retrieval is safe by default: listing, searching, showing, and copying commands never execute shell content. Execution only happens through the explicit `command run <alias>` CLI command.

## Features

- Save commands with title, content, category, shell target, optional alias, and optional notes.
- Organize commands into categories.
- Search commands by title, alias, content, or notes.
- Filter commands by category and shell target.
- Retrieve only the raw command text for shell composition.
- Run Bash commands explicitly from the CLI with confirmation.
- Manage the same command library from an Electron desktop dashboard.
- Copy stored command content from the dashboard.
- Store data locally with SQLite.

## Current Status

This is an MVP focused on Linux and Bash.

The architecture keeps Windows and PowerShell support in mind, but PowerShell execution and Windows packaging are not validated yet.

## Requirements

- Linux
- Node.js `22` or newer
- npm

## Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/cristianoDencode/bucket-command.git
cd bucket-command
npm install
npm run build
```

During local development, the CLI is available through:

```bash
node_modules/.bin/bucket-command help
```

To make `bucket-command` available as a command in your shell while working locally:

```bash
npm link
bucket-command help
```

To remove the local global link later:

```bash
npm unlink -g bucket-command
```

## CLI Usage

Create a category:

```bash
bucket-command category add --name git
```

Save a command:

```bash
bucket-command command add \
  --title "Git status" \
  --content "git status" \
  --category git \
  --shell bash \
  --alias gst \
  --note "Show the working tree status"
```

Show a stored command without executing it:

```bash
bucket-command command show gst
```

Print only the command text:

```bash
bucket-command command get gst --raw
```

Run a command explicitly:

```bash
bucket-command command run gst
```

Run without the confirmation prompt:

```bash
bucket-command command run gst --yes
```

Search commands:

```bash
bucket-command command search git
```

Filter commands:

```bash
bucket-command command list --category git --shell bash
```

## Desktop Dashboard

Start the Electron dashboard:

```bash
npm run desktop:start
```

The dashboard uses the same local SQLite database as the CLI, so commands created in one interface appear in the other.

## Data Storage

Bucket Command stores data in the user data directory for the current operating system.

For isolated development or tests, set:

```bash
BUCKET_COMMAND_DATA_DIR=/tmp/bucket-command-dev bucket-command command list
```

The dashboard can use the same override:

```bash
BUCKET_COMMAND_DATA_DIR=/tmp/bucket-command-dev npm run desktop:start
```

## Architecture

```text
apps/cli -----------\
                    > packages/core -> packages/storage -> SQLite
apps/desktop -------/
     renderer -> preload -> main -> core
```

### Packages

- `packages/core`: domain entities, validation, errors, and use cases.
- `packages/storage`: SQLite schema, migrations, data path resolution, and storage adapter.
- `apps/cli`: Node.js command-line interface.
- `apps/desktop`: Electron, React, and Vite desktop dashboard.

### Security Model

- Stored command content is treated as text unless `command run <alias>` is used.
- `get`, `show`, `list`, `search`, and dashboard copy actions do not execute shell commands.
- The dashboard does not expose command execution.
- Electron uses `contextIsolation`, renderer sandboxing, and a narrow preload API.
- The renderer has no direct access to Node.js, SQLite, or shell execution.

## Development

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Run lint:

```bash
npm run lint
```

Run TypeScript checks:

```bash
npm run typecheck
```

Build all packages:

```bash
npm run build
```

Run the dashboard E2E flow:

```bash
npm run e2e
```

## Notes

- `npm run desktop:start` removes `ELECTRON_RUN_AS_NODE` for local Electron runs because some development environments set it automatically.
- The script uses `--no-sandbox` so Electron can start in common local Linux development environments. The app window itself still keeps renderer isolation enabled.
