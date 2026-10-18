import { contextBridge, ipcRenderer } from 'electron'
import type { LauncherApi, PatchProgress, PivotProgress } from '../shared/types'

const api: LauncherApi = {
  getState: () => ipcRenderer.invoke('state:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  chooseFolder: (title) => ipcRenderer.invoke('dialog:folder', title),
  checkUpdates: () => ipcRenderer.invoke('update:check'),
  runUpdate: (opts) => ipcRenderer.invoke('update:run', opts ?? {}),
  cancelUpdate: () => ipcRenderer.invoke('update:cancel'),
  onPatchProgress: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, p: PatchProgress): void => cb(p)
    ipcRenderer.on('update:progress', listener)
    return () => ipcRenderer.removeListener('update:progress', listener)
  },
  getNews: () => ipcRenderer.invoke('news:get'),
  listAddons: () => ipcRenderer.invoke('addons:list'),
  getSavedCredentials: () => ipcRenderer.invoke('creds:get'),
  launch: (req) => ipcRenderer.invoke('game:launch', req),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
  createAccount: (username, password) => ipcRenderer.invoke('account:create', username, password),
  changePassword: (username, password, newPassword) => ipcRenderer.invoke('account:changePassword', username, password, newPassword),
  pivotList: () => ipcRenderer.invoke('pivot:list'),
  pivotInstall: (id) => ipcRenderer.invoke('pivot:install', id),
  pivotCancel: (id) => ipcRenderer.invoke('pivot:cancel', id),
  pivotRemove: (id) => ipcRenderer.invoke('pivot:remove', id),
  pivotSetEnabled: (id, enabled) => ipcRenderer.invoke('pivot:enable', id, enabled),
  pivotAddLocal: () => ipcRenderer.invoke('pivot:addLocal'),
  onPivotProgress: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, p: PivotProgress): void => cb(p)
    ipcRenderer.on('pivot:progress', listener)
    return () => ipcRenderer.removeListener('pivot:progress', listener)
  },
  wineRunners: () => ipcRenderer.invoke('wine:runners'),
  chooseWineBinary: () => ipcRenderer.invoke('wine:choose'),
  openWineLog: () => ipcRenderer.invoke('wine:log'),
  onLaunchStatus: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, msg: string): void => cb(msg)
    ipcRenderer.on('launch:status', listener)
    return () => ipcRenderer.removeListener('launch:status', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
