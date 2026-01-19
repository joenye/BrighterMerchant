import { readFileSync } from 'fs';
import { join } from 'path';

// Read version from package.json at runtime
function getPackageVersion(): string {
  try {
    // In development: relative to src/app/
    // In production: relative to dist/app/
    const paths = [
      join(__dirname, '../../package.json'),
      join(__dirname, '../../../package.json'),
    ];
    
    for (const p of paths) {
      try {
        const pkg = JSON.parse(readFileSync(p, 'utf-8'));
        if (pkg.version) return pkg.version;
      } catch {
        // Try next path
      }
    }
  } catch {
    // Fallback
  }
  return 'unknown';
}

// Git commit hash - injected at build time, fallback for dev
// This gets replaced by the build script
const GIT_COMMIT = '__GIT_COMMIT__';

function getGitCommit(): string {
  if (GIT_COMMIT !== '__GIT_COMMIT__') {
    return GIT_COMMIT;
  }
  
  // In development, try to read from git
  try {
    const { execSync } = require('child_process');
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'dev';
  }
}

export const APP_VERSION = getPackageVersion();
export const GIT_HASH = getGitCommit();
export const VERSION_STRING = `${APP_VERSION} (${GIT_HASH})`;
