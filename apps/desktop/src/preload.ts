import { contextBridge, ipcRenderer } from 'electron';

const bridge = {
  getApiBaseUrl: (): Promise<string> =>
    ipcRenderer.invoke('evidence:get-api-base-url'),
  chooseDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('evidence:choose-directory'),
};

contextBridge.exposeInMainWorld('evidenceDesktop', bridge);
