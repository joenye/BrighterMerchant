import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { throttle } from 'throttle-debounce'
import { screen, app } from 'electron'
import { BrowserWindow, Rectangle, BrowserWindowConstructorOptions } from 'electron'

// Handle native module loading for both development and packaged app
function loadNativeModule(): AddonExports {
  const nodeGypBuild = require('node-gyp-build')
  
  // In packaged app, __dirname is inside asar, but native modules must be outside
  // Try the unpacked location first (for packaged apps)
  const basePath = join(__dirname, '..')
  const unpackedPath = basePath.replace('app.asar', 'app.asar.unpacked')
  
  console.log('[native] __dirname:', __dirname)
  console.log('[native] basePath:', basePath)
  console.log('[native] unpackedPath:', unpackedPath)
  console.log('[native] isAsar:', basePath.includes('app.asar'))
  
  // Check if we're in a packaged app (asar)
  if (basePath.includes('app.asar')) {
    try {
      console.log('[native] Attempting to load from unpacked path...')
      const lib = nodeGypBuild(unpackedPath)
      console.log('[native] Successfully loaded from unpacked path')
      return lib
    } catch (e) {
      console.error('[native] Failed to load from unpacked path:', e)
      // Fall back to trying the asar path (shouldn't work but try anyway)
    }
  }
  
  // Development mode - load from project root
  console.log('[native] Loading from development path...')
  const lib = nodeGypBuild(basePath)
  console.log('[native] Successfully loaded from development path')
  return lib
}

const lib: AddonExports = loadNativeModule()

interface AddonExports {
  start(
    overlayWindowId: Buffer | undefined,
    targetWindowTitle: string,
    cb: (e: any) => void
  ): void

  activateOverlay(): void
  focusTarget(): void
  screenshot(): Buffer
}

enum EventType {
  EVENT_ATTACH = 1,
  EVENT_FOCUS = 2,
  EVENT_BLUR = 3,
  EVENT_DETACH = 4,
  EVENT_FULLSCREEN = 5,
  EVENT_MOVERESIZE = 6,
}

export interface AttachEvent {
  hasAccess: boolean | undefined
  isFullscreen: boolean | undefined
  x: number
  y: number
  width: number
  height: number
}

export interface FullscreenEvent {
  isFullscreen: boolean
}

export interface MoveresizeEvent {
  x: number
  y: number
  width: number
  height: number
}

export interface AttachOptions {
  // Whether the Window has a title bar. We adjust the overlay to not cover it
  hasTitleBarOnMac?: boolean
}

const isMac = process.platform === 'darwin'
const isLinux = process.platform === 'linux'

export const OVERLAY_WINDOW_OPTS: BrowserWindowConstructorOptions = {
  fullscreenable: true,
  skipTaskbar: !isLinux,
  frame: false,
  show: false,
  transparent: true,
  // let Chromium to accept any size changes from OS
  resizable: true,
  // disable shadow for Mac OS
  hasShadow: !isMac,
  // float above all windows on Mac OS
  alwaysOnTop: isMac
}

