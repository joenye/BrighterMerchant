import * as fs from 'fs';
import * as path from 'path';
import { getLogsDir } from './paths';

let logStream: fs.WriteStream | null = null;
let logPath: string = '';

/**
 * Format a timestamp for logging (HH:MM:SS.mmm)
 */
function formatTimestamp(): string {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  const ms = now.getMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * Initialize the logger - redirects console.log/warn/error to also write to a file
 * All output gets a timestamp prefix
 */
export function initLogger(): string {
  const logDir = getLogsDir();
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Create timestamped log file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  logPath = path.join(logDir, `app-${timestamp}.log`);
  
  logStream = fs.createWriteStream(logPath, { flags: 'a' });
  
  // Write session header
  const header = `${'='.repeat(80)}\nSession started: ${new Date().toISOString()}\n${'='.repeat(80)}\n\n`;
  logStream.write(header);

  // Store original console methods
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  // Override console.log
  console.log = (...args: any[]) => {
    const ts = formatTimestamp();
    originalLog.apply(console, [`[${ts}]`, ...args]);
    writeToLog('LOG', args);
  };

  // Override console.warn
  console.warn = (...args: any[]) => {
    const ts = formatTimestamp();
    originalWarn.apply(console, [`[${ts}]`, ...args]);
    writeToLog('WARN', args);
  };

  // Override console.error
  console.error = (...args: any[]) => {
    const ts = formatTimestamp();
    originalError.apply(console, [`[${ts}]`, ...args]);
    writeToLog('ERROR', args);
  };

  return logPath;
}

function writeToLog(level: string, args: any[]): void {
  if (!logStream) return;
  
  const ts = formatTimestamp();
  const message = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
  
  logStream.write(`[${ts}] ${message}\n`);
}

/**
 * Close the log stream
 */
export function closeLogger(): void {
  if (logStream) {
    logStream.write(`\n${'='.repeat(80)}\nSession ended: ${new Date().toISOString()}\n${'='.repeat(80)}\n`);
    logStream.end();
    logStream = null;
  }
}

/**
 * Get the current log file path
 */
export function getLogPath(): string {
  return logPath;
}
