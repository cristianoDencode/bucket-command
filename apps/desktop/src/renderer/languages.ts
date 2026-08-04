import type { CommandLanguage } from "@bucket-command/core";

export type LanguageGroup = "Shell" | "Web" | "Data" | "Other";

export interface LanguageOption {
  value: CommandLanguage;
  label: string;
  monacoLanguage: string;
  group: LanguageGroup;
}

export const languageOptions: LanguageOption[] = [
  { value: "bash", label: "bash", monacoLanguage: "shell", group: "Shell" },
  { value: "powershell", label: "powershell", monacoLanguage: "powershell", group: "Shell" },
  { value: "javascript", label: "javascript", monacoLanguage: "javascript", group: "Web" },
  { value: "typescript", label: "typescript", monacoLanguage: "typescript", group: "Web" },
  { value: "html", label: "html", monacoLanguage: "html", group: "Web" },
  { value: "css", label: "css", monacoLanguage: "css", group: "Web" },
  { value: "json", label: "json", monacoLanguage: "json", group: "Data" },
  { value: "sql", label: "sql", monacoLanguage: "sql", group: "Data" },
  { value: "yaml", label: "yaml", monacoLanguage: "yaml", group: "Data" },
  { value: "markdown", label: "markdown", monacoLanguage: "markdown", group: "Data" },
  { value: "php", label: "php", monacoLanguage: "php", group: "Other" },
  { value: "python", label: "python", monacoLanguage: "python", group: "Other" },
  { value: "other", label: "other", monacoLanguage: "plaintext", group: "Other" }
];

export const languageGroups: LanguageGroup[] = ["Shell", "Web", "Data", "Other"];

const languageOptionByValue = new Map(languageOptions.map((option) => [option.value, option]));

export const monacoLanguageFor = (language: CommandLanguage): string =>
  languageOptionByValue.get(language)?.monacoLanguage ?? "plaintext";
