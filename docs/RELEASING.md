# Releasing

## Creating a Release

1. Bump the version and create a tag:
   ```bash
   npm version <version>
   ```
   
   Examples:
   ```bash
   npm version 1.1.0      # Specific version
   npm version patch      # 1.0.0 → 1.0.1
   npm version minor      # 1.0.0 → 1.1.0
   npm version major      # 1.0.0 → 2.0.0
   ```

2. Push the commit and tag:
   ```bash
   git push origin main --tags
   ```

3. GitHub Actions will automatically:
   - Build releases for all platforms (macOS, Windows, Linux)
   - Generate SHA256 checksums
   - Create a GitHub Release with the artifacts

## What Happens Automatically

- `package.json` version is updated
- A commit is created with message `v{version}`
- A git tag `v{version}` is created
- The release workflow builds and publishes artifacts

## Version Management

The app version is managed in `package.json` as the single source of truth. At runtime:
- Version is read from `package.json`
- Git commit hash is injected at build time
- Both are displayed in Settings → About

## Pre-release Checklist

Before releasing:
- [ ] Test the app locally (`npm run start`)
- [ ] Verify builds work (`npm run build:mac` or your platform)
- [ ] Ensure all changes are committed
- [ ] Update documentation if needed
