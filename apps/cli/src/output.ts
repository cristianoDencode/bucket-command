import type { Category, CommandRecord } from "@bucket-command/core";

export const formatCategory = (category: Category): string => `${category.id}\t${category.name}`;

export const formatCommandListItem = (command: CommandRecord): string => {
  const alias = command.alias ?? "-";
  return `${command.id}\t${alias}\t${command.categoryName}\t${command.shellTarget}\t${command.title}`;
};

export const formatCommandDetails = (command: CommandRecord): string => {
  const lines = [
    `id: ${command.id}`,
    `title: ${command.title}`,
    `alias: ${command.alias ?? "-"}`,
    `category: ${command.categoryName}`,
    `shell: ${command.shellTarget}`,
    `note: ${command.note ?? "-"}`,
    "content:",
    command.content
  ];

  return lines.join("\n");
};
