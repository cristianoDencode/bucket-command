import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Editor, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import {
  Box,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Database,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  Globe,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Server,
  Shield,
  Sparkles,
  Terminal,
  Trash2,
  X
} from "lucide-react";
import type { AnnotationRecord, Category, CategoryIconKey, CommandLanguage, CommandRecord } from "@bucket-command/core";
import type { BackupPreferencesInput } from "@bucket-command/storage";
import type { BackupPreferencesStatus, MenuAction } from "../shared/api.js";
import logoUrl from "./assets/bucket-command-logo.png";
import { canFormat, formatContent } from "./format-code.js";
import { languageGroups, languageOptions, monacoLanguageFor } from "./languages.js";
import "./styles.css";

loader.config({ monaco });

type Notice = { kind: "ok" | "error"; text: string } | null;
type DetailMode = "view" | "edit" | "new";
type WorkspaceMode = "commands" | "annotations";
type ChipKind = "category" | "alias" | "language";
const maxTitleLength = 40;

interface ChipTone {
  background: string;
  border: string;
  color: string;
}

interface CommandFormState {
  id: string | null;
  title: string;
  content: string;
  categoryId: string;
  alias: string;
  note: string;
  language: CommandLanguage;
}

interface AnnotationFormState {
  id: string | null;
  title: string;
  content: string;
  note: string;
  language: CommandLanguage;
}

const emptyForm = (categoryId = ""): CommandFormState => ({
  id: null,
  title: "",
  content: "",
  categoryId,
  alias: "",
  note: "",
  language: "bash"
});

const emptyAnnotationForm = (): AnnotationFormState => ({
  id: null,
  title: "",
  content: "",
  note: "",
  language: "markdown"
});

const annotationFormFromRecord = (annotation: AnnotationRecord): AnnotationFormState => ({
  id: annotation.id,
  title: annotation.title ?? "",
  content: annotation.content,
  note: annotation.note ?? "",
  language: annotation.language
});

const formFromCommand = (command: CommandRecord): CommandFormState => ({
  id: command.id,
  title: command.title,
  content: command.content,
  categoryId: command.categoryId,
  alias: command.alias ?? "",
  note: command.note ?? "",
  language: command.language
});

const chipPalette: ChipTone[] = [
  { background: "rgb(30 58 138 / 28%)", border: "#2563eb", color: "#bfdbfe" },
  { background: "rgb(5 150 105 / 22%)", border: "#059669", color: "#a7f3d0" },
  { background: "rgb(124 58 237 / 24%)", border: "#7c3aed", color: "#ddd6fe" },
  { background: "rgb(217 119 6 / 20%)", border: "#d97706", color: "#fde68a" },
  { background: "rgb(14 116 144 / 24%)", border: "#0e7490", color: "#a5f3fc" },
  { background: "rgb(190 24 93 / 20%)", border: "#be185d", color: "#fbcfe8" },
  { background: "rgb(79 70 229 / 24%)", border: "#4f46e5", color: "#c7d2fe" },
  { background: "rgb(101 163 13 / 20%)", border: "#65a30d", color: "#d9f99d" }
];

const languageChips: Partial<Record<CommandLanguage, ChipTone>> = {
  bash: { background: "rgb(34 197 94 / 22%)", border: "#22c55e", color: "#bbf7d0" },
  powershell: { background: "rgb(37 99 235 / 24%)", border: "#3b82f6", color: "#bfdbfe" },
  other: { background: "rgb(148 163 184 / 18%)", border: "#64748b", color: "#e2e8f0" }
};

const hashText = (value: string): number => {
  let hash = 0;
  for (const character of value.trim().toLocaleLowerCase()) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
};

const toneForValue = (value: string): ChipTone => chipPalette[hashText(value) % chipPalette.length] ?? chipPalette[0];

const chipStyle = (kind: ChipKind, value: string): React.CSSProperties => {
  const tone = kind === "language" ? languageChips[value as CommandLanguage] ?? toneForValue(`${kind}:${value}`) : toneForValue(`${kind}:${value}`);
  return {
    "--chip-bg": tone.background,
    "--chip-border": tone.border,
    "--chip-text": tone.color
  } as React.CSSProperties;
};

const chipClassName = (kind: ChipKind): string => `metadata-chip metadata-chip-${kind}`;

const actionButtonStyle = (value: string): React.CSSProperties => {
  const tone = toneForValue(`action:${value}`);
  return {
    "--action-bg": tone.background,
    "--action-border": tone.border,
    "--action-text": tone.color
  } as React.CSSProperties;
};

const iconLabels: Record<CategoryIconKey, string> = {
  folder: "Folder",
  terminal: "Terminal",
  git: "Git",
  database: "Database",
  docker: "Docker",
  code: "Code",
  server: "Server",
  shield: "Shield",
  package: "Package",
  globe: "Globe"
};
const categoryIconOptions = Object.keys(iconLabels) as CategoryIconKey[];

const categoryIconByKey = (iconKey: CategoryIconKey) => {
  if (iconKey === "terminal") return <Terminal size={17} />;
  if (iconKey === "git") return <GitBranch size={17} />;
  if (iconKey === "database") return <Database size={17} />;
  if (iconKey === "docker") return <Box size={17} />;
  if (iconKey === "code") return <Code2 size={17} />;
  if (iconKey === "server") return <Server size={17} />;
  if (iconKey === "shield") return <Shield size={17} />;
  if (iconKey === "package") return <Package size={17} />;
  if (iconKey === "globe") return <Globe size={17} />;
  return <Folder size={17} />;
};

const categoryIcon = (name: string, iconKey: CategoryIconKey | null) => {
  if (iconKey !== null) return categoryIconByKey(iconKey);

  const normalized = name.toLocaleLowerCase();
  if (normalized.includes("git")) return <GitBranch size={17} />;
  if (normalized.includes("docker")) return <Box size={17} />;
  if (normalized.includes("sql") || normalized.includes("database")) return <Database size={17} />;
  if (normalized.includes("bash") || normalized.includes("shell") || normalized.includes("linux")) return <Terminal size={17} />;
  return <Folder size={17} />;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));

