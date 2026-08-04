export const helpText = `bucket-command

Usage:
  bucket-command category add --name <name> [--icon <icon-key>]
  bucket-command category list
  bucket-command category update <id-or-name> --name <name> [--icon <icon-key|none>]
  bucket-command category delete <id-or-name>

  bucket-command command add --title <title> --content <command> --category <name-or-id> --language <language> [--alias <alias>] [--note <note>]
  bucket-command command list [--query <text>] [--category <name-or-id>] [--language <language>]
  bucket-command command search <text> [--category <name-or-id>] [--language <language>]
  bucket-command command get <alias> [--raw]
  bucket-command command show <alias>
  bucket-command command update <id-or-alias> [--title <title>] [--content <command>] [--category <name-or-id>] [--language <language>] [--alias <alias>] [--no-alias] [--note <note>] [--no-note]
  bucket-command command delete <id-or-alias>

  bucket-command sequence add --title <title> --category <name-or-id> --shell <bash|powershell> --alias <alias> --items <command-alias[,command-alias...]>
  bucket-command sequence list
  bucket-command sequence show <alias>
  bucket-command sequence update <id-or-alias> [--title <title>] [--category <name-or-id>] [--shell <bash|powershell>] [--alias <alias>] [--note <note>] [--no-note] [--items <command-alias[,command-alias...]>]
  bucket-command sequence delete <id-or-alias>

  bucket-command library export --output <arquivo.json>
  bucket-command library import --input <arquivo.json>
  bucket-command library backup --output <arquivo-ou-diretorio>

Notes:
  Stored commands are documentation only. Bucket Command does not execute them.
  Use command get <alias> --raw to print the exact stored content for manual copy.
  Library backup is a local JSON file. To use Google Drive, OneDrive or Dropbox,
  choose a local folder already synchronized by those apps.
  Category names are limited to 40 characters. Category icons are optional and
  must use a supported key: folder, terminal, git, database, docker, code, server,
  shield, package or globe.
  <language> is one of: bash, powershell, javascript, typescript, json, sql, php,
  python, html, css, yaml, markdown, other. --shell is still accepted as an alias
  for --language on "command" actions. "sequence" actions keep --shell, limited to
  bash or powershell, since a sequence chains real terminal steps.

Environment:
  BUCKET_COMMAND_DATA_DIR  Use an isolated data directory for development or tests.
`;
