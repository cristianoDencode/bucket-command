import * as prettier from "prettier/standalone";
import babelPlugin from "prettier/plugins/babel";
import estreePlugin from "prettier/plugins/estree";
import typescriptPlugin from "prettier/plugins/typescript";
import postcssPlugin from "prettier/plugins/postcss";
import htmlPlugin from "prettier/plugins/html";
import yamlPlugin from "prettier/plugins/yaml";
import markdownPlugin from "prettier/plugins/markdown";
import type { Plugin } from "prettier";
import { format as formatSql } from "sql-formatter";
import type { CommandLanguage } from "@bucket-command/core";

type Formatter = (content: string) => Promise<string>;

const prettierFormatter =
  (parser: string, plugins: Plugin[]): Formatter =>
  (content) =>
    prettier.format(content, { parser, plugins, tabWidth: 2 });

// Only languages with a mature, dependency-free JS/WASM formatter are wired up here.
// php/python/bash/powershell/other are left without auto-format for now.
const formatters: Partial<Record<CommandLanguage, Formatter>> = {
  javascript: prettierFormatter("babel", [babelPlugin, estreePlugin]),
  typescript: prettierFormatter("typescript", [typescriptPlugin, estreePlugin]),
  json: prettierFormatter("json", [babelPlugin, estreePlugin]),
  html: prettierFormatter("html", [htmlPlugin]),
  css: prettierFormatter("css", [postcssPlugin]),
  yaml: prettierFormatter("yaml", [yamlPlugin]),
  markdown: prettierFormatter("markdown", [markdownPlugin]),
  sql: async (content) => formatSql(content, { language: "sql" })
};

export const canFormat = (language: CommandLanguage): boolean => language in formatters;

export const formatContent = async (language: CommandLanguage, content: string): Promise<string> => {
  const formatter = formatters[language];

  if (formatter === undefined) {
    throw new Error(`No formatter available for "${language}".`);
  }

  return (await formatter(content)).trimEnd();
};