const defaultBackupPreferencesForm: BackupPreferencesInput = {
  backupOnQuit: false,
  scheduledBackupEnabled: false,
  intervalHours: 24,
  destinationFolder: null,
  maxAutoBackups: 5
};

const commandSaveValidationMessage = (state: CommandFormState): string | null => {
  if (state.title.trim().length === 0) return "Please enter a title before saving.";
  if (state.content.trim().length === 0) return "Please add command content before saving.";
  if (state.categoryId.trim().length === 0) return "Please choose a category before saving.";
  return null;
};

const categorySaveValidationMessage = (name: string): string | null =>
  name.trim().length === 0 ? "Please enter a category name before saving." : null;

const backupPreferencesValidationMessage = (input: BackupPreferencesInput): string | null => {
  if (!Number.isInteger(input.intervalHours) || input.intervalHours < 1) {
    return "Please enter a backup interval of at least 1 hour.";
  }

  if (!Number.isInteger(input.maxAutoBackups) || input.maxAutoBackups < 1) {
    return "Please enter at least 1 backup copy to keep.";
  }

  return null;
};

const toBackupPreferencesInput = (preferences: BackupPreferencesInput): BackupPreferencesInput => ({
  backupOnQuit: preferences.backupOnQuit,
  scheduledBackupEnabled: preferences.scheduledBackupEnabled,
  intervalHours: preferences.intervalHours,
  destinationFolder: preferences.destinationFolder,
  maxAutoBackups: preferences.maxAutoBackups
});

