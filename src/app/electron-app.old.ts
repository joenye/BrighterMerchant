// FULL FILE: src/demo/electron-demo.ts
//
// Changes included:
// 1) "Accept grace" window (default 2000ms) so newly-added active bounties never flash DROP.
// 2) "Even cleaner" option: while a recompute is in-flight (for a changed signature / board transition),
//    suppress ALL activeDrops (but still show 👁️). This guarantees no incorrect DROP is shown during recompute.
//
// Notes:
// - Native Tesseract only.
// - Uses worker thread for pathfinder.
// - Restores getBountyKeyByName mapping.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { app, BrowserWindow, globalShortcut, nativeImage, ipcMain } from 'electron';
import { spawn } from 'child_process';
import { Worker } from 'worker_threads';

const sharp = require('sharp') as typeof import('sharp');

import { OverlayController, OVERLAY_WINDOW_OPTS } from '../';
import pathfinder from '../algorithm/pathfinder';
import { getBountyKeyByName, bounties as bountyData } from "../algorithm/bounties";

// ───────────────────────────────────────────────────────────────
// Types and Constants
// ───────────────────────────────────────────────────────────────

interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  title: string;
}

type Regions = { [key: string]: Region };

type Step =
  | { type: 'teleport'; location: string; distance: number }
  | { type: 'buy'; item: string; location: string; distance: number }
  | { type: 'sell'; item: string; location: string; distance: number }
  | { type: 'return'; location: string; distance: number };

type FindBestArgs = {
  allBounties: string[];
  detectiveLevel: number;
  battleOfFortuneholdCompleted: boolean;
  pruningOptions?: {
    maxCombinations?: number;
    maxEvaluations?: number;
    pruningThreshold?: number;
  };
};

type FindBestResult = {
  bounties: string[];
  kp: number;
  actions: Step[];
  distance: number;
};

const WINDOW_TITLE = "Brighter Shores";
const SCREENSHOT_INTERVAL_MS = 1000;
const TOGGLE_MOUSE_KEY = 'CmdOrCtrl + J';
const TOGGLE_SHOW_KEY = 'CmdOrCtrl + K';
const FORCE_OPTIMAL_KEY = 'CmdOrCtrl + N';
const TIMER_INTERVAL_MS = 250;

const CONFIG_PATH = path.join(__dirname, 'config.json');

let detectiveLevel: number = 500;
let battleOfFortuneholdCompleted: boolean = true;

// ───────────────────────────────────────────────────────────────
// Perf Logging Helpers
// ───────────────────────────────────────────────────────────────

function nowMsHiRes(): number {
  return Number(process.hrtime.bigint()) / 1e6;
}

function fmtMs(ms: number): string {
  if (!isFinite(ms)) return `${ms}`;
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms.toFixed(1)}ms`;
}

type PerfPhase =
  | 'tick_total'
  | 'screenshot_capture'
  | 'encode_jpeg'
  | 'title_ocr'
  | 'rest_ocr'
  | 'find_best_bounties'
  | 'process_results_total';

class PerfWindow {
  private lastLogAt = 0;
  private counters: Record<string, number> = {};
  private totals: Record<string, number> = {};
  private maxes: Record<string, number> = {};
  private readonly windowMs: number;

  constructor(windowMs: number) {
    this.windowMs = windowMs;
    this.lastLogAt = Date.now();
  }

  add(name: PerfPhase | string, ms: number): void {
    this.counters[name] = (this.counters[name] || 0) + 1;
    this.totals[name] = (this.totals[name] || 0) + ms;
    this.maxes[name] = Math.max(this.maxes[name] || 0, ms);
  }

  maybeLog(prefix: string): void {
    const now = Date.now();
    if (now - this.lastLogAt < this.windowMs) return;

    const parts: string[] = [];
    const keys = Object.keys(this.counters).sort();
    for (const k of keys) {
      const c = this.counters[k] || 0;
      const t = this.totals[k] || 0;
      const mx = this.maxes[k] || 0;
      const avg = c ? t / c : 0;
      parts.push(`${k}: calls=${c}, avg=${fmtMs(avg)}, max=${fmtMs(mx)}, total=${fmtMs(t)}`);
    }

    console.log(`${prefix} perf window ${Math.round(this.windowMs / 1000)}s\n  ${parts.join('\n  ')}`);

    this.counters = {};
    this.totals = {};
    this.maxes = {};
    this.lastLogAt = now;
  }
}

// ───────────────────────────────────────────────────────────────
// Regions
// ───────────────────────────────────────────────────────────────

const initialRegions: Regions = {
  activeBountyRegion1: { x: 16, y: 538, width: 393, height: 95, color: 'rgba(0, 0, 0, 0.6)', title: "Active Bounty 1" },
  activeBountyRegion2: { x: 16, y: 642, width: 393, height: 95, color: 'rgba(0, 0, 0, 0.6)', title: "Active Bounty 2" },
  activeBountyRegion3: { x: 16, y: 747, width: 393, height: 95, color: 'rgba(0, 0, 0, 0.6)', title: "Active Bounty 3" },
  activeBountyRegion4: { x: 16, y: 851, width: 393, height: 95, color: 'rgba(0, 0, 0, 0.6)', title: "Active Bounty 4" },
  activeBountyRegion5: { x: 16, y: 955, width: 393, height: 95, color: 'rgba(0, 0, 0, 0.6)', title: "Active Bounty 5" },
  activeBountyRegion6: { x: 16, y: 1059, width: 393, height: 95, color: 'rgba(0, 0, 0, 0.6)', title: "Active Bounty 6" },

  boardRegion1: { x: 682, y: 72, width: 500, height: 130, color: 'rgba(0, 0, 0, 0.6)', title: "Guild Board 1" },
  boardRegion2: { x: 682, y: 225, width: 500, height: 130, color: 'rgba(0, 0, 0, 0.6)', title: "Guild Board 2" },
  boardRegion3: { x: 682, y: 378, width: 500, height: 130, color: 'rgba(0, 0, 0, 0.6)', title: "Guild Board 3" },
  boardRegion4: { x: 682, y: 531, width: 500, height: 130, color: 'rgba(0, 0, 0, 0.6)', title: "Guild Board 4" },
  boardRegion5: { x: 682, y: 684, width: 500, height: 130, color: 'rgba(0, 0, 0, 0.6)', title: "Guild Board 5" },
  boardRegion6: { x: 682, y: 837, width: 500, height: 130, color: 'rgba(0, 0, 0, 0.6)', title: "Guild Board 6" },

  chatRegion: { x: 426, y: 1002, width: 1000, height: 255, color: 'rgba(42, 42, 42, 0.9)', title: "Chat Box" },
  bountyBoardTitleRegion: { x: 800, y: 24, width: 270, height: 60, color: 'rgba(255, 0, 0, 0.2)', title: "Board Title" },

  timerRegion: { x: 10, y: 10, width: 300, height: 50, color: 'rgba(0, 0, 0, 0.8)', title: "" }
};

const bountyNames = new Set([
  "Carrots", "Soap", "Ribs", "MeatWrap", "BeefJoint", "ClockworkSheep",
  "PorcelainDoll", "Plates", "PinBadge", "Pumpkin", "Pizza", "Bananas",
  "TinPocketWatch", "HomespunCloth", "RainbowCheese", "ArganianWine", "OakPatternedVase",
  "ScentedCandle", "UnicornDust", "Painting", "CarriageClock", "Spectacles",
  "SharpseedWine", "Rug", "Caviar", "BathSalts", "Cabbage", "SwirlPearl", "Tomatoes", "Steak", "Burger",
  "HamLeg", "ClockworkDragon", "SnowGlobe", "Cups", "Postcards", "Rhubarb", "Curry",
  "Oranges", "PrecisePocketWatch", "Silk", "OldRarg", "FargustWine", "StripedVase",
  "TeaLights", "UnicornHair", "PortraitPainting", "PendulumClock",
  "TophillWine", "AntiqueBook", "Truffles"
]);

function resolveBountyKeyFromName(bountyName: string): string {
  return getBountyKeyByName(bountyName) as unknown as string;
}

// ───────────────────────────────────────────────────────────────
// Config
// ───────────────────────────────────────────────────────────────

interface Config {
  regions?: Regions;
  detectiveLevel?: number;
  isBattleOfFortuneholdCompleted?: boolean;

  ocrConcurrency?: number;
  ocrScale?: number;

  perfLogWindowSec?: number;
  perfWarnFindBestMs?: number;
  perfWarnTickMs?: number;

  useWorkerForPathfinder?: boolean;
  pathfinderWorkerTimeoutMs?: number;

  // new (optional)
  dropGraceMs?: number;
  suppressDropsWhileRecompute?: boolean;
}

function loadConfig(): Config {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (err) {
      console.error("Error reading config file:", err);
    }
  }
  return {};
}

// ───────────────────────────────────────────────────────────────
// Region Manager
// ───────────────────────────────────────────────────────────────

class RegionManager {
  regions: Regions;
  configPath: string;

  constructor(initialRegions: Regions, config?: Config) {
    this.configPath = CONFIG_PATH;
    this.regions = { ...initialRegions };

    const regionData = config?.regions;
    if (regionData) {
      for (const key in this.regions) {
        if (regionData[key]) {
          this.regions[key].x = regionData[key].x ?? this.regions[key].x;
          this.regions[key].y = regionData[key].y ?? this.regions[key].y;
          this.regions[key].width = regionData[key].width ?? this.regions[key].width;
          this.regions[key].height = regionData[key].height ?? this.regions[key].height;
        }
      }
      console.log("Loaded region configuration from config.regions in", this.configPath);
      return;
    }

    if (fs.existsSync(this.configPath)) {
      try {
        const fileConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        const rd = fileConfig.regions ? fileConfig.regions : fileConfig;
        for (const key in this.regions) {
          if (rd[key]) {
            this.regions[key].x = rd[key].x ?? this.regions[key].x;
            this.regions[key].y = rd[key].y ?? this.regions[key].y;
            this.regions[key].width = rd[key].width ?? this.regions[key].width;
            this.regions[key].height = rd[key].height ?? this.regions[key].height;
          }
        }
        console.log("Loaded region configuration from", this.configPath);
      } catch (error) {
        console.error("Error loading region config:", error);
      }
    }
  }

  updateRegion(newRegion: Region & { id: string }): void {
    this.regions[newRegion.id] = {
      x: newRegion.x,
      y: newRegion.y,
      width: newRegion.width,
      height: newRegion.height,
      color: this.regions[newRegion.id]?.color || 'black',
      title: this.regions[newRegion.id]?.title || ""
    };

    let configData: any = {};
    if (fs.existsSync(this.configPath)) {
      try {
        configData = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      } catch (e) {
        console.error("Error reading config file in updateRegion:", e);
      }
    }
    if (!configData.regions) configData.regions = {};
    configData.regions[newRegion.id] = this.regions[newRegion.id];

    try {
      fs.writeFileSync(this.configPath, JSON.stringify(configData, null, 2));
    } catch (err) {
      console.error("Error writing config file:", err);
    }
  }
}

function generateRegionElementsHTML(regions: Regions): string {
  return Object.entries(regions)
    .map(([key, region]) => `
      <div id="${key}" style="
        position: absolute;
        left: ${region.x}px;
        top: ${region.y}px;
        width: ${region.width}px;
        height: ${region.height}px;
        background: ${region.color};
        cursor: move;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        color: white;
        text-align: center;
        font-family: 'Georgia', serif;
        overflow: hidden;">
        <span>${region.title}</span>
        <span class="action-label"></span>
        <div class="resize-handle" style="
          position: absolute;
          right: 0;
          bottom: 0;
          width: 25px;
          height: 25px;
          background: ${region.color};
          cursor: nwse-resize;">
        </div>
      </div>
    `)
    .join('');
}

// ───────────────────────────────────────────────────────────────
// Native Tesseract OCR
// ───────────────────────────────────────────────────────────────

function execTesseractFromBuffer(imageBuffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('tesseract', [
      '-', 'stdout',
      '--psm', '6',
      '--oem', '3',
      '-c', 'tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:'
    ]);

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => output += data.toString());
    child.stderr.on('data', (data) => errorOutput += data.toString());

    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`Tesseract exited with code ${code}: ${errorOutput}`));
      else resolve(output);
    });

    child.stdin.write(imageBuffer);
    child.stdin.end();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function workerLoop(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => workerLoop()));
  return results;
}

// ───────────────────────────────────────────────────────────────
// Pathfinder Worker
// ───────────────────────────────────────────────────────────────

class PathfinderWorker {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: FindBestResult) => void; reject: (e: any) => void }>();

  constructor(workerScript: string) {
    this.worker = new Worker(workerScript);

    this.worker.on('message', (msg: any) => {
      if (!msg || typeof msg !== 'object') return;
      const { id, ok, result, error } = msg;
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);

      if (ok) pending.resolve(result as FindBestResult);
      else pending.reject(error ?? new Error('Worker error'));
    });

    this.worker.on('error', (err) => {
      for (const [id, p] of this.pending.entries()) {
        p.reject(err);
        this.pending.delete(id);
      }
    });

    this.worker.on('exit', (code) => {
      if (code !== 0) {
        const err = new Error(`Pathfinder worker exited with code ${code}`);
        for (const [id, p] of this.pending.entries()) {
          p.reject(err);
          this.pending.delete(id);
        }
      }
    });
  }

  async findBest(args: FindBestArgs, timeoutMs: number): Promise<FindBestResult> {
    const id = this.nextId++;

    const basePromise = new Promise<FindBestResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type: 'findBest', args });
    });

    let timeout: NodeJS.Timeout | undefined;
    const wrapped = new Promise<FindBestResult>((resolve, reject) => {
      timeout = setTimeout(() => {
        const pending = this.pending.get(id);
        if (pending) {
          this.pending.delete(id);
          pending.reject(new Error(`findBest timeout after ${timeoutMs}ms`));
        }
        reject(new Error(`findBest timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      basePromise.then(resolve, reject);
    });

    try {
      return await wrapped;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  terminate(): Promise<number> {
    return this.worker.terminate();
  }
}

