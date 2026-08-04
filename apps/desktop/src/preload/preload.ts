import electron from "electron";
import { ipcChannels, type DesktopApi } from "../shared/api.js";

const { contextBridge, ipcRenderer } = electron;

const api: DesktopApi = {
  listCategories: () => ipcRenderer.invoke(ipcChannels.categoriesList),
  createCategory: (input) => ipcRenderer.invoke(ipcChannels.categoriesCreate, input),
  updateCategory: (id, input) => ipcRenderer.invoke(ipcChannels.categoriesUpdate, id, input),
  deleteCategory: (id) => ipcRenderer.invoke(ipcChannels.categoriesDelete, id),
  listCommands: (filters) => ipcRenderer.invoke(ipcChannels.commandsList, filters),
  createCommand: (input) => ipcRenderer.invoke(ipcChannels.commandsCreate, input),
  updateCommand: (id, input) => ipcRenderer.invoke(ipcChannels.commandsUpdate, id, input),
  deleteCommand: (id) => ipcRenderer.invoke(ipcChannels.commandsDelete, id),
  getCommandByAlias: (alias) => ipcRenderer.invoke(ipcChannels.commandsGetByAlias, alias),
  copyCommandContent: (id) => ipcRenderer.invoke(ipcChannels.commandsCopyContent, id),
  listAnnotations: () => ipcRenderer.invoke(ipcChannels.annotationsList),
  createAnnotation: (input) => ipcRenderer.invoke(ipcChannels.annotationsCreate, input),
  updateAnnotation: (id, input) => ipcRenderer.invoke(ipcChannels.annotationsUpdate, id, input),
  deleteAnnotation: (id) => ipcRenderer.invoke(ipcChannels.annotationsDelete, id),
  exportLibrary: () => ipcRenderer.invoke(ipcChannels.libraryExport),
  importLibrary: () => ipcRenderer.invoke(ipcChannels.libraryImport),
  backupLibrary: () => ipcRenderer.invoke(ipcChannels.libraryBackup),
  getBackupPreferences: () => ipcRenderer.invoke(ipcChannels.backupPreferencesGet),
  saveBackupPreferences: (input) => ipcRenderer.invoke(ipcChannels.backupPreferencesSave, input),
  chooseBackupFolder: () => ipcRenderer.invoke(ipcChannels.backupPreferencesChooseFolder),
  onBackupPreferencesUpdated: (callback) => {
    const listener = (_event: unknown, status: unknown) => callback(status as Parameters<typeof callback>[0]);
    ipcRenderer.on(ipcChannels.backupPreferencesUpdated, listener);
    return () => ipcRenderer.removeListener(ipcChannels.backupPreferencesUpdated, listener);
  },
  onMenuAction: (callback) => {
    const listener = (_event: unknown, action: unknown) => callback(action as Parameters<typeof callback>[0]);
    ipcRenderer.on(ipcChannels.menuAction, listener);
    return () => ipcRenderer.removeListener(ipcChannels.menuAction, listener);
  }
};

contextBridge.exposeInMainWorld("bucketCommand", api);
