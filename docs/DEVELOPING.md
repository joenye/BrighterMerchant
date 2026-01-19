# Development Guide

## Building and Running

```bash
npm install        # Install dependencies
npm run start      # Build and run in development mode
```

## Building for Release

```bash
npm run build:mac      # macOS
npm run build:win      # Windows
npm run build:linux    # Linux
npm run build:all      # All platforms
```

Builds are output to the `release/` directory.

## Debugging Native Code (macOS)

1. Create XCode project: `node-gyp configure --debug -- -f xcode`
2. Set debug mode: `node-gyp configure --debug`
3. Run the app: `npm run start`
4. In XCode, open `build/binding.xcodeproj`
5. Use Debug → Attach to Process to attach to the Electron process

## Architecture

The overlay window hooks into system events to track and overlay the target game window. The main flow:

1. User calls `attachByTitle()` to attach to Brighter Shores
2. Native code (`lib/`) creates platform-specific hooks for window events
3. Background thread monitors window state (focus, move, minimize, etc.)
4. Overlay window position and visibility syncs with the game window

See source code in `src/lib/` for platform-specific implementations.