function ensurePathfinderWorkerScript(workerPath: string): void {
  if (fs.existsSync(workerPath)) return;

  const code = `
// Auto-generated worker for pathfinder.compute
const { parentPort } = require('worker_threads');

const pathfinderMod = require(${JSON.stringify(require.resolve('../algorithm/pathfinder'))});
const pathfinder = pathfinderMod.default ?? pathfinderMod;

parentPort.on('message', (msg) => {
  try {
    if (!msg || msg.type !== 'findBest') return;
    const { id, args } = msg;
    const { allBounties, detectiveLevel, battleOfFortuneholdCompleted, pruningOptions } = args;

    const respArr = pathfinder.findBestBounties(
      allBounties, 
      detectiveLevel, 
      battleOfFortuneholdCompleted, 
      true, 
      1,
      pruningOptions
    );
    const r0 = respArr[0];

    parentPort.postMessage({ id, ok: true, result: { bounties: r0.bounties, kp: r0.kp, actions: r0.actions, distance: r0.distance } });
  } catch (e) {
    parentPort.postMessage({ id: msg && msg.id, ok: false, error: (e && e.stack) ? e.stack : String(e) });
  }
});
`;
  fs.writeFileSync(workerPath, code, 'utf8');
}

// ───────────────────────────────────────────────────────────────
// Overlay Window
// ───────────────────────────────────────────────────────────────

class OverlayWindow {
  window: BrowserWindow | undefined;
  private editMode = false;

  constructor(private regionManager: RegionManager, private ocrProcessor: OCRProcessor) {}

