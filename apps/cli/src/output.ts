import type { Category, CommandRecord, CommandSequence } from "@bucket-command/core";

export const formatCategory = (category: Category): string => `${category.id}\t${category.name}\t${category.iconKey ?? "-"}`;

export const formatCommandListItem = (command: CommandRecord): string => {
  const alias = command.alias ?? "-";
  return `${command.id}\t${alias}\t${command.categoryName}\t${command.language}\t${command.title}`;
};

export const formatCommandDetails = (command: CommandRecord): string => {
  const lines = [
    `id: ${command.id}`,
    `title: ${command.title}`,
    `alias: ${command.alias ?? "-"}`,
    `category: ${command.categoryName}`,
    `language: ${command.language}`,
    `note: ${command.note ?? "-"}`,
    "content:",
    command.content
  ];

  return lines.join("\n");
};

export const formatSequenceListItem = (sequence: CommandSequence): string =>
  `${sequence.id}\t${sequence.alias}\t${sequence.categoryName}\t${sequence.shellTarget}\t${sequence.title}\t${sequence.items.length} items`;

export const formatSequenceDetails = (sequence: CommandSequence): string => {
  const lines = [
    `id: ${sequence.id}`,
    `title: ${sequence.title}`,
    `alias: ${sequence.alias}`,
    `category: ${sequence.categoryName}`,
    `shell: ${sequence.shellTarget}`,
    `note: ${sequence.note ?? "-"}`,
    "commands:",
    ...sequence.items.map((item) => `${item.position}. ${item.command.alias ?? item.command.id} — ${item.command.title}`)
  ];

  return lines.join("\n");
};
