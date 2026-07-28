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
  copyCommandContent: (id) => ipcRenderer.invoke(ipcChannels.commandsCopyContent, id)
};

contextBridge.exposeInMainWorld("bucketCommand", api);
