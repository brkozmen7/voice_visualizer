import { app, BrowserWindow, session, globalShortcut, ipcMain, desktopCapturer } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Bypasses browser permission popup dialogs for media streams
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Raspberry Pi / Low-spec process stability optimizations
app.commandLine.appendSwitch('disable-dev-shm-usage'); // Prevents out-of-memory crashes on small /dev/shm partitions
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512'); // Restricts JS heap size to prevent slow memory swapping on RPi

let mainWindow = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    fullscreen: true,
    kiosk: true, // Auto start in kiosk mode for the mirror
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load app
  if (!app.isPackaged) {
    // In development, load from Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    // Open DevTools in dev mode if needed
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // In production, load the built index.html from dist
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }

  // Handle window closing
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Register developer shortcuts (F11 to toggle kiosk, ESC to exit kiosk)
  globalShortcut.register('F11', () => {
    if (mainWindow) {
      const isKiosk = mainWindow.isKiosk();
      mainWindow.setKiosk(!isKiosk);
      mainWindow.setFullScreen(!isKiosk);
    }
  });

  globalShortcut.register('Escape', () => {
    if (mainWindow && mainWindow.isKiosk()) {
      mainWindow.setKiosk(false);
      mainWindow.setFullScreen(false);
    }
  });
}

app.whenReady().then(() => {
  // Handle desktop source ID queries for system audio capture
  ipcMain.handle('get-desktop-source-id', async () => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const screenSource = sources.find(src => src.id.startsWith('screen:'));
      return screenSource ? screenSource.id : null;
    } catch (err) {
      console.error('Error fetching desktop sources:', err);
      return null;
    }
  });

  // Auto-approve media permissions (Microphone/Audio) programmatically
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true); // Approve media access automatically without asking the user
    } else {
      callback(false); // Reject other permissions (like geolocation, notifications) for safety
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  // Unregister all shortcuts when quitting
  globalShortcut.unregisterAll();
});
