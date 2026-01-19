import { net } from 'electron';
import { readFileSync } from 'fs';
import { join } from 'path';
import { APP_VERSION } from '../version';

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string | null;
  releaseUrl: string | null;
  releaseName: string | null;
  error: string | null;
}

// Read repository URL from package.json (source of truth)
function getRepositoryUrl(): string {
  try {
    const paths = [
      join(__dirname, '../../package.json'),
      join(__dirname, '../../../package.json'),
    ];
    
    for (const p of paths) {
      try {
        const pkg = JSON.parse(readFileSync(p, 'utf-8'));
        if (pkg.repository?.url) {
          // Remove .git suffix and git+ prefix if present
          return pkg.repository.url
            .replace(/\.git$/, '')
            .replace(/^git\+/, '');
        }
      } catch {
        // Try next path
      }
    }
  } catch {
    // Fallback
  }
  return 'https://github.com/joenye/brighter-shores-routefinder-ocr';
}

export function getGitHubRepoUrl(): string {
  return getRepositoryUrl();
}

export function getGitHubReleasesUrl(): string {
  return `${getRepositoryUrl()}/releases`;
}

function getGitHubApiLatestReleaseUrl(): string {
  const repoUrl = getRepositoryUrl();
  // Extract owner/repo from URL like https://github.com/owner/repo
  const match = repoUrl.match(/github\.com\/([^/]+\/[^/]+)/);
  if (match) {
    return `https://api.github.com/repos/${match[1]}/releases/latest`;
  }
  return 'https://api.github.com/repos/joenye/brighter-shores-routefinder-ocr/releases/latest';
}

function compareVersions(current: string, latest: string): number {
  const currentParts = current.replace(/^v/, '').split('.').map(Number);
  const latestParts = latest.replace(/^v/, '').split('.').map(Number);
  
  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const c = currentParts[i] || 0;
    const l = latestParts[i] || 0;
    if (l > c) return 1;  // latest is newer
    if (l < c) return -1; // current is newer
  }
  return 0; // equal
}

export async function checkForUpdates(): Promise<UpdateInfo> {
  const result: UpdateInfo = {
    hasUpdate: false,
    currentVersion: APP_VERSION,
    latestVersion: null,
    releaseUrl: null,
    releaseName: null,
    error: null,
  };

  console.log(`[update] Checking for updates... (current version: ${APP_VERSION})`);

  try {
    const apiUrl = getGitHubApiLatestReleaseUrl();
    
    const response = await new Promise<string>((resolve, reject) => {
      const request = net.request({
        method: 'GET',
        url: apiUrl,
      });

      request.setHeader('Accept', 'application/vnd.github.v3+json');
      request.setHeader('User-Agent', `BrighterMerchant/${APP_VERSION}`);

      let data = '';

      request.on('response', (response) => {
        if (response.statusCode === 404) {
          reject(new Error('No releases found'));
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        response.on('data', (chunk) => {
          data += chunk.toString();
        });

        response.on('end', () => {
          resolve(data);
        });

        response.on('error', reject);
      });

      request.on('error', reject);
      request.end();
    });

    const release = JSON.parse(response);
    const latestVersion = release.tag_name?.replace(/^v/, '') || null;
    
    if (latestVersion) {
      result.latestVersion = latestVersion;
      result.releaseUrl = release.html_url || `${getGitHubReleasesUrl()}/tag/${release.tag_name}`;
      result.releaseName = release.name || `v${latestVersion}`;
      result.hasUpdate = compareVersions(APP_VERSION, latestVersion) > 0;
      
      if (result.hasUpdate) {
        console.log(`[update] New version available: ${latestVersion} (current: ${APP_VERSION})`);
      } else {
        console.log(`[update] Already on latest version (${APP_VERSION})`);
      }
    }
  } catch (err: any) {
    result.error = err.message || 'Failed to check for updates';
    console.warn(`[update] Failed to check for updates: ${err.message}`);
  }

  return result;
}
