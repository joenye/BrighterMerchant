import * as path from 'path';
import * as os from 'os';

// App name - change this when renaming the app
const APP_NAME = 'Brighter Merchant';

/**
 * Get the platform-appropriate application data directory
 * 
 * Best practices per platform:
 * - macOS: ~/Library/Application Support/<app>
 * - Windows: %APPDATA%/<app> (e.g., C:\Users\<user>\AppData\Roaming\<app>)
 * - Linux: ~/.local/share/<app> (XDG_DATA_HOME)
 */
export function getAppDataDir(): string {
  const platform = process.platform;
  
  if (platform === 'darwin') {
    // macOS: ~/Library/Application Support/<app>
    return path.join(os.homedir(), 'Library', 'Application Support', APP_NAME);
  } else if (platform === 'win32') {
    // Windows: %APPDATA%/<app>
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), APP_NAME);
  } else {
    // Linux/other: ~/.local/share/<app> (XDG_DATA_HOME)
    const xdgDataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
    return path.join(xdgDataHome, APP_NAME);
  }
}

/**
 * Get the logs directory
 */
export function getLogsDir(): string {
  return path.join(getAppDataDir(), 'logs');
}

/**
 * Get the config directory
 */
export function getConfigDir(): string {
  return getAppDataDir();
}
