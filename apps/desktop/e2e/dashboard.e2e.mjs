/* global console, process, URL, window */
import { _electron as electron } from "@playwright/test";
import electronPath from "electron";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { BucketCommandService } from "../../../packages/core/dist/index.js";
import { SqliteBucketCommandStore } from "../../../packages/storage/dist/index.js";

const rootDir = fileURLToPath(new URL("../../..", import.meta.url));
const runtimeTempDir = mkdtempSync(join(tmpdir(), "bucket-command-desktop-run-"));
const ownsTempDir = process.env.BUCKET_COMMAND_DATA_DIR === undefined;
const dataDir = process.env.BUCKET_COMMAND_DATA_DIR ?? join(runtimeTempDir, "data");
const electronWrapper = join(runtimeTempDir, "electron-wrapper.sh");
writeFileSync(electronWrapper, `#!/usr/bin/env sh\nexec "${electronPath}" "$@"\n`);
chmodSync(electronWrapper, 0o755);
const env = {
  ...process.env,
  BUCKET_COMMAND_DATA_DIR: dataDir
};
delete env.ELECTRON_RUN_AS_NODE;

let app;

const waitForText = async (page, text) => {
  try {
    await page.getByText(text).waitFor();
  } catch (error) {
    console.error(await page.locator("body").innerText());
    throw error;
  }
};

try {
  if (ownsTempDir) {
    const store = new SqliteBucketCommandStore({ env });
    const service = new BucketCommandService(store);
    service.createCategory({ name: "cli" });
    service.createCommand({
      title: "From CLI",
      content: "echo cli-one\necho cli-two",
      category: { name: "cli" },
      shellTarget: "bash",
      alias: "cli-alias"
    });
    store.close();
  }

  app = await electron.launch({
    executablePath: electronWrapper,
    args: ["apps/desktop"],
    cwd: rootDir,
    env
  });

  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  const details = page.getByRole("region", { name: "Command details" });

  assert.equal(await page.evaluate(() => typeof window.process), "undefined");
  assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  assert.equal(await page.evaluate(() => "runCommand" in window.bucketCommand), false);

  await waitForText(page, "From CLI");
  await page.getByLabel("New category name").fill("CLI");
  await page.getByRole("button", { name: "Add category" }).click();
  await waitForText(page, "category name already exists.");
  await page.getByRole("button", { name: "Delete category cli" }).click();
  await waitForText(page, "category contains commands and cannot be deleted.");

  await page.getByRole("button", { name: /From CLI/ }).click();
  await details.getByLabel("Title", { exact: true }).fill("Edited From Dashboard");
  await details.getByLabel("Alias", { exact: true }).fill("dash-edit");
  await details.getByLabel("Content", { exact: true }).fill("echo edited-from-dashboard");
  await details.getByRole("button", { name: /Save/ }).click();
  await waitForText(page, "Command saved.");

  await page.getByLabel("New category name").fill("dashboard");
  await page.getByRole("button", { name: "Add category" }).click();
  await page.getByRole("button", { name: "dashboard", exact: true }).waitFor();
  await page.getByRole("button", { name: "Edit category dashboard" }).click();
  await page.getByLabel("Edit dashboard").fill("dashboard-updated");
  await page.getByRole("button", { name: "Save category" }).click();
  await page.getByRole("button", { name: "dashboard-updated", exact: true }).waitFor();

  await page.getByRole("button", { name: "New" }).click();
  await details.getByLabel("Title", { exact: true }).fill("Dashboard Command");
  await details.getByLabel("Alias", { exact: true }).fill("dash-command");
  await details.getByLabel("Category", { exact: true }).selectOption({ label: "dashboard-updated" });
  await details.getByLabel("Shell", { exact: true }).selectOption("bash");
  await details.getByLabel("Note", { exact: true }).fill("created in dashboard");
  await details.getByLabel("Content", { exact: true }).fill("printf copied-from-dashboard");
  await details.getByRole("button", { name: /Save/ }).click();
  await waitForText(page, "Command saved.");

  await page.getByLabel("Search commands").fill("copied");
  await waitForText(page, "Dashboard Command");
  await page.getByLabel("Filter by shell").selectOption("bash");
  await waitForText(page, "Dashboard Command");

  await details.getByRole("button", { name: /Copy/ }).click();
  await waitForText(page, "Copied.");
  const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
  assert.equal(copied, "printf copied-from-dashboard");

  await details.getByRole("button", { name: /Delete/ }).click();
  await waitForText(page, "Command deleted.");
  await page.getByRole("button", { name: "Delete category dashboard-updated" }).click();
  await page.getByRole("button", { name: "dashboard-updated", exact: true }).waitFor({ state: "detached" });
} finally {
  if (app !== undefined) {
    await app.close();
  }

  rmSync(runtimeTempDir, { recursive: true, force: true });
}

console.log("desktop e2e passed");
