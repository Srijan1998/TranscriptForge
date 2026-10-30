import { app, BrowserWindow, shell, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { YouTubeTranscriptApi } from '../transcript.js';
import { summarize } from '../summary.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;

// Initialize YouTube API handler (direct Node.js fetch has no CORS limitations)
const api = new YouTubeTranscriptApi({
  checkPermission: async () => true // Node.js has full network access
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0f0c29',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Open external links in the user's default browser (e.g. Chrome, Edge)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('fetch-transcript', async (_event, { video, languages }) => {
  try {
    const transcript = await api.fetch(video, { languages: languages || ['en'] });
    const summary = summarize(transcript.snippets);
    return { ok: true, result: { ...transcript, summary } };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: error.code || 'FETCH_ERROR',
        message: error.message || 'Failed to fetch transcript.'
      }
    };
  }
});

ipcMain.handle('open-external', async (_event, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

ipcMain.handle('get-app-version', () => app.getVersion());

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
