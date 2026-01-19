# Security

## Verifying Release Integrity

All releases are built automatically by GitHub Actions from the source code in this repository. The build process is defined in [`.github/workflows/release.yml`](../.github/workflows/release.yml).

**Why this matters:** GitHub Actions runs in an isolated environment, ensuring builds are reproducible and haven't been tampered with. You can review the workflow file yourself to verify:
- What commands are run to build the app
- That no additional code is injected during the build
- That the build environment is clean and controlled

Each release includes:
- **CHECKSUMS.txt**: SHA256 checksums for all files
- **Commit SHA**: The exact commit the release was built from

### Verify Checksums

**macOS/Linux:**
```bash
shasum -a 256 -c CHECKSUMS.txt
```

**Windows (PowerShell):**
```powershell
Get-FileHash -Algorithm SHA256 Brighter Merchant-*.exe
# Compare with CHECKSUMS.txt
```

### Build From Source

For maximum assurance, build it yourself:

```bash
git clone --branch v1.0.0 https://github.com/joenye/BrighterMerchant.git
cd Brighter Merchant
npm ci
npm run build:mac   # or build:win, build:linux
```

Compare your build with the release artifacts.

## What Brighter Merchant Accesses

**Screen Recording:**
- Captures screenshots of the Brighter Shores game window only
- Performs OCR to read bounty information
- Does NOT record or store screenshots

**Network Access:**
- One optional request: checks GitHub API for updates (can be disabled in Settings)
- No telemetry, analytics, or user data collection

**File Access:**
- Only accesses its own configuration directory
- Does not interact with game files or other applications

## Code Signing

Releases are currently **not code-signed**:
- **macOS**: You may need to remove quarantine attribute (see README installation steps)
- **Windows**: You may see a SmartScreen warning (click "More info" → "Run anyway")

Verifying checksums ensures the release matches the source code.
