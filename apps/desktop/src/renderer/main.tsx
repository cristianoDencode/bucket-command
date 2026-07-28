import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Copy, Pencil, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import type { Category, CommandRecord, ShellTarget } from "@bucket-command/core";
import "./styles.css";

type Notice = { kind: "ok" | "error"; text: string } | null;

interface CommandFormState {
  id: string | null;
  title: string;
  content: string;
  categoryId: string;
  alias: string;
  note: string;
  shellTarget: ShellTarget;
}

const emptyForm = (categoryId = ""): CommandFormState => ({
  id: null,
  title: "",
  content: "",
  categoryId,
  alias: "",
  note: "",
  shellTarget: "bash"
});

const App = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [commands, setCommands] = useState<CommandRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [shellFilter, setShellFilter] = useState("");
  const [form, setForm] = useState<CommandFormState>(emptyForm());
  const [notice, setNotice] = useState<Notice>(null);
  const [copyId, setCopyId] = useState<string | null>(null);

  const selectedCommand = useMemo(
    () => commands.find((command) => command.id === selectedId) ?? null,
    [commands, selectedId]
  );

  const loadAll = async () => {
    const [nextCategories, nextCommands] = await Promise.all([
      window.bucketCommand.listCategories(),
      window.bucketCommand.listCommands({
        query,
        category: categoryFilter === "" ? undefined : { id: categoryFilter, name: categoryFilter },
        shellTarget: shellFilter === "" ? undefined : (shellFilter as ShellTarget)
      })
    ]);
    setCategories(nextCategories);
    setCommands(nextCommands);
    setSelectedId((current) =>
      current !== null && nextCommands.some((command) => command.id === current) ? current : nextCommands[0]?.id ?? null
    );
    setForm((current) => (current.id === null ? { ...current, categoryId: current.categoryId || nextCategories[0]?.id || "" } : current));
  };

  useEffect(() => {
    void runAction(loadAll);
  }, [query, categoryFilter, shellFilter]);

  useEffect(() => {
    if (selectedCommand !== null) {
      setForm({
        id: selectedCommand.id,
        title: selectedCommand.title,
        content: selectedCommand.content,
        categoryId: selectedCommand.categoryId,
        alias: selectedCommand.alias ?? "",
        note: selectedCommand.note ?? "",
        shellTarget: selectedCommand.shellTarget
      });
    }
  }, [selectedCommand]);

  const runAction = async (action: () => Promise<void>, ok?: string) => {
    try {
      await action();
      setNotice(ok === undefined ? null : { kind: "ok", text: ok });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unknown error." });
    }
  };

  const createCategory = async () => {
    await runAction(async () => {
      const category = await window.bucketCommand.createCategory({ name: categoryName });
      setCategoryName("");
      setCategoryFilter(category.id);
      await loadAll();
    }, "Category saved.");
  };

  const updateCategory = async (id: string) => {
    await runAction(async () => {
      await window.bucketCommand.updateCategory(id, { name: editingCategoryName });
      setEditingCategoryId(null);
      setEditingCategoryName("");
      await loadAll();
    }, "Category updated.");
  };

  const deleteCategory = async (id: string) => {
    await runAction(async () => {
      await window.bucketCommand.deleteCategory(id);
      if (categoryFilter === id) {
        setCategoryFilter("");
      }
      await loadAll();
    }, "Category deleted.");
  };

  const saveCommand = async () => {
    await runAction(async () => {
      const payload = {
        title: form.title,
        content: form.content,
        category: { id: form.categoryId, name: form.categoryId },
        alias: form.alias.trim() === "" ? null : form.alias,
        note: form.note === "" ? null : form.note,
        shellTarget: form.shellTarget
      };

      const command =
        form.id === null
          ? await window.bucketCommand.createCommand(payload)
          : await window.bucketCommand.updateCommand(form.id, payload);

      setSelectedId(command.id);
      await loadAll();
    }, "Command saved.");
  };

  const deleteCommand = async () => {
    if (form.id === null) {
      return;
    }

    await runAction(async () => {
      await window.bucketCommand.deleteCommand(form.id as string);
      setForm(emptyForm(categories[0]?.id ?? ""));
      setSelectedId(null);
      await loadAll();
    }, "Command deleted.");
  };

  const copyCommand = async () => {
    if (form.id === null) {
      return;
    }

    await runAction(async () => {
      await window.bucketCommand.copyCommandContent(form.id as string);
      setCopyId(form.id);
      window.setTimeout(() => setCopyId(null), 1200);
    }, "Copied.");
  };

  const startNewCommand = () => {
    setSelectedId(null);
    setForm(emptyForm(categoryFilter || categories[0]?.id || ""));
  };

  return (
    <main className="shell">
      <aside className="categories" aria-label="Categories">
        <div className="brand">
          <span className="mark">BC</span>
          <div>
            <h1>Bucket Command</h1>
            <p>{commands.length} commands</p>
          </div>
        </div>

        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            void createCategory();
          }}
        >
          <input
            aria-label="New category name"
            placeholder="New category"
            value={categoryName}
            onChange={(event) => setCategoryName(event.target.value)}
          />
          <button aria-label="Add category" title="Add category" type="submit">
            <Plus size={17} />
          </button>
        </form>

        <div className="category-list">
          {categories.map((category) => (
            <div className="category-row" key={category.id}>
              {editingCategoryId === category.id ? (
                <>
                  <input
                    aria-label={`Edit ${category.name}`}
                    value={editingCategoryName}
                    onChange={(event) => setEditingCategoryName(event.target.value)}
                  />
                  <button aria-label="Save category" title="Save category" onClick={() => void updateCategory(category.id)}>
                    <Save size={16} />
                  </button>
                  <button aria-label="Cancel category edit" title="Cancel" onClick={() => setEditingCategoryId(null)}>
                    <X size={16} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    className={categoryFilter === category.id ? "category-pill active" : "category-pill"}
                    onClick={() => setCategoryFilter(categoryFilter === category.id ? "" : category.id)}
                  >
                    {category.name}
                  </button>
                  <button
                    aria-label={`Edit category ${category.name}`}
                    title="Edit category"
                    onClick={() => {
                      setEditingCategoryId(category.id);
                      setEditingCategoryName(category.name);
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                  <button aria-label={`Delete category ${category.name}`} title="Delete category" onClick={() => void deleteCategory(category.id)}>
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </aside>

      <section className="workspace">
        <header className="toolbar">
          <label className="search">
            <Search size={18} />
            <input
              aria-label="Search commands"
              placeholder="Search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select aria-label="Filter by shell" value={shellFilter} onChange={(event) => setShellFilter(event.target.value)}>
            <option value="">All shells</option>
            <option value="bash">bash</option>
            <option value="powershell">powershell</option>
            <option value="other">other</option>
          </select>
          <button title="Refresh" onClick={() => void runAction(loadAll)}>
            <RefreshCw size={17} />
            Refresh
          </button>
          <button onClick={startNewCommand}>
            <Plus size={17} />
            New
          </button>
        </header>

        {notice !== null && <div className={notice.kind === "error" ? "notice error" : "notice ok"}>{notice.text}</div>}

        <div className="grid">
          <section className="command-list" aria-label="Command list">
            {commands.map((command) => (
              <button
                className={selectedId === command.id ? "command-item active" : "command-item"}
                key={command.id}
                onClick={() => setSelectedId(command.id)}
              >
                <span className="command-title">{command.title}</span>
                <span className="command-meta">
                  {command.alias ?? "-"} · {command.categoryName} · {command.shellTarget}
                </span>
              </button>
            ))}
          </section>

          <section className="details" aria-label="Command details">
            <div className="form-row">
              <label>
                Title
                <input aria-label="Title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
              </label>
              <label>
                Alias
                <input aria-label="Alias" value={form.alias} onChange={(event) => setForm({ ...form, alias: event.target.value })} />
              </label>
            </div>

            <div className="form-row">
              <label>
                Category
                <select aria-label="Category" value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>
                  <option value="">Select</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Shell
                <select
                  aria-label="Shell"
                  value={form.shellTarget}
                  onChange={(event) => setForm({ ...form, shellTarget: event.target.value as ShellTarget })}
                >
                  <option value="bash">bash</option>
                  <option value="powershell">powershell</option>
                  <option value="other">other</option>
                </select>
              </label>
            </div>

            <label>
              Note
              <input aria-label="Note" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
            </label>

            <label className="content-field">
              Content
              <textarea aria-label="Content" value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} />
            </label>

            <div className="actions">
              <button onClick={() => void saveCommand()}>
                <Save size={17} />
                Save
              </button>
              <button disabled={form.id === null} onClick={() => void copyCommand()}>
                <Copy size={17} />
                {copyId === form.id ? "Copied" : "Copy"}
              </button>
              <button disabled={form.id === null} onClick={() => void deleteCommand()}>
                <Trash2 size={17} />
                Delete
              </button>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
};

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
