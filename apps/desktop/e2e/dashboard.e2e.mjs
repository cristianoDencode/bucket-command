/* global console, document, process, setTimeout, URL, window */
import { _electron as electron } from "@playwright/test";
import electronPath from "electron";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
const electronUserDataDir = join(runtimeTempDir, "electron-user-data");
const artifactDir = process.env.BUCKET_COMMAND_E2E_ARTIFACT_DIR ?? join(rootDir, "test-results", "desktop-e2e");
const electronLaunchArgs = [
  ...(process.platform === "win32" ? [] : ["--no-sandbox"]),
  "--disable-gpu",
  "--disable-gpu-compositing",
  "--disable-gpu-rasterization",
  "--disable-dev-shm-usage",
  "--in-process-gpu",
  "apps/desktop"
];
const env = {
  ...process.env,
  BUCKET_COMMAND_DATA_DIR: dataDir,
  BUCKET_COMMAND_DISABLE_HARDWARE_ACCELERATION: "true",
  BUCKET_COMMAND_ELECTRON_USER_DATA_DIR: electronUserDataDir,
  // Test-only override: makes the automatic backup scheduler check (and treat the configured
  // interval as due) every 250ms instead of waiting real hours, so this can be validated quickly.
  BUCKET_COMMAND_TEST_BACKUP_INTERVAL_MS: "250"
};
delete env.ELECTRON_RUN_AS_NODE;

let app;
let page;
let quitBackupDir;
let quitBackupConfigured = false;
let restrictedBackupDir;

const waitForText = async (page, text) => {
  try {
    await page.getByText(text).first().waitFor();
  } catch (error) {
    console.error(await page.locator("body").innerText());
    throw error;
  }
};

const waitForCondition = async (check, { timeoutMs = 8000, intervalMs = 100 } = {}) => {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }

  throw new Error("Condition not met within the timeout.");
};

const automaticBackupFiles = (directory) =>
  existsSync(directory) ? readdirSync(directory).filter((name) => name.startsWith("bucket-command-backup-auto-")) : [];

const mockFolderDialogOnce = async (folderPath) => {
  await app.evaluate(
    ({ dialog }, path) => {
      const original = dialog.showOpenDialog;
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
      globalThis.__bucketCommandRestoreFolderDialog = () => {
        dialog.showOpenDialog = original;
      };
    },
    folderPath
  );
};

const restoreFolderDialog = async () => {
  await app.evaluate(() => {
    globalThis.__bucketCommandRestoreFolderDialog?.();
  });
};

const clickMenuItem = async (menuLabel, itemLabel) => {
  await app.evaluate(
    ({ Menu }, labels) => {
      const menu = Menu.getApplicationMenu();
      const parentMenu = menu?.items.find((item) => item.label === labels.menuLabel);
      const item = parentMenu?.submenu?.items.find((entry) => entry.label === labels.itemLabel);
      if (item === undefined) {
        throw new Error(`Menu item not found: ${labels.menuLabel} > ${labels.itemLabel}`);
      }
      item.click(undefined, undefined, undefined);
    },
    { menuLabel, itemLabel }
  );
};

const fillMonaco = async (page, scope, value, label = "Content") => {
  const editor = scope.getByLabel(label, { exact: true });
  await editor.focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(value);
};

const expectDateTextInRegion = async (scope) => {
  const text = await scope.innerText();
  assert.match(text, /Created\s+\d{2}\/\d{2}\/\d{4}/);
  assert.match(text, /Updated\s+\d{2}\/\d{2}\/\d{4}/);
};

const clearActiveCategoryFilter = async (page) => {
  const activeCategory = page.locator(".category-select.active").first();
  if (await activeCategory.count() > 0) {
    await activeCategory.click();
  }
};

const chipColors = async (locator) =>
  locator.evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      background: styles.backgroundColor,
      border: styles.borderColor,
      color: styles.color
    };
  });

const captureFailureArtifacts = async (error) => {
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(join(artifactDir, "error.txt"), error instanceof Error ? `${error.stack ?? error.message}\n` : `${String(error)}\n`);

  if (page === undefined || page.isClosed()) return;

  try {
    await page.screenshot({ path: join(artifactDir, "failure.png"), fullPage: true });
  } catch (screenshotError) {
    writeFileSync(join(artifactDir, "screenshot-error.txt"), `${screenshotError instanceof Error ? screenshotError.message : String(screenshotError)}\n`);
  }

  try {
    writeFileSync(join(artifactDir, "body.txt"), `${await page.locator("body").innerText()}\n`);
  } catch (bodyError) {
    writeFileSync(join(artifactDir, "body-error.txt"), `${bodyError instanceof Error ? bodyError.message : String(bodyError)}\n`);
  }
};