  async create(): Promise<void> {
    this.window = new BrowserWindow({
      width: 10,
      height: 10,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
      ...OVERLAY_WINDOW_OPTS
    });

    const chatTitle = this.regionManager.regions.chatRegion.title;
    const regionElements = generateRegionElementsHTML(this.regionManager.regions);

    const htmlContent = `
      <head>
        <title>merchant-tool</title>
        <link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;700&display=swap" rel="stylesheet">
        <style>
          * { font-family: 'Lora', serif; word-spacing: 3px; }
          .resize-handle { position: absolute; width: 10px; height: 10px; cursor: nwse-resize; }
          #timerRegion { font-size: 34px; font-weight: 700; letter-spacing: 1px; flex-direction: column; align-items: flex-start; }
          #timerRegion > span:first-child { display: none; }
        </style>
      </head>
      <body style="padding: 0; margin: 0;">
        ${regionElements}
        <script>
          const electron = require('electron');
          const chatTitle = "${chatTitle}";
          let currentEditMode = false;
          let activeRegion = null;

          function updateOverlays(ocrData) {
            document.querySelectorAll('[id^="activeBountyRegion"], [id^="boardRegion"], [id^="bountyBoardTitleRegion"]').forEach(region => {
              if(!region.getAttribute('data-original-bg')) {
                region.setAttribute('data-original-bg', region.style.background);
              }

              let shouldShow = false;
              let overlayHTML = "";
              if(region.id.startsWith("activeBountyRegion")) {
                const index = parseInt(region.id.replace("activeBountyRegion", ""));
                if(ocrData.activeDrops && ocrData.activeDrops.indexOf(index) !== -1) {
                  shouldShow = true;
                  overlayHTML = '<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:32px; font-weight:bold; color:rgb(231,76,60);">DROP</div>';
                } else if (ocrData.activeBountyIndices && ocrData.activeBountyIndices.indexOf(index) !== -1) {
                  shouldShow = true;
                  overlayHTML = '<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:32px;">👁️</div>';
                }
              } else if(region.id.startsWith("boardRegion")) {
                const index = parseInt(region.id.replace("boardRegion", ""));
                if(ocrData.boardPickups && ocrData.boardPickups.indexOf(index) !== -1) {
                  shouldShow = true;
                  overlayHTML = '<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:32px; font-weight:bold; color:rgb(46,204,113);">ACCEPT</div>';
                } else if (ocrData.boardBountyIndices && ocrData.boardBountyIndices.indexOf(index) !== -1) {
                  shouldShow = true;
                  overlayHTML = '<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:32px;">👁️</div>';
                }
              }

              if(shouldShow) {
                if(region.children[0]) region.children[0].style.display = 'none';
                const resizeHandle = region.querySelector('.resize-handle');
                if(resizeHandle) resizeHandle.style.display = 'none';
                const actionLabel = region.querySelector('.action-label');
                if(actionLabel) actionLabel.innerHTML = overlayHTML;

                if(overlayHTML.indexOf("DROP") !== -1 || overlayHTML.indexOf("ACCEPT") !== -1) {
                  region.style.background = region.getAttribute('data-original-bg');
                } else {
                  region.style.background = 'transparent';
                }
                region.style.display = 'flex';
              } else {
                if(region.children[0]) region.children[0].style.display = '';
                const resizeHandle = region.querySelector('.resize-handle');
                if(resizeHandle) resizeHandle.style.display = '';
                const actionLabel = region.querySelector('.action-label');
                if(actionLabel) actionLabel.innerHTML = "";
                region.style.display = 'none';
              }
            });

            const chatRegion = document.getElementById('chatRegion');
            if (chatRegion) {
              const text = ocrData.steps || "";
              const chunkSize = 150, permittedOverflow = 40;
              let formattedText = '', i = 0;
              while (i < text.length) {
                if (i + chunkSize >= text.length) {
                  formattedText += text.substring(i);
                  break;
                }
                const minIndex = i + chunkSize;
                const maxForwardIndex = i + chunkSize + permittedOverflow;
                let forwardArrow = text.indexOf("→", minIndex);
                let breakIndex;
                if (forwardArrow !== -1 && forwardArrow <= maxForwardIndex) {
                  breakIndex = forwardArrow + 2;
                } else if (forwardArrow !== -1 && forwardArrow > maxForwardIndex) {
                  let backwardArrow = text.lastIndexOf("→", minIndex);
                  breakIndex = backwardArrow !== -1 ? backwardArrow + 2 : minIndex;
                } else {
                  let backwardArrow = text.lastIndexOf("→", minIndex);
                  breakIndex = backwardArrow !== -1 ? backwardArrow + 2 : minIndex;
                }
                formattedText += text.substring(i, breakIndex) + '<br>';
                i = breakIndex;
              }
              chatRegion.innerHTML = \`<p style="color: white; font-size: 23px; white-space: pre-wrap; line-height: 160%;">\${formattedText}</p>\`;
            }
          }

          electron.ipcRenderer.on('edit-mode-change', (e, editMode, ocrData) => {
            currentEditMode = editMode;
            if(editMode) {
              document.querySelectorAll('[id^="activeBountyRegion"], [id^="boardRegion"], [id^="bountyBoardTitleRegion"]').forEach(region => {
                region.style.display = 'flex';
                if(region.children[0]) region.children[0].style.display = '';
                const resizeHandle = region.querySelector('.resize-handle');
                if(resizeHandle) resizeHandle.style.display = '';
                const actionLabel = region.querySelector('.action-label');
                if(actionLabel) actionLabel.innerHTML = "";
                if(region.getAttribute('data-original-bg')) {
                  region.style.background = region.getAttribute('data-original-bg');
                }
              });
              const chatRegion = document.getElementById('chatRegion');
              if(chatRegion) { chatRegion.innerHTML = \`<span>\${chatTitle}</span>\`; }
            } else {
              updateOverlays(ocrData || {});
            }
          });

          electron.ipcRenderer.on('ocr-data-update', (e, ocrData) => {
            if(!currentEditMode) { 
              updateOverlays(ocrData || {}); 
              updateTimerStatus(ocrData?.status, ocrData?.boardOpen);
              updateSessionStats(ocrData?.sessionStats);
            }
          });

          document.addEventListener('mousedown', (event) => {
            if(!currentEditMode) return;
            activeRegion = event.target.closest('div[id]');
            if (!activeRegion) return;
            if(event.target.classList.contains('resize-handle')) {
              activeRegion.isResizing = true;
              activeRegion.startX = event.clientX;
              activeRegion.startY = event.clientY;
              activeRegion.startWidth = activeRegion.offsetWidth;
              activeRegion.startHeight = activeRegion.offsetHeight;
            } else {
              activeRegion.isDragging = true;
              activeRegion.startX = event.clientX - activeRegion.offsetLeft;
              activeRegion.startY = event.clientY - activeRegion.offsetTop;
            }
          });

          document.addEventListener('mousemove', (event) => {
            if (!activeRegion) return;
            if(activeRegion.isDragging) {
              activeRegion.style.left = (event.clientX - activeRegion.startX) + 'px';
              activeRegion.style.top = (event.clientY - activeRegion.startY) + 'px';
            } else if(activeRegion.isResizing) {
              activeRegion.style.width = (activeRegion.startWidth + (event.clientX - activeRegion.startX)) + 'px';
              activeRegion.style.height = (activeRegion.startHeight + (event.clientY - activeRegion.startY)) + 'px';
            }
          });

          document.addEventListener('mouseup', () => {
            if(!activeRegion) return;
            electron.ipcRenderer.send('update-region', {
              id: activeRegion.id,
              x: activeRegion.offsetLeft,
              y: activeRegion.offsetTop,
              width: activeRegion.offsetWidth,
              height: activeRegion.offsetHeight
            });
            activeRegion.isDragging = false;
            activeRegion.isResizing = false;
            activeRegion = null;
          });

          function updateTimer() {
            const nowSec = Date.now() / 1000;
            const elapsedSec = (nowSec + 9) % 120;
            const remainingSec = 120 - elapsedSec;
            const minutes = Math.floor(remainingSec / 60);
            const seconds = Math.floor(remainingSec % 60);

            const formatted =
              "0:" +
              (minutes < 10 ? "0" : "") + minutes + ":" +
              (seconds < 10 ? "0" : "") + seconds;

            const timerEl = document.getElementById("timerRegion");
            if (timerEl) {
              const label = timerEl.querySelector(".action-label");
              if (label) {
                const statusEmoji = label.getAttribute('data-status-emoji') || '';
                const showStatus = label.getAttribute('data-show-status') === 'true';
                label.textContent = formatted + (showStatus && statusEmoji ? ' ' + statusEmoji : '');
              }
            }
          }
          
          function updateTimerStatus(status, boardOpen) {
            const timerEl = document.getElementById("timerRegion");
            if (timerEl) {
              const label = timerEl.querySelector(".action-label");
              if (label) {
                let emoji = '';
                if (boardOpen && status === 'computing') {
                  emoji = '⏳';
                } else if (boardOpen && status === 'optimal') {
                  emoji = '✅';
                } else if (boardOpen && status === 'not-optimal') {
                  emoji = '❌';
                }
                label.setAttribute('data-status-emoji', emoji);
                label.setAttribute('data-show-status', boardOpen ? 'true' : 'false');
                updateTimer(); // Refresh display immediately
              }
            }
          }
          
          function updateSessionStats(sessionStats) {
            if (!sessionStats) return;
            
            const timerEl = document.getElementById("timerRegion");
            if (timerEl) {
              let sessionLine = timerEl.querySelector(".session-stats");
              if (!sessionLine) {
                sessionLine = document.createElement("div");
                sessionLine.className = "session-stats";
                sessionLine.style.fontSize = "17px";
                sessionLine.style.marginTop = "5px";
                sessionLine.style.opacity = "0.9";
                timerEl.appendChild(sessionLine);
              }
              
              const totalSeconds = Math.floor(sessionStats.sessionDurationSeconds);
              const hours = Math.floor(totalSeconds / 3600);
              const minutes = Math.floor((totalSeconds % 3600) / 60);
              const seconds = totalSeconds % 60;
              const timeStr = (hours < 10 ? '0' : '') + hours + ':' + 
                              (minutes < 10 ? '0' : '') + minutes + ':' + 
                              (seconds < 10 ? '0' : '') + seconds;
              
              const kp = (sessionStats.totalKpEarned / 100).toFixed(2);
              const kpPerHour = sessionStats.sessionDurationSeconds > 0 
                ? ((sessionStats.totalKpEarned / (sessionStats.sessionDurationSeconds / 3600)) / 100).toFixed(2)
                : '0.00';
              
              sessionLine.textContent = \`\${timeStr} | \${kp} | \${kpPerHour}/hr\`;
            }
          }
          
          setInterval(updateTimer, ${TIMER_INTERVAL_MS});
          updateTimer();
        </script>
      </body>
    `;

    this.window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    OverlayController.attachByTitle(this.window, WINDOW_TITLE, { hasTitleBarOnMac: false });
    this.setupGlobalShortcuts();

    this.window.on('blur', () => {
      this.editMode = false;
      this.window?.webContents.send('edit-mode-change', false, this.getOCRDataPayload());
    });
  }

