import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => { ipcRenderer.send('window:minimize'); },
  maximize: () => { ipcRenderer.send('window:maximize'); },
  close: () => { ipcRenderer.send('window:close'); },
  /** 监听最大化状态变化（callback 参数过 contextBridge 是合法的） */
  onMaximizeChange: (callback: (isMaximized: boolean) => void) => {
    ipcRenderer.removeAllListeners('window:maximized');
    ipcRenderer.on('window:maximized', (_event: Electron.IpcRendererEvent, val: boolean) => callback(val));
  },
  offMaximizeChange: () => {
    ipcRenderer.removeAllListeners('window:maximized');
  },
  isElectron: true,
});
