# Application Architecture

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                          main.ts                                 │
│                    (Application Entry)                           │
└────────────┬────────────────────────────────────────────────────┘
             │
             ├─────────────────────────────────────────────────────┐
             │                                                      │
             v                                                      v
┌────────────────────────┐                          ┌──────────────────────┐
│   RegionManager        │                          │   OCRProcessor       │
│   (UI/Regions)         │                          │   (Core Logic)       │
├────────────────────────┤                          ├──────────────────────┤
│ - Load region config   │                          │ - Process screenshots│
│ - Update positions     │                          │ - Detect bounties    │
│ - Generate HTML        │                          │ - Calculate optimal  │
│ - Persist to file      │                          │ - Track progress     │
└────────────┬───────────┘                          └──────────┬───────────┘
             │                                                  │
             │                                                  │
             v                                                  v
┌────────────────────────┐                          ┌──────────────────────┐
│   OverlayWindow        │◄─────────────────────────│  ScreenshotManager   │
│   (UI/Display)         │                          │  (Core/Capture)      │
├────────────────────────┤                          ├──────────────────────┤
│ - Create window        │                          │ - Capture loop       │
│ - Handle shortcuts     │                          │ - Encode images      │
│ - Toggle edit mode     │                          │ - Coordinate OCR     │
│ - Display overlays     │                          │ - Send updates       │
└────────────────────────┘                          └──────────────────────┘
             │                                                  │
             │                                                  │
             └──────────────────┬───────────────────────────────┘
                                │
                                v
                    ┌───────────────────────┐
                    │   SessionTracker      │
                    │   (Core/Stats)        │
                    ├───────────────────────┤
                    │ - Track KP earned     │
                    │ - Log completions     │
                    │ - Calculate KP/hr     │
                    │ - Write to file       │
                    └───────────────────────┘
```

## Data Flow

```
┌──────────────┐
│ Game Window  │
└──────┬───────┘
       │ Screenshot
       v
┌──────────────────┐
│ OverlayController│ (Native)
└──────┬───────────┘
       │ Buffer
       v
┌──────────────────┐
│ScreenshotManager │
└──────┬───────────┘
       │ JPEG
       v
┌──────────────────┐
│  OCRProcessor    │
└──────┬───────────┘
       │ Text
       v
┌──────────────────┐      ┌──────────────────┐
│ Bounty Detection │─────>│ PathfinderWorker │
└──────┬───────────┘      └────────┬─────────┘
       │                           │
       │ Detected Bounties         │ Optimal Solution
       │                           │
       v                           v
┌──────────────────────────────────────┐
│         OCRProcessor                 │
│  (Calculate DROP/ACCEPT indicators)  │
└──────────────┬───────────────────────┘
               │ OCRData
               v
┌──────────────────────────────────────┐
│         OverlayWindow                │
│     (Display to user)                │
└──────────────────────────────────────┘
```

## Module Dependencies

```
main.ts
  ├── config/
  │   ├── config.ts
  │   ├── constants.ts
  │   └── types.ts
  │
  ├── ui/
  │   ├── overlay-window.ts
  │   │   ├── html-generator.ts
  │   │   ├── region-manager.ts
  │   │   └── utils/formatting.ts
  │   │
  │   └── region-manager.ts
  │       └── config/types.ts
  │
  ├── core/
  │   ├── ocr-processor.ts
  │   │   ├── workers/pathfinder-worker.ts
  │   │   ├── core/session-tracker.ts
  │   │   ├── utils/tesseract.ts
  │   │   ├── utils/async.ts
  │   │   ├── utils/perf.ts
  │   │   └── utils/bounty-resolver.ts
  │   │
  │   ├── screenshot-manager.ts
  │   │   ├── core/ocr-processor.ts
  │   │   ├── utils/async.ts
  │   │   ├── utils/perf.ts
  │   │   └── utils/formatting.ts
  │   │
  │   └── session-tracker.ts
  │       └── config/types.ts
  │
  └── workers/
      └── pathfinder-worker.ts
          └── config/types.ts
```

## Execution Flow

### Startup
1. `main.ts` loads configuration
2. Creates `RegionManager` with initial regions
3. Creates `OCRProcessor` with config
4. Creates `OverlayWindow` and attaches to game
5. Creates `ScreenshotManager` and starts loop

### Screenshot Loop (Every 1000ms)
1. `ScreenshotManager` captures screenshot
2. Encodes to JPEG
3. Passes to `OCRProcessor.processScreenshot()`
4. OCR extracts text from regions
5. Detects bounties from text
6. Calculates optimal solution (if needed)
7. Determines DROP/ACCEPT indicators
8. Sends `OCRData` to `OverlayWindow`
9. Window updates display

### Bounty Completion
1. `OCRProcessor` detects bounty count decrease
2. Identifies which bounty was completed
3. Updates `SessionTracker` with KP earned
4. Prunes completed steps from route
5. Logs to console and file
6. Updates display

### Edit Mode (Cmd+J)
1. User presses shortcut
2. `OverlayWindow` toggles edit mode
3. Activates overlay for mouse input
4. User drags/resizes regions
5. `RegionManager` updates positions
6. Saves to config file

### Force Optimal (Cmd+N)
1. User presses shortcut
2. `OverlayWindow` calls `OCRProcessor.forceOptimalRecalculation()`
3. Clears cached solution
4. Recomputes with no pruning (optimal settings)
5. Updates display with new solution

## Key Design Patterns

### Separation of Concerns
- **Config**: Configuration and constants
- **Core**: Business logic and processing
- **UI**: User interface and display
- **Utils**: Reusable utilities
- **Workers**: Background processing

### Single Responsibility
Each module has one clear purpose:
- `OCRProcessor`: Process OCR and calculate optimal
- `ScreenshotManager`: Capture and coordinate
- `SessionTracker`: Track and log statistics
- `OverlayWindow`: Display and user interaction
- `RegionManager`: Region configuration

### Dependency Injection
- Components receive dependencies via constructor
- Easy to mock for testing
- Clear dependency graph

### Event-Driven
- IPC events for window communication
- Callbacks for async updates
- Clean separation between layers

## Performance Considerations

### Concurrency
- OCR operations run concurrently (configurable)
- Pathfinder runs in worker thread
- Screenshot loop doesn't block main thread

### Caching
- Optimal solution cached until bounties change
- Regions loaded once at startup
- Performance metrics aggregated over time

### Optimization
- Image scaling for faster OCR
- Pruning for faster pathfinding
- Grace periods to reduce flashing
- Suppress drops during recomputation

## Error Handling

### OCR Errors
- Caught and logged
- Processing continues
- Previous state preserved

### Pathfinder Errors
- Worker timeout protection
- Fallback to previous solution
- Error logged with context

### File I/O Errors
- Config loading failures use defaults
- Log write failures don't crash app
- Region updates fail gracefully

## Testing Strategy

### Unit Tests
- Test each module in isolation
- Mock dependencies
- Test edge cases

### Integration Tests
- Test module interactions
- Test full workflows
- Test error scenarios

### E2E Tests
- Test with real game window
- Test OCR accuracy
- Test pathfinder results