  private setupGlobalShortcuts(): void {
    globalShortcut.register(TOGGLE_MOUSE_KEY, () => this.toggleEditMode());
    globalShortcut.register(TOGGLE_SHOW_KEY, () => {
      this.window?.webContents.send('visibility-change', false);
    });
    globalShortcut.register(FORCE_OPTIMAL_KEY, () => this.forceOptimalCalculation());
  }

  private forceOptimalCalculation(): void {
    console.log('[optimal] Forcing optimal calculation with no pruning...');
    this.ocrProcessor.forceOptimalRecalculation();
  }

  private getOCRDataPayload() {
    // Determine status: computing, optimal, or not optimal
    let status: 'computing' | 'optimal' | 'not-optimal' = 'not-optimal';
    
    if (this.ocrProcessor.inFlightFind) {
      status = 'computing';
    } else if (this.ocrProcessor.prevOptimalBounties.length > 0) {
      // Check if current active bounties match optimal
      const activeBountyKeys = Object.values(this.ocrProcessor.activeBounties).sort().join(',');
      const optimalBountyKeys = this.ocrProcessor.prevOptimalBounties.slice().sort().join(',');
      status = activeBountyKeys === optimalBountyKeys ? 'optimal' : 'not-optimal';
    }
    
    return {
      steps: formatSteps(this.ocrProcessor.displaySteps.length > 0 ? this.ocrProcessor.displaySteps : this.ocrProcessor.steps, 
                        this.ocrProcessor.displayKp || this.ocrProcessor.kp, 
                        this.ocrProcessor.displayDistanceSeconds || this.ocrProcessor.distanceSeconds, 
                        this.ocrProcessor.actualRunTimeSeconds, 
                        this.ocrProcessor.runStartTime),
      activeDrops: this.ocrProcessor.activeDrops,
      boardPickups: this.ocrProcessor.boardPickups,
      activeBountyIndices: Object.keys(this.ocrProcessor.activeBounties).map(Number),
      boardBountyIndices: Object.keys(this.ocrProcessor.boardBounties).map(Number),
      status,
      boardOpen: this.ocrProcessor.prevBoardOpenSignature,
      sessionStats: {
        totalKpEarned: this.ocrProcessor.getSessionStats().totalKpEarned,
        sessionDurationSeconds: (Date.now() - this.ocrProcessor.getSessionStats().sessionStartTime) / 1000,
      }
    };
  }

  private toggleEditMode(): void {
    this.editMode = !this.editMode;
    if (this.editMode) OverlayController.activateOverlay();
    else OverlayController.focusTarget();

    this.window?.webContents.send('edit-mode-change', this.editMode, this.getOCRDataPayload());
    this.window?.focus();
  }
}

// ───────────────────────────────────────────────────────────────
// OCR Processor
// ───────────────────────────────────────────────────────────────

type InFlightFind = {
  signature: string;
  startedAtMs: number;
  promise: Promise<void>;
};

class OCRProcessor {
  public activeBounties: { [index: number]: string } = {};
  public boardBounties: { [index: number]: string } = {};
  public activeDrops: number[] = [];
  public boardPickups: number[] = [];
  public steps: Step[] = [];
  public kp: number = 0;
  public distanceSeconds: number = NaN;
  
  // Display-only values (preserved after cache clear for UI)
  public displaySteps: Step[] = [];
  public displayKp: number = 0;
  public displayDistanceSeconds: number = NaN;

  private stepIdx: number = 0;
  private prevActiveBounties: { [index: number]: string } = {};

  public prevOptimalBounties: string[] = [];
  private prevAllBountiesSignature: string = '';
  public prevBoardOpenSignature: boolean = false;

  private processingScreenshot = false;

  private readonly concurrency: number;
  private readonly scale: number;

  private readonly perf: PerfWindow;
  private readonly warnFindBestMs: number;
  private readonly warnTickMs: number;

  private readonly useWorkerForPathfinder: boolean;
  private readonly pathfinderWorkerTimeoutMs: number;
  private readonly pathfinderWorker?: PathfinderWorker;

  public inFlightFind: InFlightFind | null = null;

  // once we have launched at least one compute attempt, we stop calling it "firstRun"
  private launchedAtLeastOnce = false;

  // NEW: prevent transient "DROP" flash right after accepting bounties
  private readonly dropGraceMs: number;
  private recentActiveAdds = new Map<number, number>(); // activeIndex -> expiresAtMs

  // NEW: "even cleaner": suppress all drops while recompute in-flight
  private readonly suppressDropsWhileRecompute: boolean;
  
  // Timer tracking for actual completion time
  public runStartTime: number = 0; // Timestamp when board closed (run started)
  public actualRunTimeSeconds: number = 0; // Actual time taken to complete all bounties
  private runBounties: string[] = []; // Bounties in the current run
  private runEstimatedTime: number = 0; // Estimated time for the current run
  
  // Session statistics (persists for entire application session)
  private sessionStats = {
    totalKpEarned: 0,
    totalDurationSeconds: 0,
    totalBountiesCompleted: 0,
    bountyTypeCounts: new Map<string, number>(), // Track count of each bounty type completed
    sessionStartTime: Date.now()
  };
  
  // Pruning options for pathfinder
  private forceOptimal: boolean = false;

  constructor(options?: {
    concurrency?: number;
    scale?: number;
    perfWindowSec?: number;
    warnFindBestMs?: number;
    warnTickMs?: number;
    useWorkerForPathfinder?: boolean;
    pathfinderWorkerTimeoutMs?: number;
    pathfinderWorkerScript?: string;

    dropGraceMs?: number;
    suppressDropsWhileRecompute?: boolean;
  }) {
    this.concurrency = Math.max(1, options?.concurrency ?? 2);
    this.scale = options?.scale ?? 1.0;

    this.perf = new PerfWindow(Math.max(5, options?.perfWindowSec ?? 30) * 1000);
    this.warnFindBestMs = options?.warnFindBestMs ?? 250;
    this.warnTickMs = options?.warnTickMs ?? 3000;

    this.useWorkerForPathfinder = options?.useWorkerForPathfinder ?? true;
    this.pathfinderWorkerTimeoutMs = options?.pathfinderWorkerTimeoutMs ?? 20000;

    this.dropGraceMs = Math.max(0, options?.dropGraceMs ?? 2000);
    this.suppressDropsWhileRecompute = options?.suppressDropsWhileRecompute ?? true;

    if (this.useWorkerForPathfinder) {
      if (!options?.pathfinderWorkerScript) {
        throw new Error("useWorkerForPathfinder=true but no pathfinderWorkerScript provided");
      }
      this.pathfinderWorker = new PathfinderWorker(options.pathfinderWorkerScript);
    }
  }

  async shutdown(): Promise<void> {
    if (this.pathfinderWorker) {
      await this.pathfinderWorker.terminate();
    }
  }

  private makeAllBountiesSignature(allBounties: string[]): string {
    return allBounties.slice().sort().join('|');
  }
  
  public forceOptimalRecalculation(): void {
    // Set flag to use optimal pruning settings
    this.forceOptimal = true;
    
    // Clear cached optimal solution so new solution is always accepted
    console.log('[optimal] Clearing cached solution for forced recalculation');
    this.prevOptimalBounties = [];
    this.kp = 0;
    this.distanceSeconds = NaN;
    
    // Clear in-flight find to allow new computation
    this.inFlightFind = null;
    
    // Trigger recomputation with current bounties
    const allBounties = [...Object.values(this.activeBounties), ...Object.values(this.boardBounties)]
      .filter(bounty => bounty !== 'PUMPKIN'); // Never consider pumpkins
    if (allBounties.length > 0) {
      const signature = this.makeAllBountiesSignature(allBounties);
      const boardOpen = this.prevBoardOpenSignature;
      this.launchFindBestIfNeeded(allBounties, boardOpen, signature, 'forceOptimal');
    } else {
      console.log('[optimal] No bounties available to recalculate');
      this.forceOptimal = false;
    }
  }
  
  public getSessionStats() {
    return this.sessionStats;
  }
  
  private logSessionStatus(completedBounty: string, bountyKp: number): void {
    const sessionDurationSeconds = (Date.now() - this.sessionStats.sessionStartTime) / 1000;
    const sessionDurationMinutes = Math.floor(sessionDurationSeconds / 60);
    
    // Format bounty type counts
    const bountyBreakdown: string[] = [];
    for (const [bountyType, count] of this.sessionStats.bountyTypeCounts.entries()) {
      bountyBreakdown.push(`${bountyType}:${count}`);
    }
    
    // Calculate KP/hr based on total session time (not just active run time)
    const kpPerHour = sessionDurationSeconds > 0 
      ? (this.sessionStats.totalKpEarned / (sessionDurationSeconds / 3600)) / 100
      : 0;
    
    const line1 = `[session] Bounty completed: ${completedBounty} (+${(bountyKp / 100).toFixed(2)} KP)`;
    const line2 = `[session] Session stats: ` +
      `Total=${this.sessionStats.totalBountiesCompleted} bounties, ` +
      `KP=${(this.sessionStats.totalKpEarned / 100).toFixed(2)}, ` +
      `Duration=${Math.floor(this.sessionStats.totalDurationSeconds / 60)}m ${Math.floor(this.sessionStats.totalDurationSeconds % 60)}s, ` +
      `Session=${sessionDurationMinutes}m, ` +
      `Est KP/hr=${kpPerHour.toFixed(2)}`;
    const line3 = `[session] Bounty breakdown: ${bountyBreakdown.join(', ')}`;
    
    // Log to console only (file logging happens when run completes)
    console.log(line1);
    console.log(line2);
    console.log(line3);
  }

