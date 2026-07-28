export const helpText = `bucket-command

Usage:
  bucket-command category add --name <name>
  bucket-command category list
  bucket-command category update <id-or-name> --name <name>
  bucket-command category delete <id-or-name>

  bucket-command command add --title <title> --content <command> --category <name-or-id> --shell <bash|powershell|other> [--alias <alias>] [--note <note>]
  bucket-command command list [--query <text>] [--category <name-or-id>] [--shell <bash|powershell|other>]
  bucket-command command search <text> [--category <name-or-id>] [--shell <bash|powershell|other>]
  bucket-command command get <alias> [--raw]
  bucket-command command show <alias>
  bucket-command command update <id-or-alias> [--title <title>] [--content <command>] [--category <name-or-id>] [--shell <bash|powershell|other>] [--alias <alias>] [--no-alias] [--note <note>] [--no-note]
  bucket-command command delete <id-or-alias>
  bucket-command command run <alias> [--yes]

Environment:
  BUCKET_COMMAND_DATA_DIR  Use an isolated data directory for development or tests.
`;