const App = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [commands, setCommands] = useState<CommandRecord[]>([]);
  const [allCommands, setAllCommands] = useState<CommandRecord[]>([]);
  const [annotations, setAnnotations] = useState<AnnotationRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("commands");
  const [categoryPanelCollapsed, setCategoryPanelCollapsed] = useState(false);
  const [commandPanelCollapsed, setCommandPanelCollapsed] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryIconKey, setCategoryIconKey] = useState<CategoryIconKey | "">("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [editingCategoryIconKey, setEditingCategoryIconKey] = useState<CategoryIconKey | "">("");
  const [query, setQuery] = useState("");
  const [annotationQuery, setAnnotationQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [form, setForm] = useState<CommandFormState>(emptyForm());
  const [annotationForm, setAnnotationForm] = useState<AnnotationFormState>(emptyAnnotationForm());
  const [annotationSaveState, setAnnotationSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [commandModalOpen, setCommandModalOpen] = useState(false);
  const [saveAnnotationModalOpen, setSaveAnnotationModalOpen] = useState(false);
  const [mode, setMode] = useState<DetailMode>("view");
  const [notice, setNotice] = useState<Notice>(null);
  const [copyId, setCopyId] = useState<string | null>(null);
  const [backupSettingsOpen, setBackupSettingsOpen] = useState(false);
  const [backupPreferencesForm, setBackupPreferencesForm] = useState<BackupPreferencesInput>(defaultBackupPreferencesForm);
  const [backupStatus, setBackupStatus] = useState<BackupPreferencesStatus | null>(null);

  const selectedCommand = useMemo(
    () => allCommands.find((command) => command.id === selectedId) ?? null,
    [allCommands, selectedId]
  );

  const selectedAnnotation = useMemo(
    () => annotations.find((annotation) => annotation.id === selectedAnnotationId) ?? null,
    [annotations, selectedAnnotationId]
  );

  const filteredAnnotations = useMemo(() => {
    const normalizedQuery = annotationQuery.trim().toLocaleLowerCase();

    if (normalizedQuery.length === 0) {
      return annotations;
    }

    return annotations.filter((annotation) =>
      [annotation.title, annotation.note, annotation.content, annotation.language]
        .join("\n")
        .toLocaleLowerCase()
        .includes(normalizedQuery)
    );
  }, [annotations, annotationQuery]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const command of allCommands) counts.set(command.categoryId, (counts.get(command.categoryId) ?? 0) + 1);
    return counts;
  }, [allCommands]);

  const runAction = async (action: () => Promise<void>, ok?: string) => {
    try {
      await action();
      setNotice(ok === undefined ? null : { kind: "ok", text: ok });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unknown error." });
    }
  };

  const showValidationNotice = (text: string): void => {
    setNotice({ kind: "error", text });
  };

  const loadAll = async () => {
    const filters = {
      query,
      category: categoryFilter === "" ? undefined : { id: categoryFilter, name: categoryFilter },
      language: languageFilter === "" ? undefined : (languageFilter as CommandLanguage)
    };
    const [nextCategories, nextCommands, nextAllCommands, nextAnnotations] = await Promise.all([
      window.bucketCommand.listCategories(),
      window.bucketCommand.listCommands(filters),
      window.bucketCommand.listCommands(),
      window.bucketCommand.listAnnotations()
    ]);
    setCategories(nextCategories);
    setCommands(nextCommands);
    setAllCommands(nextAllCommands);
    setAnnotations(nextAnnotations);
    setSelectedId((current) => {
      if (mode === "new") return current;
      return current !== null && nextCommands.some((command) => command.id === current) ? current : nextCommands[0]?.id ?? null;
    });
    setForm((current) =>
      current.id === null ? { ...current, categoryId: current.categoryId || nextCategories[0]?.id || "" } : current
    );
    setSelectedAnnotationId((current) => current !== null && nextAnnotations.some((annotation) => annotation.id === current) ? current : nextAnnotations[0]?.id ?? null);
  };

  useEffect(() => {
    void runAction(loadAll);
  }, [query, categoryFilter, languageFilter]);

  useEffect(() => {
    let active = true;

    void window.bucketCommand.getBackupPreferences().then((status) => {
      if (!active) return;
      setBackupStatus(status);
      setBackupPreferencesForm(toBackupPreferencesInput(status.preferences));
    });

    const unsubscribe = window.bucketCommand.onBackupPreferencesUpdated((status) => {
      if (!active) return;
      setBackupStatus(status);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (selectedCommand !== null && mode === "view") setForm(formFromCommand(selectedCommand));
  }, [selectedCommand, mode]);

  useEffect(() => {
    if (selectedAnnotation !== null) {
      setAnnotationForm(annotationFormFromRecord(selectedAnnotation));
      setAnnotationSaveState("saved");
    }
  }, [selectedAnnotation]);

  useEffect(() => {
    if (workspaceMode !== "annotations") return;

    const hasDraftContent =
      annotationForm.title.trim().length > 0 ||
      annotationForm.content.length > 0 ||
      annotationForm.note.length > 0 ||
      annotationForm.language !== "markdown";

    if (!hasDraftContent) return;

    const timer = window.setTimeout(() => {
      void runAction(async () => {
        setAnnotationSaveState("saving");
        const payload = {
          title: annotationForm.title.trim() === "" ? null : annotationForm.title,
          content: annotationForm.content,
          note: annotationForm.note === "" ? null : annotationForm.note,
          language: annotationForm.language
        };
        const saved =
          annotationForm.id === null
            ? await window.bucketCommand.createAnnotation(payload)
            : await window.bucketCommand.updateAnnotation(annotationForm.id, payload);
        setAnnotationForm(annotationFormFromRecord(saved));
        setSelectedAnnotationId(saved.id);
        const nextAnnotations = await window.bucketCommand.listAnnotations();
        setAnnotations(nextAnnotations);
        setAnnotationSaveState("saved");
      }).catch(() => setAnnotationSaveState("error"));
    }, 650);

    return () => window.clearTimeout(timer);
  }, [annotationForm.title, annotationForm.content, annotationForm.note, annotationForm.language, annotationForm.id, workspaceMode]);

  const selectCommand = (id: string) => {
    setSelectedId(id);
    setWorkspaceMode("commands");
    setMode("view");
    setNotice(null);
  };

  const selectAnnotation = (id: string) => {
    setSelectedAnnotationId(id);
    setWorkspaceMode("annotations");
    setNotice(null);
  };

  const startNewAnnotation = () => {
    setWorkspaceMode("annotations");
    setSelectedAnnotationId(null);
    setAnnotationForm(emptyAnnotationForm());
    setAnnotationSaveState("idle");
    setNotice(null);
  };

  const openCodeWorkspace = () => {
    setWorkspaceMode("commands");
    setNotice(null);
  };

  const openAnnotationWorkspace = () => {
    setWorkspaceMode("annotations");
    setNotice(null);
  };

  const createCategory = async () => {
    const validationMessage = categorySaveValidationMessage(categoryName);
    if (validationMessage !== null) {
      showValidationNotice(validationMessage);
      return;
    }

    await runAction(async () => {
      const category = await window.bucketCommand.createCategory({
        name: categoryName,
        iconKey: categoryIconKey === "" ? null : categoryIconKey
      });
      setCategoryName("");
      setCategoryIconKey("");
      setAddingCategory(false);
      setCategoryFilter(category.id);
      await loadAll();
    }, "Category saved.");
  };

  const updateCategory = async (id: string) => {
    const validationMessage = categorySaveValidationMessage(editingCategoryName);
    if (validationMessage !== null) {
      showValidationNotice(validationMessage);
      return;
    }

    await runAction(async () => {
      await window.bucketCommand.updateCategory(id, {
        name: editingCategoryName,
        iconKey: editingCategoryIconKey === "" ? null : editingCategoryIconKey
      });
      setEditingCategoryId(null);
      setEditingCategoryName("");
      setEditingCategoryIconKey("");
      await loadAll();
    }, "Category updated.");
  };

  const deleteCategory = async (id: string) => {
    await runAction(async () => {
      await window.bucketCommand.deleteCategory(id);
      if (categoryFilter === id) setCategoryFilter("");
      await loadAll();
    }, "Category deleted.");
  };

  const saveCommand = async () => {
    const validationMessage = commandSaveValidationMessage(form);
    if (validationMessage !== null) {
      showValidationNotice(validationMessage);
      return;
    }

    await runAction(async () => {
      const payload = {
        title: form.title,
        content: form.content,
        category: { id: form.categoryId, name: form.categoryId },
        alias: form.alias.trim() === "" ? null : form.alias,
        note: form.note === "" ? null : form.note,
        language: form.language
      };
      const command =
        form.id === null
          ? await window.bucketCommand.createCommand(payload)
          : await window.bucketCommand.updateCommand(form.id, payload);
      setSelectedId(command.id);
      setMode("view");
      await loadAll();
    }, "Command saved.");
  };

  const deleteCommand = async () => {
    if (form.id === null) return;
    await deleteCommandById(form.id);
  };

  const deleteCommandById = async (id: string) => {
    await runAction(async () => {
      await window.bucketCommand.deleteCommand(id);
      setForm(emptyForm(categories[0]?.id ?? ""));
      setSelectedId(null);
      setMode("view");
      await loadAll();
    }, "Command deleted.");
  };

  const copyCommand = async () => {
    const id = selectedCommand?.id ?? form.id;
    if (id === null || id === undefined) return;
    await runAction(async () => {
      await window.bucketCommand.copyCommandContent(id);
      setCopyId(id);
      window.setTimeout(() => setCopyId(null), 1200);
    }, "Copied.");
  };

  const prettyFormatCommand = async () => {
    const originalContent = form.content;

    await runAction(async () => {
      const formatted = await formatContent(form.language, originalContent);
      setForm((current) => ({ ...current, content: formatted }));
    }, "Command formatted.");
  };

  const prettyFormatAnnotation = async () => {
    const originalContent = annotationForm.content;

    await runAction(async () => {
      const formatted = await formatContent(annotationForm.language, originalContent);
      setAnnotationForm((current) => ({ ...current, content: formatted }));
    }, "Annotation formatted.");
  };

  const deleteAnnotation = async () => {
    if (annotationForm.id === null) return;

    await runAction(async () => {
      await window.bucketCommand.deleteAnnotation(annotationForm.id as string);
      const nextAnnotations = await window.bucketCommand.listAnnotations();
      setAnnotations(nextAnnotations);
      const nextAnnotation = nextAnnotations[0] ?? null;
      setSelectedAnnotationId(nextAnnotation?.id ?? null);
      setAnnotationForm(nextAnnotation === null ? emptyAnnotationForm() : annotationFormFromRecord(nextAnnotation));
      setAnnotationSaveState(nextAnnotation === null ? "idle" : "saved");
      setSaveAnnotationModalOpen(false);
    }, "Annotation deleted.");
  };

  const openCommandModalFromSelection = (selectedContent: string) => {
    const content = selectedContent.trimEnd();
    if (content.trim().length === 0) {
      setNotice({ kind: "error", text: "Select a block before creating a command." });
      return;
    }

    setForm({
      ...emptyForm(categoryFilter || categories[0]?.id || ""),
      content,
      language: annotationForm.language
    });
    setCommandModalOpen(true);
    setNotice(null);
  };

  const saveCommandFromModal = async () => {
    const validationMessage = commandSaveValidationMessage(form);
    if (validationMessage !== null) {
      showValidationNotice(validationMessage);
      return;
    }

    await runAction(async () => {
      const command = await window.bucketCommand.createCommand({
        title: form.title,
        content: form.content,
        category: { id: form.categoryId, name: form.categoryId },
        alias: form.alias.trim() === "" ? null : form.alias,
        note: form.note === "" ? null : form.note,
        language: form.language
      });
      setCommandModalOpen(false);
      setWorkspaceMode("commands");
      setSelectedId(command.id);
      setMode("view");
      await loadAll();
    }, "Command created from annotation.");
  };

  const saveAnnotationAsCommand = async () => {
    const title = annotationForm.title.trim();
    if (title.length === 0) {
      showValidationNotice("Please enter an annotation title before saving to the library.");
      return;
    }

    if (annotationForm.content.trim().length === 0) {
      showValidationNotice("Please add command content before saving.");
      return;
    }

    await runAction(async () => {
      const existing = categories.find((category) => {
        const normalizedName = category.name.toLocaleLowerCase();
        return normalizedName === "notes" || normalizedName === "anotações" || normalizedName === "anotacoes";
      });
      const category = existing ?? await window.bucketCommand.createCategory({ name: "Notes", iconKey: "code" });
      const command = await window.bucketCommand.createCommand({
        title,
        content: annotationForm.content,
        category: { id: category.id, name: category.name },
        alias: null,
        note: annotationForm.note === "" ? null : annotationForm.note,
        language: annotationForm.language
      });
      setSaveAnnotationModalOpen(false);
      setWorkspaceMode("commands");
      setCategoryFilter(category.id);
      setSelectedId(command.id);
      await loadAll();
    }, "Annotation saved to library.");
  };

  const exportLibrary = async () => {
    try {
      const result = await window.bucketCommand.exportLibrary();

      if (result.canceled) {
        setNotice({ kind: "ok", text: "Export canceled." });
        return;
      }

      setNotice({
        kind: "ok",
        text: `Library exported to ${result.path} (${result.summary?.categories ?? 0} categories, ${result.summary?.commands ?? 0} commands, ${result.summary?.sequences ?? 0} sequences, ${result.summary?.annotations ?? 0} annotations).`
      });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unknown error." });
    }
  };

  const importLibrary = async () => {
    try {
      const result = await window.bucketCommand.importLibrary();

      if (result.canceled) {
        setNotice({ kind: "ok", text: "Import canceled." });
        return;
      }

      await loadAll();
      setNotice({
        kind: "ok",
        text: `Library imported from ${result.path} (${result.summary?.categories ?? 0} categories, ${result.summary?.commands ?? 0} commands, ${result.summary?.sequences ?? 0} sequences, ${result.summary?.annotations ?? 0} annotations).`
      });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unknown error." });
    }
  };

  const backupLibrary = async () => {
    try {
      const result = await window.bucketCommand.backupLibrary();

      if (result.canceled) {
        setNotice({ kind: "ok", text: "Backup canceled." });
        return;
      }

      setNotice({
        kind: "ok",
        text: `Local backup created at ${result.path} (${result.summary?.categories ?? 0} categories, ${result.summary?.commands ?? 0} commands, ${result.summary?.sequences ?? 0} sequences, ${result.summary?.annotations ?? 0} annotations).`
      });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unknown error." });
    }
  };

  const chooseAutomaticBackupFolder = async () => {
    try {
      const result = await window.bucketCommand.chooseBackupFolder();
      if (result.canceled || result.path === undefined) return;
      setBackupPreferencesForm((current) => ({ ...current, destinationFolder: result.path as string }));
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unknown error." });
    }
  };

  const saveAutomaticBackupPreferences = async () => {
    const validationMessage = backupPreferencesValidationMessage(backupPreferencesForm);
    if (validationMessage !== null) {
      showValidationNotice(validationMessage);
      return;
    }

    await runAction(async () => {
      const status = await window.bucketCommand.saveBackupPreferences(backupPreferencesForm);
      setBackupStatus(status);
      setBackupPreferencesForm(toBackupPreferencesInput(status.preferences));
    }, "Automatic backup settings saved.");
  };

  useEffect(() => {
    return window.bucketCommand.onMenuAction((action: MenuAction) => {
      if (action === "export-library") void exportLibrary();
      else if (action === "import-library") void importLibrary();
      else if (action === "backup-library") void backupLibrary();
      else if (action === "backup-settings") {
        setNotice(null);
        setBackupSettingsOpen(true);
      }
    });
  }, []);

  const startNewCommand = () => {
    setWorkspaceMode("commands");
    setSelectedId(null);
    setForm(emptyForm(categoryFilter || categories[0]?.id || ""));
    setMode("new");
    setNotice(null);
  };

  const cancelEditing = () => {
    if (mode === "new") {
      setMode("view");
      setSelectedId(commands[0]?.id ?? null);
    } else if (selectedCommand !== null) {
      setForm(formFromCommand(selectedCommand));
      setMode("view");
    }
    setNotice(null);
  };

  const isEditing = mode !== "view";
  const displayCommand = selectedCommand;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-mark" title="Bucket Command">
          <img alt="Bucket Command" src={logoUrl} />
        </div>
        <div className="workspace-switch" aria-label="Workspace">
          <button className={workspaceMode === "commands" ? "workspace-tab active" : "workspace-tab"} onClick={openCodeWorkspace}>
            <Code2 size={17} />
            Code
          </button>
          <button className={workspaceMode === "annotations" ? "workspace-tab active" : "workspace-tab"} onClick={openAnnotationWorkspace}>
            <FileText size={17} />
            Notes
          </button>
        </div>
        {workspaceMode === "commands" ? (
          <label className="global-search">
            <Search size={18} />
            <input aria-label="Search commands" placeholder="Search commands..." value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        ) : (
          <label className="global-search">
            <Search size={18} />
            <input
              aria-label="Search annotations"
              placeholder="Search annotations..."
              value={annotationQuery}
              onChange={(event) => setAnnotationQuery(event.target.value)}
            />
          </label>
        )}
        <div className="header-actions">
          {workspaceMode === "commands" ? (
            <>
              <select aria-label="Filter by language" value={languageFilter} onChange={(event) => setLanguageFilter(event.target.value)}>
                <option value="">All languages</option>
                {languageGroups.map((group) => (
                  <optgroup key={group} label={group}>
                    {languageOptions
                      .filter((option) => option.group === group)
                      .map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </optgroup>
                ))}
              </select>
              <button
                className="icon-button action-button"
                aria-label="Refresh commands"
                title="Refresh"
                style={actionButtonStyle("refresh")}
                onClick={() => void runAction(loadAll)}
              >
                <RefreshCw size={17} />
              </button>
              <button className="primary-button action-button" style={actionButtonStyle("new-command")} onClick={startNewCommand}>
                <Plus size={17} />
                New Command
              </button>
            </>
          ) : (
            <>
              <button
                className="icon-button action-button"
                aria-label="Refresh annotations"
                title="Refresh"
                style={actionButtonStyle("refresh-annotations")}
                onClick={() => void runAction(loadAll)}
              >
                <RefreshCw size={17} />
              </button>
              <button className="primary-button action-button" style={actionButtonStyle("new-annotation")} onClick={startNewAnnotation}>
                <Plus size={17} />
                New Annotation
              </button>
            </>
          )}
        </div>
      </header>

      {backupSettingsOpen && (
        <div className="modal-backdrop" onClick={() => setBackupSettingsOpen(false)}>
          <div
            className="modal-panel"
            role="dialog"
            aria-label="Automatic backup settings"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Automatic backup</h2>
              <button className="icon-button" aria-label="Close automatic backup settings" onClick={() => setBackupSettingsOpen(false)}>
                <X size={16} />
              </button>
            </div>

            {backupStatus?.warning !== null && backupStatus?.warning !== undefined && (
              <div role="status" className="notice error modal-notice">{backupStatus.warning}</div>
            )}
            {backupStatus?.lastError !== null && backupStatus?.lastError !== undefined && (
              <div role="status" className="notice error modal-notice">Last automatic backup failed: {backupStatus.lastError}</div>
            )}
            {notice !== null && <div role="status" className={notice.kind === "error" ? "notice error modal-notice" : "notice ok modal-notice"}>{notice.text}</div>}

            <label className="checkbox-field">
              <input
                type="checkbox"
                aria-label="Backup when closing the app"
                checked={backupPreferencesForm.backupOnQuit}
                onChange={(event) => setBackupPreferencesForm((current) => ({ ...current, backupOnQuit: event.target.checked }))}
              />
              Backup automatically when closing the app
            </label>

            <label className="checkbox-field">
              <input
                type="checkbox"
                aria-label="Backup on a schedule"
                checked={backupPreferencesForm.scheduledBackupEnabled}
                onChange={(event) => setBackupPreferencesForm((current) => ({ ...current, scheduledBackupEnabled: event.target.checked }))}
              />
              Backup automatically on a schedule
            </label>

            <div className="form-grid">
              <label>
                Interval (hours)
                <input
                  type="number"
                  min={1}
                  aria-label="Backup interval in hours"
                  value={backupPreferencesForm.intervalHours}
                  onChange={(event) =>
                    setBackupPreferencesForm((current) => ({ ...current, intervalHours: Number(event.target.value) }))
                  }
                />
              </label>
              <label>
                Copies to keep
                <input
                  type="number"
                  min={1}
                  aria-label="Maximum automatic backups to keep"
                  value={backupPreferencesForm.maxAutoBackups}
                  onChange={(event) =>
                    setBackupPreferencesForm((current) => ({ ...current, maxAutoBackups: Number(event.target.value) }))
                  }
                />
              </label>
            </div>

            <div className="folder-row">
              <span className="folder-path">{backupPreferencesForm.destinationFolder ?? "No folder selected"}</span>
              <button className="secondary-button" onClick={() => void chooseAutomaticBackupFolder()}>
                <FolderOpen size={16} />
                Choose folder
              </button>
            </div>

            <div className="backup-status">
              Last automatic backup:{" "}
              {backupStatus?.preferences.lastAutoBackupAt ? formatDateTime(backupStatus.preferences.lastAutoBackupAt) : "Never"}
            </div>

            <div className="detail-actions">
              <button className="primary-button" onClick={() => void saveAutomaticBackupPreferences()}>
                <Save size={17} />
                Save
              </button>
              <button className="secondary-button" onClick={() => setBackupSettingsOpen(false)}>
                <X size={17} />
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {commandModalOpen && (
        <div className="modal-backdrop" onClick={() => setCommandModalOpen(false)}>
          <div className="modal-panel command-modal-panel" role="dialog" aria-label="Create command from annotation" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>Create command</h2>
              <button className="icon-button" aria-label="Close command modal" onClick={() => setCommandModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            {notice !== null && <div role="status" className={notice.kind === "error" ? "notice error" : "notice ok"}>{notice.text}</div>}
            <div className="form-grid">
              <label>Title<input aria-label="Command title" maxLength={maxTitleLength} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
              <label>Alias<input aria-label="Command alias" value={form.alias} onChange={(event) => setForm({ ...form, alias: event.target.value })} /></label>
              <label>Category<select aria-label="Command category" value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>
                <option value="">Select</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select></label>
              <label>Language<select aria-label="Command language" value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value as CommandLanguage })}>
                {languageGroups.map((group) => (
                  <optgroup key={group} label={group}>
                    {languageOptions
                      .filter((option) => option.group === group)
                      .map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </optgroup>
                ))}
              </select></label>
            </div>
            <label className="notes-field">Notes<textarea aria-label="Command note" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
            <section className="content-section modal-content-editor" aria-label="Selected command content">
              <div className="section-label"><span>Content</span></div>
              <div className="editor-frame">
                <Editor
                  key={`modal-command-${form.language}`}
                  height="100%"
                  language={monacoLanguageFor(form.language)}
                  onChange={(value: string | undefined) => setForm({ ...form, content: value ?? "" })}
                  options={{ ariaLabel: "Selected content", automaticLayout: true, fontFamily: "JetBrains Mono, Consolas, monospace", fontSize: 13, lineNumbers: "on", minimap: { enabled: false }, padding: { top: 12, bottom: 12 }, scrollBeyondLastLine: false, tabSize: 2, wordWrap: "on" }}
                  theme="vs-dark"
                  value={form.content}
                />
              </div>
            </section>
            <div className="detail-actions">
              <button className="primary-button" onClick={() => void saveCommandFromModal()}><Save size={17} />Save</button>
              <button className="secondary-button" onClick={() => setCommandModalOpen(false)}><X size={17} />Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div
        className={[
          workspaceMode === "annotations" ? "annotation-workspace-layout" : "three-panel-layout",
          categoryPanelCollapsed && workspaceMode === "commands" ? "category-collapsed-layout" : "",
          commandPanelCollapsed ? "command-collapsed-layout" : ""
        ].filter(Boolean).join(" ")}
      >
        {workspaceMode === "commands" && (
        <aside className={categoryPanelCollapsed ? "category-panel collapsed" : "category-panel"} aria-label="Categories">
          <div className="panel-heading">
            <span className="panel-title">Categories</span>
            <span className="panel-count">{categories.length}</span>
            <button
              className="icon-button panel-collapse-button"
              aria-label={categoryPanelCollapsed ? "Expand categories" : "Collapse categories"}
              title={categoryPanelCollapsed ? "Expand categories" : "Collapse categories"}
              onClick={() => setCategoryPanelCollapsed((current) => !current)}
            >
              {categoryPanelCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
            </button>
          </div>
          <div className="category-list">
            {categories.map((category) => (
              <div className="category-row" key={category.id}>
                {editingCategoryId === category.id ? (
                  <div className="category-edit-form">
                    <input
                      aria-label={`Edit ${category.name}`}
                      autoFocus
                      value={editingCategoryName}
                      onChange={(event) => setEditingCategoryName(event.target.value)}
                    />
                    <select
                      aria-label={`Icon for ${category.name}`}
                      value={editingCategoryIconKey}
                      onChange={(event) => setEditingCategoryIconKey(event.target.value as CategoryIconKey | "")}
                    >
                      <option value="">Auto icon</option>
                      {categoryIconOptions.map((iconKey) => <option key={iconKey} value={iconKey}>{iconLabels[iconKey]}</option>)}
                    </select>
                    <button className="icon-button" aria-label="Save category" title="Save category" onClick={() => void updateCategory(category.id)}>
                      <Save size={15} />
                    </button>
                    <button className="icon-button" aria-label="Cancel category edit" title="Cancel" onClick={() => setEditingCategoryId(null)}>
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      className={categoryFilter === category.id ? "category-select active" : "category-select"}
                      onClick={() => setCategoryFilter(categoryFilter === category.id ? "" : category.id)}
                      title={category.name}
                    >
                      <span className="category-icon">{categoryIcon(category.name, category.iconKey)}</span>
                      <span className="category-name">{category.name}</span>
                      <span className="category-count">{categoryCounts.get(category.id) ?? 0}</span>
                    </button>
                    <div className="category-actions">
                      <button
                        className="icon-button"
                        aria-label={`Edit category ${category.name}`}
                        title="Edit category"
                        onClick={() => {
                          setEditingCategoryId(category.id);
                          setEditingCategoryName(category.name);
                          setEditingCategoryIconKey(category.iconKey ?? "");
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button className="icon-button danger-icon" aria-label={`Delete category ${category.name}`} title="Delete category" onClick={() => void deleteCategory(category.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {!categoryPanelCollapsed && <div className="category-footer">
            {addingCategory ? (
              <form
                className="new-category-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void createCategory();
                }}
              >
                <input aria-label="New category name" autoFocus placeholder="Category name" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} />
                <select
                  aria-label="New category icon"
                  value={categoryIconKey}
                  onChange={(event) => setCategoryIconKey(event.target.value as CategoryIconKey | "")}
                >
                  <option value="">Auto icon</option>
                  {categoryIconOptions.map((iconKey) => <option key={iconKey} value={iconKey}>{iconLabels[iconKey]}</option>)}
                </select>
                <button className="icon-button" aria-label="Add category" title="Add category" type="submit"><Save size={15} /></button>
                <button className="icon-button" aria-label="Cancel new category" title="Cancel" type="button" onClick={() => setAddingCategory(false)}><X size={15} /></button>
              </form>
            ) : (
              <button className="new-category-button" onClick={() => setAddingCategory(true)}>
                <Plus size={17} />
                New Category
              </button>
            )}
            <div className="library-summary">{categories.length} categories · {allCommands.length} commands</div>
          </div>}
        </aside>
        )}

        <section className={commandPanelCollapsed ? "command-panel collapsed" : "command-panel"} aria-label={workspaceMode === "annotations" ? "Annotation list" : "Command list"}>
          <div className="panel-heading">
            {commandPanelCollapsed ? (
              <button
                className="icon-button panel-collapse-button"
                aria-label={workspaceMode === "annotations" ? "Expand annotations" : "Expand commands"}
                title={workspaceMode === "annotations" ? "Expand annotations" : "Expand commands"}
                onClick={() => setCommandPanelCollapsed(false)}
              >
                <ChevronRight size={15} />
              </button>
            ) : null}
            {!commandPanelCollapsed && (workspaceMode === "annotations" ? (
              <>
                <span>{filteredAnnotations.length} annotations</span>
                <span className="panel-heading-actions">
                  <button className="mini-add-button" onClick={startNewAnnotation}><Plus size={14} />New</button>
                  <button
                    className="icon-button panel-collapse-button"
                    aria-label="Collapse annotations"
                    title="Collapse annotations"
                    onClick={() => setCommandPanelCollapsed(true)}
                  >
                    <ChevronLeft size={15} />
                  </button>
                </span>
              </>
            ) : (
              <>
                <span>{commands.length} commands</span>
                <span className="panel-heading-actions">
                  <span>{categoryFilter === "" ? "All categories" : categories.find((item) => item.id === categoryFilter)?.name}</span>
                  <button
                    className="icon-button panel-collapse-button"
                    aria-label="Collapse commands"
                    title="Collapse commands"
                    onClick={() => setCommandPanelCollapsed(true)}
                  >
                    <ChevronLeft size={15} />
                  </button>
                </span>
              </>
            ))}
          </div>
          {!commandPanelCollapsed && <div className="command-list">
            {workspaceMode === "annotations" ? (
              annotations.length === 0 ? (
                <button className="command-item annotation-empty-item" onClick={startNewAnnotation}>
                  <span className="command-title">Untitled</span>
                  <span className="command-summary">Start a scratch note</span>
                </button>
              ) : filteredAnnotations.length === 0 ? (
                <div className="empty-list">No annotations match the current search.</div>
              ) : filteredAnnotations.map((annotation) => (
                <button className={selectedAnnotationId === annotation.id ? "command-item active" : "command-item"} key={annotation.id} onClick={() => selectAnnotation(annotation.id)}>
                  <span className="command-title">{annotation.title ?? "Untitled"}</span>
                  <span className="command-summary">{annotation.note || annotation.content.split("\n")[0] || "Draft annotation"}</span>
                  <span className="command-meta">
                    <span className={chipClassName("language")} data-chip-kind="language" data-language={annotation.language} style={chipStyle("language", annotation.language)}>{annotation.language}</span>
                    <time dateTime={annotation.updatedAt}>{formatDate(annotation.updatedAt)}</time>
                  </span>
                </button>
              ))
            ) : commands.length === 0 ? (
              <div className="empty-list">No commands match the current filters.</div>
            ) : commands.map((command) => (
              <button className={selectedId === command.id ? "command-item active" : "command-item"} key={command.id} onClick={() => selectCommand(command.id)}>
                <span className="command-title">{command.title}</span>
                <span className="command-summary">{command.note || command.alias || "No notes"}</span>
                <span className="command-meta">
                  <span className={chipClassName("category")} data-chip-kind="category" style={chipStyle("category", command.categoryName)}>{command.categoryName}</span>
                  <span className={chipClassName("language")} data-chip-kind="language" data-language={command.language} style={chipStyle("language", command.language)}>{command.language}</span>
                  <time dateTime={command.updatedAt}>{formatDate(command.updatedAt)}</time>
                </span>
              </button>
            ))}
          </div>}
        </section>

        <section className="detail-panel" aria-label={workspaceMode === "annotations" ? "Annotation details" : "Command details"}>
          {notice !== null && <div role="status" className={notice.kind === "error" ? "notice error" : "notice ok"}>{notice.text}</div>}

          {workspaceMode === "annotations" ? (
            <div className="detail-content edit-mode annotation-mode">
              <div className="detail-title-row">
                <div>
                  <span className="eyebrow">
                    Note · {annotationSaveState === "saving" ? "saving" : annotationSaveState === "error" ? "save error" : annotationForm.id === null ? "draft" : "saved"} ·{" "}
                    <span className={chipClassName("language")} data-chip-kind="language" data-language={annotationForm.language} style={chipStyle("language", annotationForm.language)}>{annotationForm.language}</span>
                  </span>
                  <h1>{annotationForm.title.trim() || "Untitled"}</h1>
                </div>
                <button className="icon-button" aria-label="New annotation" title="New annotation" onClick={startNewAnnotation}>
                  <Plus size={18} />
                </button>
              </div>

              <div className="form-grid">
                <label>Title<input aria-label="Annotation title" maxLength={maxTitleLength} value={annotationForm.title} onChange={(event) => setAnnotationForm({ ...annotationForm, title: event.target.value })} /></label>
                <label>Language<select aria-label="Annotation language" value={annotationForm.language} onChange={(event) => setAnnotationForm({ ...annotationForm, language: event.target.value as CommandLanguage })}>
                  {languageGroups.map((group) => (
                    <optgroup key={group} label={group}>
                      {languageOptions
                        .filter((option) => option.group === group)
                        .map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </optgroup>
                  ))}
                </select></label>
              </div>

              <section className="content-section annotation-editor-section" aria-label="Annotation editor">
                <div className="section-label">
                  <span>Scratch</span>
                </div>
                <div className="detail-actions">
                  <button
                    className="secondary-button"
                    disabled={!canFormat(annotationForm.language)}
                    title={canFormat(annotationForm.language) ? "Format annotation content" : `Pretty is not available for ${annotationForm.language}.`}
                    onClick={() => void prettyFormatAnnotation()}
                  >
                    <Sparkles size={17} />
                    Pretty
                  </button>
                  {saveAnnotationModalOpen ? (
                    <>
                      <button className="primary-button" onClick={() => void saveAnnotationAsCommand()}><Save size={17} />Confirm save</button>
                      <button className="secondary-button" onClick={() => setSaveAnnotationModalOpen(false)}><X size={17} />Discard</button>
                    </>
                  ) : (
                    <button className="secondary-button" onClick={() => setSaveAnnotationModalOpen(true)}>
                      <Save size={17} />
                      Save to Library
                    </button>
                  )}
                  {annotationForm.id !== null && <button className="danger-button" onClick={() => void deleteAnnotation()}><Trash2 size={17} />Delete</button>}
                </div>
                <div className="editor-frame annotation-editor-frame">
                  <Editor
                    height="100%"
                    language={monacoLanguageFor(annotationForm.language)}
                    onChange={(value: string | undefined) => setAnnotationForm({ ...annotationForm, content: value ?? "" })}
                    onMount={(editor) => {
                      editor.addAction({
                        id: "bucket-command-create-command-from-selection",
                        label: "Create command from selection",
                        contextMenuGroupId: "navigation",
                        contextMenuOrder: 1,
                        run: () => {
                          const model = editor.getModel();
                          const selection = editor.getSelection();
                          if (model === null || selection === null || selection.isEmpty()) {
                            openCommandModalFromSelection("");
                            return;
                          }
                          openCommandModalFromSelection(model.getValueInRange(selection));
                        }
                      });
                    }}
                    options={{ ariaLabel: "Annotation content", automaticLayout: true, fontFamily: "JetBrains Mono, Consolas, monospace", fontSize: 14, lineNumbers: "on", minimap: { enabled: true }, padding: { top: 16, bottom: 16 }, scrollBeyondLastLine: false, tabSize: 2, wordWrap: "on" }}
                    theme="vs-dark"
                    value={annotationForm.content}
                  />
                </div>
              </section>

              <label className="notes-field">Notes<textarea aria-label="Annotation note" value={annotationForm.note} onChange={(event) => setAnnotationForm({ ...annotationForm, note: event.target.value })} /></label>
            </div>
          ) : isEditing ? (
            <div className="detail-content edit-mode">
              <div className="detail-title-row">
                <div>
                  <span className="eyebrow">{mode === "new" ? "New command" : "Editing command"}</span>
                  <h1>{mode === "new" ? "Create a command" : form.title || "Untitled command"}</h1>
                </div>
              </div>

              <div className="form-grid">
                <label>Title<input aria-label="Title" maxLength={maxTitleLength} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
                <label>Alias<input aria-label="Alias" value={form.alias} onChange={(event) => setForm({ ...form, alias: event.target.value })} /></label>
                <label>Category<select aria-label="Category" value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>
                  <option value="">Select</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select></label>
                <label>Language<select aria-label="Language" value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value as CommandLanguage })}>
                  {languageGroups.map((group) => (
                    <optgroup key={group} label={group}>
                      {languageOptions
                        .filter((option) => option.group === group)
                        .map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </optgroup>
                  ))}
                </select></label>
              </div>

              <section className="content-section" aria-label="Command content editor">
                <div className="section-label">
                  <span>Command</span>
                  <span className={chipClassName("language")} data-chip-kind="language" data-language={form.language} style={chipStyle("language", form.language)}>{form.language}</span>
                </div>
                <div className="detail-actions">
                  <button
                    className="secondary-button"
                    disabled={!canFormat(form.language)}
                    title={canFormat(form.language) ? "Format command content" : `Pretty is not available for ${form.language}.`}
                    onClick={() => void prettyFormatCommand()}
                  >
                    <Sparkles size={17} />
                    Pretty
                  </button>
                  <button className="primary-button" onClick={() => void saveCommand()}><Save size={17} />Save</button>
                  <button className="secondary-button" onClick={cancelEditing}><X size={17} />Cancel</button>
                  {mode === "edit" && <button className="danger-button" onClick={() => void deleteCommand()}><Trash2 size={17} />Delete</button>}
                </div>
                <div className="editor-frame">
                  <Editor
                    key={`command-editor-${form.id ?? "new"}-${form.language}`}
                    height="100%"
                    language={monacoLanguageFor(form.language)}
                    onChange={(value: string | undefined) => setForm({ ...form, content: value ?? "" })}
                    options={{ ariaLabel: "Content", automaticLayout: true, fontFamily: "JetBrains Mono, Consolas, monospace", fontSize: 14, lineNumbers: "on", minimap: { enabled: false }, padding: { top: 16, bottom: 16 }, scrollBeyondLastLine: false, tabSize: 2, wordWrap: "on" }}
                    theme="vs-dark"
                    value={form.content}
                  />
                </div>
              </section>

              <label className="notes-field">Notes<textarea aria-label="Note" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
            </div>
          ) : displayCommand === null ? (
            <div className="empty-detail"><Terminal size={38} /><h1>Select a command</h1><p>Choose a command from the list or create a new one.</p></div>
          ) : (
            <div className="detail-content view-mode">
              <div className="detail-title-row">
                <div><span className="eyebrow">Command</span><h1>{displayCommand.title}</h1></div>
                <button className="icon-button" aria-label="Edit command" title="Edit command" onClick={() => { setForm(formFromCommand(displayCommand)); setMode("edit"); }}><Pencil size={18} /></button>
              </div>
              <div className="metadata-row">
                <span className={chipClassName("category")} data-chip-kind="category" style={chipStyle("category", displayCommand.categoryName)}>{displayCommand.categoryName}</span>
                <span className={chipClassName("language")} data-chip-kind="language" data-language={displayCommand.language} style={chipStyle("language", displayCommand.language)}>{displayCommand.language}</span>
                {displayCommand.alias !== null && <span className={chipClassName("alias")} data-chip-kind="alias" style={chipStyle("alias", displayCommand.alias)}>{displayCommand.alias}</span>}
              </div>
              <section className="content-section" aria-label="Command content viewer">
                <div className="section-toolbar">
                  <span className="section-label">Command</span>
                  <div className="viewer-toolbar">
                    <dl className="timestamps compact-timestamps">
                      <div><dt>Created</dt><dd>{formatDate(displayCommand.createdAt)}</dd></div>
                      <div><dt>Updated</dt><dd>{formatDate(displayCommand.updatedAt)}</dd></div>
                    </dl>
                    <div className="detail-actions">
                      <button className="secondary-button" onClick={() => void copyCommand()}><Copy size={17} />{copyId === displayCommand.id ? "Copied" : "Copy"}</button>
                      <button className="primary-button" onClick={() => { setForm(formFromCommand(displayCommand)); setMode("edit"); }}><Pencil size={17} />Edit</button>
                      <button className="danger-button" onClick={() => void deleteCommandById(displayCommand.id)}><Trash2 size={17} />Delete</button>
                    </div>
                  </div>
                </div>
                <div className="editor-frame">
                  <Editor
                    key={`command-viewer-${displayCommand.id}-${displayCommand.language}`}
                    height="100%"
                    language={monacoLanguageFor(displayCommand.language)}
                    options={{ ariaLabel: "Content", automaticLayout: true, contextmenu: false, fontFamily: "JetBrains Mono, Consolas, monospace", fontSize: 14, lineNumbers: "on", minimap: { enabled: false }, padding: { top: 16, bottom: 16 }, readOnly: true, renderLineHighlight: "none", scrollBeyondLastLine: false, wordWrap: "on" }}
                    theme="vs-dark"
                    value={displayCommand.content}
                  />
                </div>
              </section>
              <section className="notes-display"><span className="section-label">Notes</span><p>{displayCommand.note || "No notes for this command."}</p></section>
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

createRoot(document.getElementById("root") as HTMLElement).render(<React.StrictMode><App /></React.StrictMode>);
