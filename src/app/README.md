# Application Architecture

This directory contains the refactored Electron application code, organized into clean, modular components.

## Directory Structure

```
src/app/
├── main.ts                    # Application entry point
├── config/
│   ├── types.ts              # TypeScript type definitions
│   ├── constants.ts          # Application constants
│   └── config.ts             # Configuration loading
├── core/
│   ├── ocr-processor.ts      # OCR processing and bounty detection
│   ├── screenshot-manager.ts # Screenshot capture loop
│   └── session-tracker.ts    # Session statistics and logging
├── ui/
│   ├── overlay-window.ts     # Overlay window management
│   ├── region-manager.ts     # Region positioning and configuration
│   └── html-generator.ts     # HTML template generation
├── workers/
│   └── pathfinder-worker.ts  # Pathfinder worker thread wrapper
└── utils/
    ├── async.ts              # Async utilities (sleep, mapWithConcurrency)
    ├── bounty-resolver.ts    # Bounty name resolution
    ├── formatting.ts         # Step formatting for display
    ├── perf.ts               # Performance monitoring
    └── tesseract.ts          # Tesseract OCR wrapper
```

## Key Components

### Main Entry Point (`main.ts`)
- Initializes the application
- Loads configuration
- Sets up all managers and processors
- Handles application lifecycle

### Core Processing

**OCRProcessor** (`core/ocr-processor.ts`)
- Processes screenshots and extracts bounty information
- Manages optimal bounty calculation
- Tracks active/board bounties and generates UI indicators
- Handles step progression and bounty completion

**ScreenshotManager** (`core/screenshot-manager.ts`)
- Captures screenshots at regular intervals
- Coordinates with OCRProcessor
- Sends updates to overlay window

**SessionTracker** (`core/session-tracker.ts`)
- Tracks session statistics (KP earned, time, bounties completed)
- Logs run completions to file
- Calculates KP/hour metrics

### UI Components

**OverlayWindow** (`ui/overlay-window.ts`)
- Manages the Electron overlay window
- Handles keyboard shortcuts
- Coordinates edit mode and display updates

**RegionManager** (`ui/region-manager.ts`)
- Manages overlay region positions and sizes
- Persists region configuration to file
- Generates HTML for region elements

### Workers

**PathfinderWorker** (`workers/pathfinder-worker.ts`)
- Wraps pathfinder computation in a worker thread
- Handles timeouts and error recovery
- Auto-generates worker script on first run

### Utilities

- **async.ts**: Helper functions for async operations
- **bounty-resolver.ts**: Maps bounty names to keys
- **formatting.ts**: Formats steps for display with colors and timing
- **perf.ts**: Performance monitoring and logging
- **tesseract.ts**: OCR wrapper supporting both native Tesseract binary and tesseract.js with automatic fallback

## Configuration

Configuration is loaded from `config.json` in the app directory. See `config/types.ts` for available options.

Key settings:
- `detectiveLevel`: Player's detective level
- `isBattleOfFortuneholdCompleted`: Quest completion status
- `ocrConcurrency`: Number of concurrent OCR operations
- `ocrScale`: Image scaling for OCR
- `ocrMethod`: OCR engine to use (see below)
- `useWorkerForPathfinder`: Enable worker thread for pathfinding
- `dropGraceMs`: Grace period before showing DROP indicator
- `suppressDropsWhileRecompute`: Hide drops during recomputation

### OCR Configuration

The app supports multiple OCR methods via the `ocrMethod` config option:

- **`"native"`** (default): Uses system-installed Tesseract binary
  - Fastest performance
  - Requires Tesseract to be installed on the system
  - Falls back to tesseract.js if binary not found

- **`"tesseract-js"`**: Uses pure JavaScript Tesseract implementation
  - No system dependencies required
  - Works out of the box on all platforms
  - Slightly slower than native

- **`"auto"`**: Automatically detects and uses native if available, otherwise tesseract.js
  - Best for cross-platform compatibility
  - Checks for native binary on startup

The app will log which OCR method is being used on startup. For packaged releases, `"tesseract-js"` is recommended to avoid requiring users to install Tesseract separately.

## Running the Application

```bash
# Development
npm start

# With native module rebuild
npm run start:rebuild

# Build distributables
npm run build:mac
npm run build:win
npm run build:all
```

## Benefits of This Architecture

1. **Separation of Concerns**: Each module has a single, clear responsibility
2. **Testability**: Components can be tested in isolation
3. **Maintainability**: Easy to find and modify specific functionality
4. **Readability**: Smaller files with focused logic
5. **Reusability**: Utilities and components can be reused
6. **Type Safety**: Strong TypeScript types throughout

## Migration Notes

The original `electron-app.ts` (1899 lines) has been refactored into this modular structure. The old file is preserved as `electron-app.old.ts` for reference.

All functionality has been preserved, including:
- OCR processing with Tesseract
- Pathfinder integration with worker threads
- Session tracking and logging
- Overlay window with edit mode
- Timer and status indicators
- Performance monitoring