  async processScreenshot(encodedImageBuffer: Buffer, imageWidth: number, imageHeight: number, regions: Regions): Promise<void> {
    if (this.processingScreenshot) return;
    this.processingScreenshot = true;

    const tickT0 = nowMsHiRes();

    try {
      const activeKeys = Object.keys(regions).filter(k => k.startsWith("activeBountyRegion"));
      const boardKeys = Object.keys(regions).filter(k => k.startsWith("boardRegion"));

      const scaledWidth = Math.max(1, Math.round(imageWidth * this.scale));
      const scaledHeight = Math.max(1, Math.round(imageHeight * this.scale));

      let base = sharp(encodedImageBuffer);
      if (this.scale !== 1.0) {
        base = base.resize(scaledWidth, scaledHeight);
      }

      // Title OCR
      const titleKey = "bountyBoardTitleRegion";
      const titleT0 = nowMsHiRes();
      const titleResult = regions[titleKey]
        ? await this.recognizeRegion(base, regions[titleKey], scaledWidth, scaledHeight)
        : { text: "" };
      this.perf.add('title_ocr', nowMsHiRes() - titleT0);

      const boardOpen = titleResult.text.includes("TIES");

      const keysToOCR = [
        ...activeKeys,
        ...(boardOpen ? boardKeys : [])
      ];

      const restT0 = nowMsHiRes();
      const regionResults = await mapWithConcurrency(keysToOCR, this.concurrency, async (key) => {
        const region = regions[key];
        const res = await this.recognizeRegion(base, region, scaledWidth, scaledHeight);
        return { key, text: res.text };
      });
      this.perf.add('rest_ocr', nowMsHiRes() - restT0);

      const pr0 = nowMsHiRes();
      await this.processOCRResultsAsync([{ key: titleKey, text: titleResult.text }, ...regionResults], boardOpen);
      this.perf.add('process_results_total', nowMsHiRes() - pr0);

    } finally {
      const tickDt = nowMsHiRes() - tickT0;
      this.perf.add('tick_total', tickDt);
      if (tickDt >= this.warnTickMs) console.warn(`[perf] tick slow: ${fmtMs(tickDt)} (ocrConcurrency=${this.concurrency}, scale=${this.scale})`);
      this.perf.maybeLog('[perf]');
      this.processingScreenshot = false;
    }
  }

  private clampRect(left: number, top: number, width: number, height: number, maxW: number, maxH: number) {
    let l = Math.max(0, Math.min(left, maxW - 1));
    let t = Math.max(0, Math.min(top, maxH - 1));
    let w = Math.max(1, width);
    let h = Math.max(1, height);
    if (l + w > maxW) w = Math.max(1, maxW - l);
    if (t + h > maxH) h = Math.max(1, maxH - t);
    return { left: l, top: t, width: w, height: h };
  }