class OverlayControllerGlobal {
  private isInitialized = false
  private electronWindow?: BrowserWindow
  // Exposed so that apps can get the current bounds of the target
  // NOTE: stores screen physical rect on Windows
  targetBounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 }
  targetHasFocus = false
  private focusNext: 'overlay' | 'target' | undefined
  // The height of a title bar on a standard window. Only measured on Mac
  private macTitleBarHeight = 0
  private attachOptions: AttachOptions = {}

  readonly events = new EventEmitter()

  constructor () {
    this.events.on('attach', (e: AttachEvent) => {
      this.targetHasFocus = true
      if (this.electronWindow) {
        this.electronWindow.setIgnoreMouseEvents(true)
        this.electronWindow.showInactive()
        this.electronWindow.setAlwaysOnTop(true, 'screen-saver')
      }
      if (e.isFullscreen !== undefined) {
        this.handleFullscreen(e.isFullscreen)
      }
      this.targetBounds = e
      this.updateOverlayBounds()
    })

    this.events.on('fullscreen', (e: FullscreenEvent) => {
      this.handleFullscreen(e.isFullscreen)
    })

    this.events.on('detach', () => {
      this.targetHasFocus = false
      this.electronWindow?.hide()
    })

    const dispatchMoveresize = throttle(34 /* 30fps */, this.updateOverlayBounds.bind(this))

    this.events.on('moveresize', (e: MoveresizeEvent) => {
      this.targetBounds = e
      dispatchMoveresize()
    })

    this.events.on('blur', () => {
      this.targetHasFocus = false

      if (this.electronWindow && (isMac ||
        this.focusNext !== 'overlay' && !this.electronWindow.isFocused()
      )) {
        this.electronWindow.hide()
        // this.electronWindow.hide() // TODO: Setting as to whether this is applied.
      }
    })

    this.events.on('focus', () => {
      this.focusNext = undefined
      this.targetHasFocus = true

      if (this.electronWindow) {
        this.electronWindow.setIgnoreMouseEvents(true)
        if (!this.electronWindow.isVisible()) {
          this.electronWindow.showInactive()
          this.electronWindow.setAlwaysOnTop(true, 'screen-saver')
        }
      }
    })
  }

  private async handleFullscreen(isFullscreen: boolean) {
    if (!this.electronWindow) return

    if (isMac) {
      // On Mac, only a single app can be fullscreen, so we can't go
      // fullscreen. We get around it by making it display on all workspaces,
      // based on code from:
      // https://github.com/electron/electron/issues/10078#issuecomment-754105005
      this.electronWindow.setVisibleOnAllWorkspaces(isFullscreen, { visibleOnFullScreen: true })
      if (isFullscreen) {
        const display = screen.getPrimaryDisplay()
        this.electronWindow.setBounds(display.bounds)
      } else {
        // Set it back to `lastBounds` as set before fullscreen
        this.updateOverlayBounds();
      }
    } else {
      this.electronWindow.setFullScreen(isFullscreen)
    }
  }

  private updateOverlayBounds () {
    let lastBounds = this.adjustBoundsForMacTitleBar(this.targetBounds)
    if (lastBounds.width === 0 || lastBounds.height === 0) return
    if (!this.electronWindow) return

    if (process.platform === 'win32') {
      lastBounds = screen.screenToDipRect(this.electronWindow, this.targetBounds)
    }
    this.electronWindow.setBounds(lastBounds)

    // if moved to screen with different DPI, 2nd call to setBounds will correctly resize window
    // dipRect must be recalculated as well
    if (process.platform === 'win32') {
      lastBounds = screen.screenToDipRect(this.electronWindow, this.targetBounds)
      this.electronWindow.setBounds(lastBounds)
    }
  }

  private handler (e: unknown) {
    switch ((e as { type: EventType }).type) {
      case EventType.EVENT_ATTACH:
        this.events.emit('attach', e)
        break
      case EventType.EVENT_FOCUS:
        this.events.emit('focus', e)
        break
      case EventType.EVENT_BLUR:
        this.events.emit('blur', e)
        break
      case EventType.EVENT_DETACH:
        this.events.emit('detach', e)
        break
      case EventType.EVENT_FULLSCREEN:
        this.events.emit('fullscreen', e)
        break
      case EventType.EVENT_MOVERESIZE:
        this.events.emit('moveresize', e)
        break
    }
  }

  /**
   * Create a dummy window to calculate the title bar height on Mac. We use
   * the title bar height to adjust the size of the overlay to not overlap
   * the title bar. This helps Mac match the behaviour on Windows/Linux.
   */
  private calculateMacTitleBarHeight () {
    const testWindow = new BrowserWindow({
      width: 400,
      height: 300,
      webPreferences: {
        nodeIntegration: true
      },
      show: false,
      // Prevent this test window from affecting app lifecycle
      skipTaskbar: true,
    })
    const fullHeight = testWindow.getSize()[1]
    const contentHeight = testWindow.getContentSize()[1]
    this.macTitleBarHeight = fullHeight - contentHeight
    // Use destroy() instead of close() to avoid triggering window-all-closed
    testWindow.destroy()
  }

  /** If we're on a Mac, adjust the bounds to not overlap the title bar */
  private adjustBoundsForMacTitleBar (bounds: Rectangle) {
    if (!isMac || !this.attachOptions.hasTitleBarOnMac) {
      return bounds
    }

    const newBounds: Rectangle = {
      ...bounds,
      y: bounds.y + this.macTitleBarHeight,
      height: bounds.height - this.macTitleBarHeight
    }
    return newBounds
  }

  activateOverlay () {
    if (!this.electronWindow) {
      throw new Error('You are using the library in tracking mode')
    }
    this.focusNext = 'overlay'
    this.electronWindow.setIgnoreMouseEvents(false)
    this.electronWindow.focus()
  }

  focusTarget () {
    this.focusNext = 'target'
    this.electronWindow?.setIgnoreMouseEvents(true)
    lib.focusTarget()
  }

  attachByTitle (electronWindow: BrowserWindow | undefined, targetWindowTitle: string, options: AttachOptions = {}) {
    if (this.isInitialized) {
      throw new Error('Library can be initialized only once.')
    } else {
      this.isInitialized = true
    }
    this.electronWindow = electronWindow

    this.electronWindow?.on('blur', () => {
      if (!this.targetHasFocus && this.focusNext !== 'target') {
        this.electronWindow!.hide()
      }
    })

    this.electronWindow?.on('focus', () => {
      this.focusNext = undefined
    })

    this.attachOptions = options
    if (isMac) {
      this.calculateMacTitleBarHeight()
    }

    lib.start(
      this.electronWindow?.getNativeWindowHandle(),
      targetWindowTitle,
      this.handler.bind(this))
  }

  // buffer suitable for use in `nativeImage.createFromBitmap`
  screenshot (): Buffer {
    if (process.platform !== 'win32' && !isMac) {
      throw new Error('Not implemented on your platform.')
    }
    return lib.screenshot()
  }
}

export const OverlayController = new OverlayControllerGlobal()