try {
  if (ownsTempDir) {
    const store = new SqliteBucketCommandStore({ env });
    const service = new BucketCommandService(store);
    service.createCategory({ name: "cli", iconKey: "terminal" });
    service.createCategory({ name: "powershell-docs" });
    service.createCategory({ name: "misc" });
    service.createCommand({
      title: "From CLI",
      content: "echo cli-one\necho cli-two",
      category: { name: "cli" },
      language: "bash",
      alias: "cli-alias"
    });
    service.createCommand({
      title: "PowerShell Note",
      content: "Get-ChildItem",
      category: { name: "powershell-docs" },
      language: "powershell",
      alias: "ps-list"
    });
    service.createCommand({
      title: "Other Tool",
      content: "tool --help",
      category: { name: "misc" },
      language: "other",
      alias: "tool-help"
    });
    store.close();
  }

  app = await electron.launch({
    executablePath: electronPath,
    args: electronLaunchArgs,
    cwd: rootDir,
    env
  });

  page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  const details = page.getByRole("region", { name: "Command details" });

  const helpMenuResult = await app.evaluate(async ({ Menu, dialog }) => {
    const menu = Menu.getApplicationMenu();
    const helpMenu = menu?.items.find((item) => item.label === "Help");
    const helpItem = helpMenu?.submenu?.items.find((item) => item.label === "Bucket Command Help");
    const aboutItem = helpMenu?.submenu?.items.find((item) => item.label === "About Bucket Command");

    let capturedMessage = "";
    let capturedDetail = "";
    const originalShowMessageBox = dialog.showMessageBox;
    dialog.showMessageBox = async (_browserWindow, options) => {
      capturedMessage = options.message ?? "";
      capturedDetail = options.detail ?? "";
      return { response: 0, checkboxChecked: false };
    };

    try {
      aboutItem?.click(undefined, undefined, undefined);
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    } finally {
      dialog.showMessageBox = originalShowMessageBox;
    }

    return {
      hasHelpMenu: helpMenu !== undefined,
      hasHelpItem: helpItem !== undefined,
      hasAboutItem: aboutItem !== undefined,
      capturedMessage,
      capturedDetail
    };
  });

  assert.equal(helpMenuResult.hasHelpMenu, true);
  assert.equal(helpMenuResult.hasHelpItem, false);
  assert.equal(helpMenuResult.hasAboutItem, true);
  assert.match(helpMenuResult.capturedMessage, /Bucket Command/);
  assert.doesNotMatch(helpMenuResult.capturedDetail, /bucket-command command|bucket-command library|command run|shortcuts|bcr|bcrecord|Bash|PowerShell/);

  const backupMenuResult = await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    const fileMenuIndex = menu?.items.findIndex((item) => item.label === "File") ?? -1;
    const backupMenuIndex = menu?.items.findIndex((item) => item.label === "Backup") ?? -1;
    const helpMenuIndex = menu?.items.findIndex((item) => item.label === "Help") ?? -1;
    const backupMenu = menu?.items[backupMenuIndex];
    const itemLabels = backupMenu?.submenu?.items.filter((item) => item.type !== "separator").map((item) => item.label) ?? [];

    return { fileMenuIndex, backupMenuIndex, helpMenuIndex, itemLabels };
  });

  assert.ok(backupMenuResult.fileMenuIndex >= 0 && backupMenuResult.backupMenuIndex === backupMenuResult.fileMenuIndex + 1);
  assert.ok(backupMenuResult.helpMenuIndex === backupMenuResult.backupMenuIndex + 1);
  assert.deepEqual(backupMenuResult.itemLabels, [
    "Export Library...",
    "Import Library...",
    "Backup Now...",
    "Automatic Backup Settings..."
  ]);

  assert.equal(await page.evaluate(() => typeof window.process), "undefined");
  assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  assert.equal(await page.evaluate(() => "runCommand" in window.bucketCommand), false);
  assert.equal(await page.evaluate(() => "installShellShortcuts" in window.bucketCommand), false);
  assert.equal(await page.evaluate(() => typeof window.bucketCommand.exportLibrary), "function");
  assert.equal(await page.evaluate(() => typeof window.bucketCommand.importLibrary), "function");
  assert.equal(await page.evaluate(() => typeof window.bucketCommand.backupLibrary), "function");
  assert.equal(await page.evaluate(() => typeof window.bucketCommand.getBackupPreferences), "function");
  assert.equal(await page.evaluate(() => typeof window.bucketCommand.saveBackupPreferences), "function");
  assert.equal(await page.evaluate(() => typeof window.bucketCommand.chooseBackupFolder), "function");
  assert.equal(await page.evaluate(() => typeof window.bucketCommand.onBackupPreferencesUpdated), "function");
  assert.equal(await page.evaluate(() => typeof window.bucketCommand.onMenuAction), "function");

  await waitForText(page, "From CLI");
  const headerSpacing = await page.evaluate(() => {
    const search = document.querySelector(".global-search")?.getBoundingClientRect();
    const newCommandButton = [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("New Command"))?.getBoundingClientRect();

    return search === undefined || newCommandButton === undefined ? null : newCommandButton.left - search.right;
  });
  assert.ok(headerSpacing !== null && headerSpacing >= 10);
  const activeIndicator = await page.locator(".command-item.active").first().evaluate((element) => {
    const itemHeight = element.getBoundingClientRect().height;
    const beforeHeight = Number.parseFloat(window.getComputedStyle(element, "::before").height);
    return { itemHeight, beforeHeight };
  });
  assert.ok(activeIndicator.beforeHeight >= activeIndicator.itemHeight - 1);
  const languageFilterColors = await page.getByLabel("Filter by language").evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      background: styles.backgroundColor,
      border: styles.borderColor,
      color: styles.color
    };
  });
  assert.notEqual(languageFilterColors.background, "rgb(13, 17, 23)");
  assert.notEqual(languageFilterColors.border, "rgb(48, 54, 61)");
  const newCommandButtonBorder = await page.getByRole("button", { name: "New Command", exact: true }).evaluate((element) => window.getComputedStyle(element).borderColor);
  await page.getByRole("button", { name: "Refresh commands" }).click();
  await details.getByRole("heading", { name: "From CLI", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "New Command", exact: true }).evaluate((element) => window.getComputedStyle(element).borderColor), newCommandButtonBorder);
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("region", { name: "Annotation list" }).waitFor();
  assert.equal(await page.locator('[aria-label="Categories"]').count(), 0);
  assert.equal(await page.getByLabel("Search annotations").isVisible(), true);
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await page.locator('[aria-label="Categories"]').waitFor();
  await page.getByRole("region", { name: "Command list" }).waitFor();
  await details.getByRole("heading", { name: "From CLI", exact: true }).waitFor();

  const dashboardExportPath = join(runtimeTempDir, "dashboard-export.json");
  const dashboardBackupDir = join(runtimeTempDir, "dashboard-backup");
  await app.evaluate(
    ({ dialog }, paths) => {
      const originalShowSaveDialog = dialog.showSaveDialog;
      const originalShowOpenDialog = dialog.showOpenDialog;
      let openDialogCalls = 0;

      dialog.showSaveDialog = async () => ({ canceled: false, filePath: paths.exportPath });
      dialog.showOpenDialog = async () => {
        openDialogCalls += 1;
        return openDialogCalls === 1
          ? { canceled: false, filePaths: [paths.exportPath] }
          : { canceled: false, filePaths: [paths.backupDir] };
      };

      globalThis.__bucketCommandRestoreDialogs = () => {
        dialog.showSaveDialog = originalShowSaveDialog;
        dialog.showOpenDialog = originalShowOpenDialog;
      };
    },
    { exportPath: dashboardExportPath, backupDir: dashboardBackupDir }
  );
  await clickMenuItem("Backup", "Export Library...");
  await waitForText(page, "Library exported to");
  assert.equal(existsSync(dashboardExportPath), true);
  await clickMenuItem("Backup", "Import Library...");
  await waitForText(page, "already exists");
  await clickMenuItem("Backup", "Backup Now...");
  await waitForText(page, "Local backup created at");
  assert.equal(existsSync(dashboardBackupDir), true);
  await app.evaluate(() => {
    globalThis.__bucketCommandRestoreDialogs?.();
  });

  assert.equal(await page.getByRole("button", { name: /Shortcuts/ }).count(), 0);
  const initialCategoryChip = details.locator('[data-chip-kind="category"]').first();
  const initialLanguageChip = details.locator('[data-chip-kind="language"][data-language="bash"]').first();
  const initialAliasChip = details.locator('[data-chip-kind="alias"]').first();
  await initialCategoryChip.waitFor();
  await initialLanguageChip.waitFor();
  await initialAliasChip.waitFor();
  const categoryColorsBefore = await chipColors(initialCategoryChip);
  const languageColorsBefore = await chipColors(initialLanguageChip);
  const aliasColorsBefore = await chipColors(initialAliasChip);
  assert.notEqual(categoryColorsBefore.background, "rgba(0, 0, 0, 0)");
  assert.notEqual(categoryColorsBefore.border, "rgb(48, 54, 61)");
  assert.notEqual(languageColorsBefore.border, categoryColorsBefore.border);
  assert.notEqual(aliasColorsBefore.border, categoryColorsBefore.border);
  await page.getByRole("button", { name: "Refresh commands" }).click();
  await details.getByRole("heading", { name: "From CLI", exact: true }).waitFor();
  assert.deepEqual(await chipColors(details.locator('[data-chip-kind="category"]').first()), categoryColorsBefore);
  assert.deepEqual(await chipColors(details.locator('[data-chip-kind="language"][data-language="bash"]').first()), languageColorsBefore);

  await page.getByRole("button", { name: /PowerShell Note/ }).click();
  await details.locator('[data-chip-kind="language"][data-language="powershell"]').first().waitFor();
  const powershellColors = await chipColors(details.locator('[data-chip-kind="language"][data-language="powershell"]').first());
  assert.notEqual(powershellColors.border, languageColorsBefore.border);

  await page.getByRole("button", { name: /Other Tool/ }).click();
  await details.locator('[data-chip-kind="language"][data-language="other"]').first().waitFor();
  const otherColors = await chipColors(details.locator('[data-chip-kind="language"][data-language="other"]').first());
  assert.notEqual(otherColors.border, languageColorsBefore.border);
  assert.notEqual(otherColors.border, powershellColors.border);

  await page.getByRole("button", { name: /From CLI/ }).click();
  if (process.env.BUCKET_COMMAND_E2E_SCREENSHOT !== undefined) {
    await page.screenshot({ path: process.env.BUCKET_COMMAND_E2E_SCREENSHOT, fullPage: true });
  }
  assert.equal(await details.getByLabel("Title", { exact: true }).count(), 0);
  await details.getByRole("button", { name: "Edit", exact: true }).click();
  await details.getByLabel("Title", { exact: true }).fill("Discarded title");
  await details.getByRole("button", { name: "Cancel", exact: true }).click();
  await details.getByRole("heading", { name: "From CLI", exact: true }).waitFor();

  await page.getByRole("button", { name: "New Category", exact: true }).click();
  const newCategoryNameBox = await page.getByLabel("New category name").boundingBox();
  assert.ok(newCategoryNameBox !== null && newCategoryNameBox.width >= 190);
  await page.getByRole("button", { name: "Add category" }).click();
  await waitForText(page, "Please enter a category name before saving.");
  await page.getByLabel("New category name").fill("CLI");
  await page.getByRole("button", { name: "Add category" }).click();
  await waitForText(page, "category name already exists.");
  await page.getByLabel("New category name").fill("x".repeat(41));
  await page.getByRole("button", { name: "Add category" }).click();
  await waitForText(page, "40 characters or fewer");
  await page.getByRole("button", { name: "Cancel new category" }).click();
  await page.locator(".category-row").filter({ hasText: "cli" }).hover();
  await page.getByRole("button", { name: "Delete category cli" }).click();
  await waitForText(page, "category contains commands or sequences and cannot be deleted.");

  await page.getByRole("button", { name: /From CLI/ }).click();
  await details.getByRole("button", { name: "Edit", exact: true }).click();
  await details.getByLabel("Title", { exact: true }).fill("Edited From Dashboard");
  await details.getByLabel("Alias", { exact: true }).fill("dash-edit");
  await fillMonaco(page, details, "echo edited-from-dashboard");
  await details.getByRole("button", { name: /Save/ }).click();
  await waitForText(page, "Command saved.");

  await page.getByRole("button", { name: "New Category", exact: true }).click();
  await page.getByLabel("New category name").fill("dashboard");
  await page.getByLabel("New category icon").selectOption("database");
  await page.getByRole("button", { name: "Add category" }).click();
  await page.locator(".category-row").filter({ hasText: "dashboard" }).waitFor();
  await page.locator(".category-row").filter({ hasText: "dashboard" }).hover();
  await page.getByRole("button", { name: "Edit category dashboard" }).click();
  const editCategoryNameBox = await page.getByLabel("Edit dashboard").boundingBox();
  assert.ok(editCategoryNameBox !== null && editCategoryNameBox.width >= 190);
  await page.getByLabel("Edit dashboard").fill("dashboard-updated");
  await page.getByLabel("Icon for dashboard").selectOption("server");
  await page.getByRole("button", { name: "Save category" }).click();
  await page.locator(".category-row").filter({ hasText: "dashboard-updated" }).waitFor();
  await page.getByRole("button", { name: "Refresh commands" }).click();
  await page.locator(".category-row").filter({ hasText: "dashboard-updated" }).waitFor();

  await page.getByRole("button", { name: "New Command", exact: true }).click();
  await details.getByRole("button", { name: /Save/ }).click();
  await waitForText(page, "Please enter a title before saving.");
  await details.getByLabel("Title", { exact: true }).fill("x".repeat(45));
  assert.equal(await details.getByLabel("Title", { exact: true }).inputValue(), "x".repeat(40));
  await details.getByLabel("Title", { exact: true }).fill("Dashboard Command");
  await details.getByRole("button", { name: /Save/ }).click();
  await waitForText(page, "Please add command content before saving.");
  await details.getByLabel("Alias", { exact: true }).fill("dash-command");
  await details.getByLabel("Language", { exact: true }).selectOption("bash");
  await details.getByLabel("Note", { exact: true }).fill("created in dashboard");
  await fillMonaco(page, details, "printf copied-from-dashboard");
  const newCommandCategory = details.getByLabel("Category", { exact: true });
  await newCommandCategory.selectOption("");
  await waitForCondition(async () => (await newCommandCategory.inputValue()) === "");
  await details.getByRole("button", { name: /Save/ }).click();
  await waitForText(page, "Please choose a category before saving.");
  await newCommandCategory.selectOption({ label: "dashboard-updated" });
  await details.getByRole("button", { name: /Save/ }).click();
  await waitForText(page, "Command saved.");

  await page.getByLabel("Search commands").fill("");
  await page.getByLabel("Filter by language").selectOption("");
  await page.getByRole("button", { name: "New Command", exact: true }).click();
  await details.getByLabel("Title", { exact: true }).fill("HTML Table Command");
  await details.getByLabel("Category", { exact: true }).selectOption({ label: "cli" });
  await details.getByLabel("Language", { exact: true }).selectOption("html");
  await fillMonaco(page, details, "<table><tr><td>cell</td></tr></table>");
  await details.getByRole("button", { name: /Save/ }).click();
  await waitForText(page, "Command saved.");
  await details.getByRole("heading", { name: "HTML Table Command", exact: true }).waitFor();
  await details.locator('[data-chip-kind="language"][data-language="html"]').first().waitFor();
  const htmlViewer = details.getByRole("region", { name: "Command content viewer" });
  await htmlViewer.getByRole("button", { name: /Copy/ }).waitFor();
  await htmlViewer.getByRole("button", { name: "Edit", exact: true }).waitFor();
  await htmlViewer.getByRole("button", { name: /Delete/ }).waitFor();
  await expectDateTextInRegion(htmlViewer);
  await htmlViewer.getByRole("button", { name: /Copy/ }).click();
  assert.match(await app.evaluate(({ clipboard }) => clipboard.readText()), /table/);

  // Regression check (reported bug): creating a brand-new command with language "other" errors out.
  await page.getByRole("button", { name: "New Command", exact: true }).click();
  await details.getByLabel("Title", { exact: true }).fill("Other Shell Command");
  await details.getByLabel("Alias", { exact: true }).fill("dash-other");
  await details.getByLabel("Category", { exact: true }).selectOption({ label: "dashboard-updated" });
  await details.getByLabel("Language", { exact: true }).selectOption("other");
  await fillMonaco(page, details, "custom-tool --run");
  await details.getByRole("button", { name: /Save/ }).click();
  await waitForText(page, "Command saved.");

  await page.getByLabel("Search commands").fill("copied");
  await waitForText(page, "Dashboard Command");
  await page.getByLabel("Filter by language").selectOption("bash");
  await waitForText(page, "Dashboard Command");

  await details.getByRole("button", { name: /Copy/ }).click();
  await waitForText(page, "Copied.");
  const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
  assert.equal(copied, "printf copied-from-dashboard");

  await details.getByRole("button", { name: "Edit", exact: true }).click();
  await details.getByRole("button", { name: /Delete/ }).click();
  await waitForText(page, "Command deleted.");
  await page.getByLabel("Search commands").fill("");
  await page.getByLabel("Filter by language").selectOption("");
  await page.getByRole("button", { name: /Other Shell Command/ }).click();
  await details.getByRole("button", { name: "Edit", exact: true }).click();
  await details.getByRole("button", { name: /Delete/ }).click();
  await waitForText(page, "Command deleted.");
  await page.locator(".category-row").filter({ hasText: "dashboard-updated" }).hover();
  await page.getByRole("button", { name: "Delete category dashboard-updated" }).click();
  await page.locator(".category-row").filter({ hasText: "dashboard-updated" }).waitFor({ state: "detached" });

  await page.getByRole("button", { name: "Collapse categories" }).click();
  await page.getByRole("button", { name: "Expand categories" }).waitFor();
  await details.getByRole("heading", { name: "Edited From Dashboard", exact: true }).waitFor();
  await page.getByRole("button", { name: "Expand categories" }).click();
  await page.getByRole("button", { name: "Collapse categories" }).waitFor();
  await page.getByRole("button", { name: "Collapse commands" }).click();
  await page.getByRole("button", { name: "Expand commands" }).waitFor();
  await details.getByRole("heading", { name: "Edited From Dashboard", exact: true }).waitFor();
  await page.getByRole("button", { name: "Expand commands" }).click();
  await page.getByRole("button", { name: "Collapse commands" }).waitFor();

  await page.getByRole("button", { name: "Notes", exact: true }).click();
  const annotationDetails = page.getByRole("region", { name: "Annotation details" });
  await page.getByRole("region", { name: "Annotation list" }).waitFor();
  assert.equal(await page.locator('[aria-label="Categories"]').count(), 0);
  await page.getByRole("button", { name: "New Annotation", exact: true }).click();
  await annotationDetails.getByRole("button", { name: "Save to Library" }).click();
  await annotationDetails.getByRole("button", { name: "Confirm save" }).click();
  await waitForText(page, "Please enter an annotation title before saving to the library.");
  await annotationDetails.getByRole("button", { name: "Discard" }).click();
  await annotationDetails.getByLabel("Annotation title", { exact: true }).fill("y".repeat(45));
  assert.equal(await annotationDetails.getByLabel("Annotation title", { exact: true }).inputValue(), "y".repeat(40));
  await annotationDetails.getByLabel("Annotation title", { exact: true }).fill("TICKET-1001 Analysis");
  await annotationDetails.getByLabel("Annotation language", { exact: true }).selectOption("html");
  await fillMonaco(page, annotationDetails, "<table><tr><td>note-cell</td></tr></table>", "Annotation content");
  await annotationDetails.getByLabel("Annotation note", { exact: true }).fill("owner context");
  await waitForCondition(async () =>
    page.evaluate(() => window.bucketCommand.listAnnotations().then((items) => items.some((item) => item.title === "TICKET-1001 Analysis" && item.note === "owner context")))
  );

  await page.getByRole("button", { name: "New Annotation", exact: true }).click();
  await annotationDetails.getByLabel("Annotation title", { exact: true }).fill("SQL research");
  await annotationDetails.getByLabel("Annotation language", { exact: true }).selectOption("sql");
  await fillMonaco(page, annotationDetails, "select * from customers where active = 1", "Annotation content");
  await annotationDetails.getByLabel("Annotation note", { exact: true }).fill("db migration");
  await waitForCondition(async () =>
    page.evaluate(() => window.bucketCommand.listAnnotations().then((items) => items.some((item) => item.title === "SQL research" && item.note === "db migration")))
  );

  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: /TICKET-1001 Analysis/ }).waitFor();
  await page.getByRole("button", { name: /SQL research/ }).waitFor();
  await page.getByLabel("Search annotations").fill("db migration");
  await page.getByRole("button", { name: /SQL research/ }).waitFor();
  assert.equal(await page.getByRole("button", { name: /TICKET-1001 Analysis/ }).count(), 0);
  await page.getByLabel("Search annotations").fill("no matching annotation");
  await waitForText(page, "No annotations match the current search.");
  await page.getByLabel("Search annotations").fill("");

  await page.getByRole("button", { name: /TICKET-1001 Analysis/ }).click();
  await annotationDetails.getByRole("heading", { name: "TICKET-1001 Analysis", exact: true }).waitFor();
  await annotationDetails.getByRole("button", { name: "Save to Library" }).click();
  await annotationDetails.getByRole("button", { name: "Confirm save" }).click();
  await page.getByRole("region", { name: "Command details" }).getByRole("heading", { name: "TICKET-1001 Analysis", exact: true }).waitFor();
  await page.getByLabel("Search commands").fill("TICKET-1001");
  await page.getByRole("button", { name: /TICKET-1001 Analysis/ }).click();
  await page.locator(".category-row").filter({ hasText: "Notes" }).waitFor();
  await details.locator('[data-chip-kind="language"][data-language="html"]').first().waitFor();

  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByLabel("Search annotations").fill("");
  await page.getByRole("button", { name: /SQL research/ }).click();
  await annotationDetails.getByRole("button", { name: "Delete" }).click();
  await waitForText(page, "Annotation deleted.");
  await waitForCondition(async () =>
    page.evaluate(() => window.bucketCommand.listAnnotations().then((items) => items.every((item) => item.title !== "SQL research")))
  );
  await page.getByRole("button", { name: "Collapse annotations" }).click();
  await page.getByRole("button", { name: "Expand annotations" }).waitFor();
  await annotationDetails.getByRole("heading", { name: "TICKET-1001 Analysis", exact: true }).waitFor();
  await page.getByRole("button", { name: "Expand annotations" }).click();
  await page.getByRole("button", { name: "Collapse annotations" }).waitFor();
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await clearActiveCategoryFilter(page);
  await page.getByLabel("Search commands").fill("");

  await page.setViewportSize({ width: 820, height: 900 });
  for (const regionName of ["Categories", "Command list", "Command details"]) {
    const region = page.locator(`[aria-label="${regionName}"]`);
    await region.scrollIntoViewIfNeeded();
    assert.equal(await region.isVisible(), true);
  }

  // --- Automatic backup preferences (task 0019) ---
  const autoBackupDir = join(runtimeTempDir, "auto-backup");
  restrictedBackupDir = join(runtimeTempDir, "restricted-backup");
  quitBackupDir = join(runtimeTempDir, "quit-backup");
  mkdirSync(restrictedBackupDir, { recursive: true });
  chmodSync(restrictedBackupDir, 0o000);

  // The settings panel is a full-screen overlay, so it must be closed again before interacting
  // with any button behind it (the backdrop otherwise intercepts those clicks).
  const settingsDialog = page.getByRole("dialog", { name: "Automatic backup settings" });
  const openBackupSettings = async () => {
    await clickMenuItem("Backup", "Automatic Backup Settings...");
    await settingsDialog.waitFor();
  };
  const closeBackupSettings = async () => {
    await settingsDialog.getByRole("button", { name: "Close automatic backup settings" }).click();
    await settingsDialog.waitFor({ state: "detached" });
  };

  await openBackupSettings();

  await mockFolderDialogOnce(autoBackupDir);
  await settingsDialog.getByRole("button", { name: "Choose folder" }).click();
  await settingsDialog.getByText(autoBackupDir).waitFor();
  await restoreFolderDialog();

  await settingsDialog.getByLabel("Backup on a schedule").check();
  await settingsDialog.getByLabel("Backup interval in hours").fill("1");
  await settingsDialog.getByLabel("Maximum automatic backups to keep").fill("1");
  await settingsDialog.getByRole("button", { name: "Save", exact: true }).click();
  await waitForText(page, "Automatic backup settings saved.");
  await closeBackupSettings();

  await waitForCondition(() => automaticBackupFiles(autoBackupDir).length >= 1);
  const firstAutoBackupName = automaticBackupFiles(autoBackupDir)[0];

  // Manual backup in the same folder must survive automatic rotation.
  await mockFolderDialogOnce(autoBackupDir);
  await clickMenuItem("Backup", "Backup Now...");
  await waitForText(page, "Local backup created at");
  await restoreFolderDialog();
  const manualBackupFiles = readdirSync(autoBackupDir).filter((name) => name.startsWith("bucket-command-backup-") && !name.startsWith("bucket-command-backup-auto-"));
  assert.equal(manualBackupFiles.length, 1);
  const [manualBackupName] = manualBackupFiles;

  // Wait past at least one more second boundary so the scheduler (interval "due" every ~250ms in
  // test mode) writes another automatic backup with a different file name, triggering rotation.
  await waitForCondition(
    () => {
      const currentAutoFiles = automaticBackupFiles(autoBackupDir);
      return currentAutoFiles.length === 1 && currentAutoFiles[0] !== firstAutoBackupName;
    },
    { timeoutMs: 6000, intervalMs: 200 }
  );
  assert.equal(automaticBackupFiles(autoBackupDir).length, 1);
  assert.equal(existsSync(join(autoBackupDir, manualBackupName)), true);

  // Disabling the schedule must stop further automatic backups.
  await openBackupSettings();
  await settingsDialog.getByLabel("Backup on a schedule").uncheck();
  await settingsDialog.getByRole("button", { name: "Save", exact: true }).click();
  await waitForText(page, "Automatic backup settings saved.");
  await closeBackupSettings();
  const countAfterDisable = automaticBackupFiles(autoBackupDir).length;
  await new Promise((resolve) => {
    setTimeout(resolve, 1200);
  });
  assert.equal(automaticBackupFiles(autoBackupDir).length, countAfterDisable);

  // An invalid/no-permission destination must report an error without crashing the app.
  await openBackupSettings();
  await mockFolderDialogOnce(restrictedBackupDir);
  await settingsDialog.getByRole("button", { name: "Choose folder" }).click();
  await settingsDialog.getByText(restrictedBackupDir).waitFor();
  await restoreFolderDialog();
  await settingsDialog.getByLabel("Backup on a schedule").check();
  await settingsDialog.getByRole("button", { name: "Save", exact: true }).click();
  await waitForText(page, "Automatic backup settings saved.");
  await waitForText(page, /Last automatic backup failed/);

  // Closing the panel and using the app normally proves the failure did not crash or freeze it.
  // Filters from the earlier search/edit flow are cleared so a known command reliably reappears.
  await closeBackupSettings();
  await clearActiveCategoryFilter(page);
  await page.getByLabel("Search commands").fill("");
  await page.getByLabel("Filter by language").selectOption("");
  await page.getByRole("button", { name: "Refresh commands" }).click();
  await page.getByRole("button", { name: /Edited From Dashboard/ }).click();
  await details.getByRole("heading", { name: "Edited From Dashboard", exact: true }).waitFor();

  // Reopen the panel to configure backup-on-quit for the final assertion after the app exits.
  await openBackupSettings();
  await settingsDialog.getByLabel("Backup on a schedule").uncheck();
  await mockFolderDialogOnce(quitBackupDir);
  await settingsDialog.getByRole("button", { name: "Choose folder" }).click();
  await settingsDialog.getByText(quitBackupDir).waitFor();
  await restoreFolderDialog();
  await settingsDialog.getByLabel("Backup when closing the app").check();
  await settingsDialog.getByRole("button", { name: "Save", exact: true }).click();
  await waitForText(page, "Automatic backup settings saved.");
  await closeBackupSettings();
  quitBackupConfigured = true;
} catch (error) {
  await captureFailureArtifacts(error);
  throw error;
} finally {
  if (app !== undefined) {
    await app.close();
  }

  if (quitBackupConfigured && quitBackupDir !== undefined) {
    await waitForCondition(() => automaticBackupFiles(quitBackupDir).length >= 1, { timeoutMs: 5000, intervalMs: 100 });
  }

  if (restrictedBackupDir !== undefined && existsSync(restrictedBackupDir)) {
    chmodSync(restrictedBackupDir, 0o700);
  }

  rmSync(runtimeTempDir, { recursive: true, force: true });
}

console.log("desktop e2e passed");