  private async recognizeRegion(
    base: import('sharp').Sharp,
    region: Region,
    scaledImageWidth: number,
    scaledImageHeight: number
  ): Promise<{ text: string }> {
    const left = Math.round(region.x * this.scale);
    const top = Math.round(region.y * this.scale);
    const width = Math.round(region.width * this.scale);
    const height = Math.round(region.height * this.scale);

    const rect = this.clampRect(left, top, width, height, scaledImageWidth, scaledImageHeight);

    const croppedBuffer = await base
      .clone()
      .extract({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
      .png()
      .toBuffer();

    const text = await execTesseractFromBuffer(croppedBuffer);
    return { text: text.replace(/\s/g, "") };
  }

  private async computeFindBest(allBounties: string[], boardOpen: boolean, signature: string): Promise<FindBestResult> {
    const pruningOptions = this.forceOptimal 
      ? { maxCombinations: Infinity, maxEvaluations: Infinity, pruningThreshold: 1.0 }
      : { maxCombinations: 400, maxEvaluations: 150, pruningThreshold: 0.95 };
    
    const args: FindBestArgs = { 
      allBounties, 
      detectiveLevel, 
      battleOfFortuneholdCompleted,
      pruningOptions
    };
    const fb0 = nowMsHiRes();

    try {
      let res: FindBestResult;

      if (!this.useWorkerForPathfinder || !this.pathfinderWorker) {
        const respArr = pathfinder.findBestBounties(
          allBounties, 
          detectiveLevel, 
          battleOfFortuneholdCompleted, 
          true, 
          1,
          pruningOptions
        );
        const r0 = respArr[0];
        res = { bounties: r0.bounties, kp: r0.kp, actions: r0.actions, distance: r0.distance };
      } else {
        res = await this.pathfinderWorker.findBest(args, this.pathfinderWorkerTimeoutMs);
      }

      const dt = nowMsHiRes() - fb0;
      this.perf.add('find_best_bounties', dt);

      if (dt >= this.warnFindBestMs) {
        console.warn(`[perf] findBestBounties slow: ${fmtMs(dt)} boardOpen=${boardOpen} sig='${signature}' allBounties=${allBounties.length}`);
      }
      
      // Reset forceOptimal flag after computation
      if (this.forceOptimal) {
        console.log(`[optimal] Optimal calculation completed in ${fmtMs(dt)}`);
        this.forceOptimal = false;
      }

      return res;
    } catch (e: any) {
      const dt = nowMsHiRes() - fb0;
      this.perf.add('find_best_bounties', dt);
      console.error(`[perf] findBestBounties FAILED after ${fmtMs(dt)} boardOpen=${boardOpen} sig='${signature}':`, e?.stack ?? e);
      this.forceOptimal = false; // Reset on error too
      throw e;
    }
  }

  private launchFindBestIfNeeded(allBounties: string[], boardOpen: boolean, signature: string, reason: string): void {
    // If same signature already in-flight, do nothing.
    if (this.inFlightFind && this.inFlightFind.signature === signature) return;

    // If something else is in-flight too long, clear it so we can retry.
    if (this.inFlightFind) {
      const ageMs = Date.now() - this.inFlightFind.startedAtMs;
      if (ageMs > this.pathfinderWorkerTimeoutMs + 1000) {
        console.warn(`[perf] in-flight findBest stale (${ageMs}ms). Clearing and retrying. prevSig='${this.inFlightFind.signature}' newSig='${signature}'`);
        this.inFlightFind = null;
      } else {
        return;
      }
    }

    this.launchedAtLeastOnce = true;

    const startedAtMs = Date.now();
    console.log(`[perf] recompute optimal: reason=${reason} boardOpen=${boardOpen} all=${allBounties.length} sig='${signature}'`);

    const promise = (async () => {
      try {
        const optimalResp = await this.computeFindBest(allBounties, boardOpen, signature);

        // Calculate efficiency (KP/D) for the new solution
        const newEfficiency = optimalResp.kp / optimalResp.distance;
        
        // Calculate efficiency for the current solution (if we have one)
        const currentEfficiency = this.prevOptimalBounties.length > 0 && this.distanceSeconds > 0
          ? this.kp / this.distanceSeconds
          : 0;
        
        // Only update if the new solution is strictly better or we don't have a solution yet
        if (currentEfficiency === 0 || newEfficiency > currentEfficiency) {
          const improvement = newEfficiency - currentEfficiency;
          console.log(`[optimal] Accepting new solution: KP/D=${newEfficiency.toFixed(4)} (prev=${currentEfficiency.toFixed(4)}, improvement=${improvement.toFixed(4)})`);
          
          this.prevOptimalBounties = optimalResp.bounties;
          this.kp = optimalResp.kp;
          this.distanceSeconds = optimalResp.distance;
          
          // Update display values
          this.displayKp = optimalResp.kp;
          this.displayDistanceSeconds = optimalResp.distance;
          
          // When adding bounties mid-route, filter out steps for items we already have
          if (this.stepIdx > 0 && optimalResp.actions.length > 0) {
            // Determine which items we currently have (bought but not yet sold)
            const currentlyHaveItems = new Set<string>();
            
            // Look at active bounties to see what we have
            for (const bountyKey of Object.values(this.activeBounties)) {
              currentlyHaveItems.add(bountyKey);
            }
            
            // Filter new steps to skip buying items we already have
            const filteredSteps = [];
            for (const step of optimalResp.actions) {
              const s = step as any;
              
              // Skip buy steps for items we already have
              if (s?.type === 'buy' && currentlyHaveItems.has(s.item)) {
                continue;
              }
              
              filteredSteps.push(step);
              
              // Update our tracking
              if (s?.type === 'buy') {
                currentlyHaveItems.add(s.item);
              } else if (s?.type === 'sell') {
                currentlyHaveItems.delete(s.item);
              }
            }
            
            this.steps = filteredSteps;
            // Reset stepIdx since we've created a new filtered list
            this.stepIdx = 0;
            this.displaySteps = filteredSteps;
          } else {
            this.steps = optimalResp.actions;
            this.displaySteps = optimalResp.actions;
          }
        } else {
          const difference = newEfficiency - currentEfficiency;
          console.log(`[optimal] Rejecting new solution: KP/D=${newEfficiency.toFixed(4)} not better than current=${currentEfficiency.toFixed(4)} (difference=${difference.toFixed(4)})`);
        }
        
        // Always update signature to prevent repeated recalculations
        this.prevAllBountiesSignature = signature;
      } catch {
        // keep previous state
      } finally {
        if (this.inFlightFind?.signature === signature) this.inFlightFind = null;
      }
    })();

    this.inFlightFind = { signature, startedAtMs, promise };
  }

  private async processOCRResultsAsync(results: { key: string, text: string }[], boardOpen: boolean): Promise<void> {
    const detectedActive: { [index: number]: string } = {};
    const detectedBoard: { [index: number]: string } = {};

    for (const { key, text } of results) {
      if (!text) continue;
      if (key === "bountyBoardTitleRegion") continue;

      for (const bountyName of bountyNames) {
        if (text.includes(bountyName) && text.includes("6")) {
          const bountyKey = resolveBountyKeyFromName(bountyName);
          if (key.startsWith("activeBountyRegion")) {
            const index = parseInt(key.replace("activeBountyRegion", ""), 10);
            detectedActive[index] = bountyKey;
          } else if (key.startsWith("boardRegion")) {
            const index = parseInt(key.replace("boardRegion", ""), 10);
            detectedBoard[index] = bountyKey;
          }
        }
      }
    }

    // Track newly-added active bounties to suppress transient DROP
    const now = Date.now();
    const prevActiveIndices = new Set(Object.keys(this.prevActiveBounties).map(Number));
    const currActiveIndices = Object.keys(detectedActive).map(Number);

    for (const idx of currActiveIndices) {
      if (!prevActiveIndices.has(idx)) {
        this.recentActiveAdds.set(idx, now + this.dropGraceMs);
      }
    }
    for (const [idx, expiresAt] of this.recentActiveAdds.entries()) {
      if (expiresAt <= now) this.recentActiveAdds.delete(idx);
      else if (!(idx in detectedActive)) this.recentActiveAdds.delete(idx);
    }

    const allBounties = [...Object.values(detectedActive), ...Object.values(detectedBoard)]
      .filter(bounty => bounty !== 'PUMPKIN'); // Never consider pumpkins
    const signature = this.makeAllBountiesSignature(allBounties);

    const boardTransition = boardOpen !== this.prevBoardOpenSignature;
    const signatureChanged = signature !== this.prevAllBountiesSignature;

    const firstRun = !this.launchedAtLeastOnce;
    
    // Start/reset timer when board closes (run starts)
    if (boardTransition && !boardOpen && this.prevBoardOpenSignature) {
      this.runStartTime = Date.now();
      this.actualRunTimeSeconds = 0;
      this.runBounties = [...this.prevOptimalBounties]; // Capture bounties for this run
      this.runEstimatedTime = this.distanceSeconds; // Capture estimated time
      console.log('[timer] Run started - board closed');
    }
    
    // Check if we're adding bounties (not just completing them)
    const prevActiveCount = Object.keys(this.prevActiveBounties).length;
    const currActiveCount = Object.keys(detectedActive).length;
    const addingBounties = currActiveCount > prevActiveCount;
    
    // Check if board bounties changed (board refresh while open)
    const prevBoardBounties = Object.values(this.boardBounties).sort().join(',');
    const currBoardBounties = Object.values(detectedBoard).sort().join(',');
    const boardBountiesChanged = boardOpen && prevBoardBounties !== currBoardBounties;
    
    // Check if we're currently in the process of accepting/dropping bounties
    // (active bounties don't match optimal, but we're working towards it)
    const haveOptimal = this.prevOptimalBounties.length > 0;
    const activeBountyKeys = Object.values(detectedActive).sort().join(',');
    const optimalBountyKeys = this.prevOptimalBounties.slice().sort().join(',');
    const activeMatchesOptimal = activeBountyKeys === optimalBountyKeys;
    const adjustingBounties = haveOptimal && !activeMatchesOptimal && boardOpen;

    // Only recompute if:
    // - First run
    // - Board opens/closes
    // - Board bounties changed while board is open (refresh)
    // - Signature changed AND we're adding bounties (not just completing)
    // - Active bounties match optimal (finished adjusting, ready for new computation)
    // BUT NOT if we're in the middle of adjusting bounties
    const shouldRecompute = (firstRun || boardTransition || boardBountiesChanged || 
                            (signatureChanged && addingBounties && !adjustingBounties) ||
                            (activeMatchesOptimal && signatureChanged));
    
    if (shouldRecompute) {
      const reason = firstRun ? 'firstRun' 
                   : boardTransition ? 'boardTransition' 
                   : boardBountiesChanged ? 'boardRefresh'
                   : activeMatchesOptimal ? 'readyForNext'
                   : 'addingBounties';
      
      // Only reset stepIdx on firstRun or boardTransition
      // When adding bounties or board refreshes, preserve progress
      if (firstRun || boardTransition) {
        this.stepIdx = 0;
      }

      this.launchFindBestIfNeeded(allBounties, boardOpen, signature, reason);
      this.prevBoardOpenSignature = boardOpen;
    }

    // If no optimal yet, don't show DROP/ACCEPT
    const hasOptimal = this.prevOptimalBounties.length > 0;
    if (!hasOptimal) {
      this.activeDrops = [];
      this.boardPickups = [];
      this.activeBounties = detectedActive;
      this.boardBounties = detectedBoard;
      this.prevActiveBounties = { ...detectedActive };
      return;
    }

    const optimalBounties = this.prevOptimalBounties;

    // Step pruning when a bounty completes
    const prevCount = Object.keys(this.prevActiveBounties).length;
    const currCount = Object.keys(detectedActive).length;
    let completedBounty: string | undefined;
    
    if (prevCount > currCount && (prevCount - currCount) === 1) {
      // Count occurrences of each bounty type
      const prevBountyCounts = new Map<string, number>();
      const currBountyCounts = new Map<string, number>();
      
      for (const bounty of Object.values(this.prevActiveBounties)) {
        prevBountyCounts.set(bounty, (prevBountyCounts.get(bounty) || 0) + 1);
      }
      
      for (const bounty of Object.values(detectedActive)) {
        currBountyCounts.set(bounty, (currBountyCounts.get(bounty) || 0) + 1);
      }
      
      // Find which bounty was completed (count decreased)
      for (const [bounty, prevCount] of prevBountyCounts.entries()) {
        const currCount = currBountyCounts.get(bounty) || 0;
        if (currCount < prevCount) {
          completedBounty = bounty;
          break;
        }
      }
      
      if (completedBounty) {
        // Only track session statistics if board is closed (during actual run, not while adjusting at board)
        if (!boardOpen) {
          const bountyKp = (bountyData as any)[completedBounty]?.kp || 0;
          this.sessionStats.totalBountiesCompleted++;
          this.sessionStats.totalKpEarned += bountyKp;
          this.sessionStats.bountyTypeCounts.set(
            completedBounty, 
            (this.sessionStats.bountyTypeCounts.get(completedBounty) || 0) + 1
          );
          
          // Log session status after each bounty completion
          this.logSessionStatus(completedBounty, bountyKp);
        }
        
        // Always prune steps when a bounty is completed (regardless of board state)
        // Find the FIRST occurrence of selling this bounty (not the last)
        // This ensures we advance through steps in order
        let completedStepIdx = -1;
        for (let idx = 0; idx < this.steps.length; idx++) {
          const step = this.steps[idx] as any;
          if (step && step.type === "sell" && step.item === completedBounty) {
            completedStepIdx = idx;
            break;
          }
        }
        if (completedStepIdx !== -1) {
          this.stepIdx += completedStepIdx + 1;
          this.steps = this.steps.slice(completedStepIdx + 1);
          this.displaySteps = this.steps; // Update display steps too
        }
      }
    }
    
    // Check if all bounties are completed
    if (currCount === 0 && prevCount > 0 && completedBounty) {
      // All bounties just completed (we detected the last bounty being completed)
      
      // Calculate actual run time if we have a run start time
      const hasRunTiming = this.runStartTime > 0;
      if (hasRunTiming) {
        this.actualRunTimeSeconds = (Date.now() - this.runStartTime) / 1000;
        this.sessionStats.totalDurationSeconds += this.actualRunTimeSeconds;
        
        console.log(`[timer] All bounties completed! Actual time: ${this.actualRunTimeSeconds.toFixed(1)}s, Estimated: ${this.runEstimatedTime.toFixed(1)}s`);
        console.log(`[session] Run completed - added ${this.actualRunTimeSeconds.toFixed(1)}s to total session duration`);
      } else {
        console.log(`[timer] All bounties completed! (No timing data - run started before app launch)`);
      }
      
      // Log to file with session stats (always)
      const timestamp = new Date().toISOString();
      
      // Calculate session stats
      const sessionDurationSeconds = (Date.now() - this.sessionStats.sessionStartTime) / 1000;
      const sessionDurationMinutes = Math.floor(sessionDurationSeconds / 60);
      const kpPerHour = sessionDurationSeconds > 0 
        ? (this.sessionStats.totalKpEarned / (sessionDurationSeconds / 3600)) / 100
        : 0;
      
      // Format bounty breakdown
      const bountyBreakdown: string[] = [];
      for (const [bountyType, count] of this.sessionStats.bountyTypeCounts.entries()) {
        bountyBreakdown.push(`${bountyType}:${count}`);
      }
      
      const logPath = path.join(os.homedir(), '.kiro', 'session-log.txt');
      try {
        let logEntry = `${timestamp}\n`;
        
        // Only include [run] details if we have timing data
        if (hasRunTiming && this.runBounties.length > 0) {
          // Count bounties and format with counts
          const bountyCounts = new Map<string, number>();
          for (const bounty of this.runBounties) {
            bountyCounts.set(bounty, (bountyCounts.get(bounty) || 0) + 1);
          }
          const bountiesList = Array.from(bountyCounts.entries())
            .map(([bounty, count]) => count > 1 ? `${bounty}:${count}` : bounty)
            .join(', ');
          
          const actualMin = Math.floor(this.actualRunTimeSeconds / 60);
          const actualSec = Math.floor(this.actualRunTimeSeconds % 60);
          const estMin = Math.floor(this.runEstimatedTime / 60);
          const estSec = Math.floor(this.runEstimatedTime % 60);
          const diff = this.actualRunTimeSeconds - this.runEstimatedTime;
          const diffStr = diff >= 0 ? `+${diff.toFixed(1)}s` : `${diff.toFixed(1)}s`;
          
          logEntry += `[run] Completed: ${bountiesList}\n` +
            `[run] Estimated: ${estMin}m ${estSec}s | Actual: ${actualMin}m ${actualSec}s | Diff: ${diffStr}\n`;
        }
        
        // Always include session stats
        logEntry += `[session] Total=${this.sessionStats.totalBountiesCompleted} bounties, ` +
          `KP=${(this.sessionStats.totalKpEarned / 100).toFixed(2)}, ` +
          `Duration=${Math.floor(this.sessionStats.totalDurationSeconds / 60)}m ${Math.floor(this.sessionStats.totalDurationSeconds % 60)}s, ` +
          `Session=${sessionDurationMinutes}m, ` +
          `Est KP/hr=${kpPerHour.toFixed(2)}\n` +
          `[session] Bounty breakdown: ${bountyBreakdown.join(', ')}\n\n`;
        
        fs.appendFileSync(logPath, logEntry, 'utf8');
      } catch (err) {
        console.error('[run] Failed to write to log file:', err);
      }
      
      // Reset cached optimal solution so new bounties can be accepted
      // This prevents the system from comparing new bounties against the old completed set
      console.log(`[optimal] Clearing cached solution to allow new bounties`);
      this.prevOptimalBounties = [];
      this.kp = 0;
      this.distanceSeconds = NaN;
      this.steps = [];
      // Keep displayKp, displayDistanceSeconds, and displaySteps for UI
      this.runBounties = [];
      this.runEstimatedTime = 0;
    }

    // activeDrops
    //
    // Even cleaner option:
    // While recompute is in-flight (after a signatureChanged/boardTransition/firstRun), suppress ALL drops.
    // This ensures you never show incorrect DROP during the window where optimalBounties is stale.
    const recomputeInFlight = !!this.inFlightFind;
    if (this.suppressDropsWhileRecompute && recomputeInFlight) {
      this.activeDrops = [];
    } else {
      const activeDrops: number[] = [];
      const bountyIndices: { [bounty: string]: number[] } = {};
      for (const idxStr in detectedActive) {
        const idx = Number(idxStr);
        const bounty = detectedActive[idx];
        
        // Special case: Always drop pumpkin bounties
        if (bounty === 'PUMPKIN') {
          const expiresAt = this.recentActiveAdds.get(idx);
          if (!expiresAt || expiresAt <= Date.now()) {
            activeDrops.push(idx);
          }
          continue;
        }
        
        if (!bountyIndices[bounty]) bountyIndices[bounty] = [];
        bountyIndices[bounty].push(idx);
      }

      for (const bounty in bountyIndices) {
        const indices = bountyIndices[bounty].sort((a, b) => a - b);
        const allowed = optimalBounties.filter(b => b === bounty).length;

        if (indices.length > allowed) {
          const extras = indices.slice(0, indices.length - allowed);
          for (const idx of extras) {
            const expiresAt = this.recentActiveAdds.get(idx);
            if (expiresAt && expiresAt > Date.now()) {
              continue; // suppress transient DROP
            }
            activeDrops.push(idx);
          }
        }
      }

      this.activeDrops = activeDrops;
    }

    // boardPickups
    if (boardOpen) {
      let boardPickups: number[] = [];
      const sortedBoardIndices = Object.keys(detectedBoard).map(Number).sort((a, b) => a - b);
      const pickupCount: { [bounty: string]: number } = {};
      for (const idx of sortedBoardIndices) {
        const bounty = detectedBoard[idx];
        
        // Special case: Never accept pumpkin bounties
        if (bounty === 'PUMPKIN') {
          continue;
        }
        
        if (optimalBounties.includes(bounty)) {
          const allowed = optimalBounties.filter(b => b === bounty).length;
          const activeCount = Object.values(detectedActive).filter(b => b === bounty).length;
          const current = pickupCount[bounty] || 0;
          if (activeCount + current < allowed) {
            boardPickups.push(idx);
            pickupCount[bounty] = current + 1;
          }
        }
      }
      this.boardPickups = boardPickups;
    } else {
      this.boardPickups = [];
    }

    this.activeBounties = detectedActive;
    this.boardBounties = detectedBoard;
    this.prevActiveBounties = { ...detectedActive };
  }
}

// ───────────────────────────────────────────────────────────────
// formatSteps
// ───────────────────────────────────────────────────────────────

function formatSteps(steps: Step[], kp: number, distanceSeconds: number, actualRunTimeSeconds?: number, runStartTime?: number): string {
  const distance = distanceSeconds;
  const minutes = Math.floor(distance / 60);
  const seconds = distance - minutes * 60;

  const tokens: string[] = [];
  let i = 0;

  function formatNonCommand(text: string): string {
    return text
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word)
      .join(' ');
  }

  while (i < steps.length) {
    const step = steps[i] as any;
    if (step?.type === 'buy') {
      // Find the end of the consecutive buy sequence
      let buySequenceEnd = i;
      while (buySequenceEnd < steps.length && (steps[buySequenceEnd] as any)?.type === 'buy') {
        buySequenceEnd++;
      }
      
      // Count occurrences of each item in this buy sequence
      const itemCounts = new Map<string, number>();
      for (let j = i; j < buySequenceEnd; j++) {
        const buyStep = steps[j] as any;
        const item = buyStep.item;
        itemCounts.set(item, (itemCounts.get(item) || 0) + 1);
      }
      
      // Format each unique item with its count
      const buyTokens: string[] = [];
      const seenItems = new Set<string>();
      for (let j = i; j < buySequenceEnd; j++) {
        const buyStep = steps[j] as any;
        const item = buyStep.item;
        if (!seenItems.has(item)) {
          seenItems.add(item);
          const count = itemCounts.get(item) || 1;
          const countStr = count > 1 ? `${count}x ` : '';
          buyTokens.push(`<b style="color: rgb(231,76,60)">BUY</b> ${formatNonCommand(`${countStr}${item}`)}`);
        }
      }
      
      tokens.push(...buyTokens);
      i = buySequenceEnd;
    } else if (step?.type === 'sell') {
      let count = 1;
      // Count consecutive sell steps for the same item
      while (i + count < steps.length && (steps[i + count] as any)?.type === 'sell' && (steps[i + count] as any)?.item === step.item) {
        count++;
      }
      
      // For sell, we don't show count (just the item name)
      tokens.push(`<b style="color: rgb(46,204,113)">SELL</b> ${formatNonCommand(step.item)}`);
      i += count;
    } else if (step?.type === 'teleport') {
      let loc = step.location;
      if (loc === 'Crenopolis Market') loc = 'Market';
      else if (loc === 'Crenopolis Outskirts') loc = 'Outskirts';
      tokens.push(`<b style="color: rgb(165,105,189)">TELE</b> ${formatNonCommand(loc)}`);
      i++;
    } else if (step?.type === 'return') {
      tokens.push(formatNonCommand('Done 💰'));
      i++;
    } else {
      i++;
    }
  }

  if (!isNaN(distance)) {
    let timeInfo = `[${minutes}m ${seconds.toFixed(0)}s`;
    
    // Add live actual time in brackets if run is in progress
    if (runStartTime && runStartTime > 0) {
      const currentActualTime = actualRunTimeSeconds && actualRunTimeSeconds > 0 
        ? actualRunTimeSeconds  // Use final time if completed
        : (Date.now() - runStartTime) / 1000;  // Use live time if in progress
      
      const actualMinutes = Math.floor(currentActualTime / 60);
      const actualSeconds = currentActualTime - actualMinutes * 60;
      const actualTimeStr = `${actualMinutes}m ${actualSeconds.toFixed(0)}s`;
      
      // If run is completed, color the actual time based on performance
      if (actualRunTimeSeconds && actualRunTimeSeconds > 0) {
        const color = actualRunTimeSeconds <= distance ? 'rgb(46,204,113)' : 'rgb(231,76,60)';
        timeInfo += ` (<b style="color: ${color}">${actualTimeStr}</b>)`;
      } else {
        // Live time (not completed yet)
        timeInfo += ` (${actualTimeStr})`;
      }
    }
    
    timeInfo += ` | KP = ${(kp / 100).toFixed(2)} | KP/D = ${(kp / Math.max(1, distance)).toFixed(2)}]`;
    
    return `${timeInfo}\n${tokens.join(' → ')}`;
  }
  return tokens.join(' → ');
}

// ───────────────────────────────────────────────────────────────
// Screenshot Manager
// ───────────────────────────────────────────────────────────────

class ScreenshotManager {
  private stopped = false;
  private readonly perf: PerfWindow;

