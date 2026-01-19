// Fetch latest release info from GitHub API
const REPO = 'joenye/BrighterMerchant';
const BASE_URL = `https://github.com/${REPO}/releases/download`;

async function loadRelease() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (!res.ok) throw new Error('Failed to fetch release');
    
    const release = await res.json();
    const version = release.tag_name.replace(/^v/, '');
    
    document.getElementById('version').textContent = version;
    
    // Construct direct download URLs based on version
    const downloads = {
      macos: `${BASE_URL}/v${version}/BrighterMerchant-${version}-macos-arm64.dmg`,
      windowsSetup: `${BASE_URL}/v${version}/BrighterMerchant-${version}-windows-x64-setup.exe`,
      windowsPortable: `${BASE_URL}/v${version}/BrighterMerchant-${version}-windows-x64-portable.exe`,
      linux: `${BASE_URL}/v${version}/BrighterMerchant-${version}-linux-x64.AppImage`
    };
    
    document.getElementById('download-macos').href = downloads.macos;
    document.getElementById('download-windows-setup').href = downloads.windowsSetup;
    document.getElementById('download-windows-portable').href = downloads.windowsPortable;
    document.getElementById('download-linux').href = downloads.linux;
    document.getElementById('view-release').href = release.html_url;
  } catch (err) {
    console.error('Failed to load release:', err);
    document.getElementById('version').textContent = 'unknown';
    
    // Fallback to releases page
    const fallback = `https://github.com/${REPO}/releases/latest`;
    document.getElementById('download-macos').href = fallback;
    document.getElementById('download-windows-setup').href = fallback;
    document.getElementById('download-windows-portable').href = fallback;
    document.getElementById('download-linux').href = fallback;
    document.getElementById('view-release').href = fallback;
  }
}

loadRelease();