  constructor(
    private ocrProcessor: OCRProcessor,
    private regions: Regions,
    private onOCRUpdate?: (ocrData: {
      steps: string;
      activeDrops: number[];
      boardPickups: number[];
      activeBountyIndices?: number[];
      boardBountyIndices?: number[];
      status?: 'computing' | 'optimal' | 'not-optimal';
      boardOpen?: boolean;
      sessionStats?: {
        totalKpEarned: number;
        sessionDurationSeconds: number;
      };
    }) => void,
    private options?: { perfWindowSec?: number }
  ) {
    this.perf = new PerfWindow(Math.max(5, options?.perfWindowSec ?? 30) * 1000);
  }

  start(): void {
    this.stopped = false;

    const loop = async () => {
      while (!this.stopped) {
        const tickStartWall = Date.now();
        const tickStart = nowMsHiRes();

        try {
          const t0 = nowMsHiRes();
          const screenshotBuffer = OverlayController.screenshot();
          this.perf.add('screenshot_capture', nowMsHiRes() - t0);

          if (screenshotBuffer && screenshotBuffer.length > 0) {
            const w = OverlayController.targetBounds.width;
            const h = OverlayController.targetBounds.height;

            const screenshotImage = nativeImage.createFromBuffer(screenshotBuffer, { width: w, height: h });

            const e0 = nowMsHiRes();
            const jpegBuffer = screenshotImage.toJPEG(80);
            this.perf.add('encode_jpeg', nowMsHiRes() - e0);

            await this.ocrProcessor.processScreenshot(jpegBuffer, w, h, this.regions);

            if (this.onOCRUpdate) {
              // Determine status
              let status: 'computing' | 'optimal' | 'not-optimal' = 'not-optimal';
              
              if (this.ocrProcessor.inFlightFind) {
                status = 'computing';
              } else if (this.ocrProcessor.prevOptimalBounties.length > 0) {
                const activeBountyKeys = Object.values(this.ocrProcessor.activeBounties).sort().join(',');
                const optimalBountyKeys = this.ocrProcessor.prevOptimalBounties.slice().sort().join(',');
                status = activeBountyKeys === optimalBountyKeys ? 'optimal' : 'not-optimal';
              }
              
              this.onOCRUpdate({
                steps: formatSteps(this.ocrProcessor.displaySteps.length > 0 ? this.ocrProcessor.displaySteps : this.ocrProcessor.steps, 
                                  this.ocrProcessor.displayKp || this.ocrProcessor.kp, 
                                  this.ocrProcessor.displayDistanceSeconds || this.ocrProcessor.distanceSeconds, 
                                  this.ocrProcessor.actualRunTimeSeconds, 
                                  this.ocrProcessor.runStartTime),
                activeDrops: this.ocrProcessor.activeDrops,
                boardPickups: this.ocrProcessor.boardPickups,
                activeBountyIndices: Object.keys(this.ocrProcessor.activeBounties).map(Number),
                boardBountyIndices: Object.keys(this.ocrProcessor.boardBounties).map(Number),
                status,
                boardOpen: this.ocrProcessor.prevBoardOpenSignature,
                sessionStats: {
                  totalKpEarned: this.ocrProcessor.getSessionStats().totalKpEarned,
                  sessionDurationSeconds: (Date.now() - this.ocrProcessor.getSessionStats().sessionStartTime) / 1000,
                }
              });
            }
          }
        } catch (error) {
          console.error("Error taking screenshot / OCR:", error);
        } finally {
          this.perf.add('tick_total', nowMsHiRes() - tickStart);
          this.perf.maybeLog('[perf][screenshot]');
        }

        const elapsedWall = Date.now() - tickStartWall;
        const delay = Math.max(0, SCREENSHOT_INTERVAL_MS - elapsedWall);
        await sleep(delay);
      }
    };

    void loop();
  }

  stop(): void {
    this.stopped = true;
  }
}

// ───────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────

function defaultOcrConcurrency(): number {
  const cpu = os.cpus()?.length ?? 4;
  return Math.max(1, Math.min(2, cpu - 2));
}

async function main(): Promise<void> {
  const config = loadConfig();
  detectiveLevel = config.detectiveLevel ?? 500;
  battleOfFortuneholdCompleted = config.isBattleOfFortuneholdCompleted ?? true;

  const ocrConcurrency = config.ocrConcurrency ?? defaultOcrConcurrency();
  const ocrScale = config.ocrScale ?? 1.0;

  const perfWindowSec = config.perfLogWindowSec ?? 30;
  const warnFindBestMs = config.perfWarnFindBestMs ?? 250;
  const warnTickMs = config.perfWarnTickMs ?? 3000;

  const useWorkerForPathfinder = config.useWorkerForPathfinder ?? true;
  const pathfinderWorkerTimeoutMs = config.pathfinderWorkerTimeoutMs ?? 20000;

  const dropGraceMs = config.dropGraceMs ?? 2000;
  const suppressDropsWhileRecompute = config.suppressDropsWhileRecompute ?? true;

  console.log("Resolved detectiveLevel:", detectiveLevel);
  console.log("Resolved isBattleOfFortuneholdCompleted:", battleOfFortuneholdCompleted);
  console.log("Native tesseract OCR. Concurrency:", ocrConcurrency, "Scale:", ocrScale);
  console.log("Pathfinder worker:", useWorkerForPathfinder ? "ENABLED" : "DISABLED", "TimeoutMs:", pathfinderWorkerTimeoutMs);
  console.log("dropGraceMs:", dropGraceMs, "suppressDropsWhileRecompute:", suppressDropsWhileRecompute);
  
  const sessionLogPath = path.join(os.homedir(), '.kiro', 'session-log.txt');
  console.log("Session log file:", sessionLogPath);
  
  // Write session start marker to log file
  try {
    const logDir = path.dirname(sessionLogPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const timestamp = new Date().toISOString();
    const sessionStartMarker = `\n${'='.repeat(80)}\n[SESSION START] ${timestamp}\n${'='.repeat(80)}\n\n`;
    fs.appendFileSync(sessionLogPath, sessionStartMarker, 'utf8');
  } catch (err) {
    console.error("Failed to write session start marker to log file:", err);
  }

  const regionManager = new RegionManager(initialRegions, config);

  const workerPath = path.join(__dirname, 'pathfinder_worker.js');
  if (useWorkerForPathfinder) ensurePathfinderWorkerScript(workerPath);

  const ocrProcessor = new OCRProcessor({
    concurrency: ocrConcurrency,
    scale: ocrScale,
    perfWindowSec,
    warnFindBestMs,
    warnTickMs,
    useWorkerForPathfinder,
    pathfinderWorkerTimeoutMs,
    pathfinderWorkerScript: useWorkerForPathfinder ? workerPath : undefined,
    dropGraceMs,
    suppressDropsWhileRecompute,
  });

  ipcMain.on('update-region', (event, newRegion) => {
    regionManager.updateRegion(newRegion);
  });

  const overlayWindow = new OverlayWindow(regionManager, ocrProcessor);
  await overlayWindow.create();

  const screenshotManager = new ScreenshotManager(
    ocrProcessor,
    regionManager.regions,
    (ocrData) => {
      overlayWindow.window?.webContents.send('ocr-data-update', ocrData);
    },
    { perfWindowSec }
  );

  screenshotManager.start();

  app.on('will-quit', async () => {
    screenshotManager.stop();
    globalShortcut.unregisterAll();
    await ocrProcessor.shutdown();
  });
}

app.disableHardwareAcceleration();
app.on('ready', () => {
  setTimeout(main, process.platform === 'linux' ? 1000 : 0);
});
