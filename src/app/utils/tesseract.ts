import { spawn } from 'child_process';
import * as os from 'os';
import { createWorker, createScheduler, PSM } from 'tesseract.js';

type OCRMethod = 'native' | 'tesseract-js' | 'auto';

let tesseractScheduler: ReturnType<typeof createScheduler> | null = null;
let resolvedMethod: 'native' | 'tesseract-js' | null = null;
let nativeTesseractAvailable: boolean | null = null;
let nativeTesseractPath: string = 'tesseract';
let initPromise: Promise<void> | null = null;
let checkPromise: Promise<boolean> | null = null;
let workerCount: number = 0;

// Max OCR regions: 6 active + 6 board + 1 title = 13
const MAX_OCR_REGIONS = 13;

/**
 * Calculate optimal worker count based on CPU cores
 */
export function getOptimalWorkerCount(): number {
  const cpuCount = os.cpus()?.length ?? 4;
  // Use up to (cores - 1) workers, but cap at MAX_OCR_REGIONS
  // Leave 1 core for main thread and other tasks
  return Math.max(2, Math.min(cpuCount - 1, MAX_OCR_REGIONS));
}

/**
 * Check if native tesseract binary is available (cached, single check)
 */
export async function checkNativeTesseract(): Promise<boolean> {
  if (nativeTesseractAvailable !== null) {
    return nativeTesseractAvailable;
  }
  
  // Prevent multiple concurrent checks
  if (checkPromise) {
    return checkPromise;
  }

  checkPromise = new Promise((resolve) => {
    // Try common paths where tesseract might be installed
    const tesseractPaths = [
      'tesseract',                          // System PATH
      '/opt/homebrew/bin/tesseract',        // macOS Homebrew (Apple Silicon)
      '/usr/local/bin/tesseract',           // macOS Homebrew (Intel) / Linux
      '/usr/bin/tesseract',                 // Linux system
    ];
    
    let attempts = 0;
    const tryNext = () => {
      if (attempts >= tesseractPaths.length) {
        console.log('[OCR] Native tesseract not found in any known location');
        nativeTesseractAvailable = false;
        resolve(false);
        return;
      }
      
      const tesseractPath = tesseractPaths[attempts];
      attempts++;
      
      const child = spawn(tesseractPath, ['--version']);
      let resolved = false;
      
      const finish = (available: boolean) => {
        if (resolved) return;
        resolved = true;
        if (available) {
          console.log('[OCR] Found native tesseract at:', tesseractPath);
          nativeTesseractPath = tesseractPath;
          nativeTesseractAvailable = true;
          resolve(true);
        } else {
          tryNext();
        }
      };
      
      child.on('error', () => finish(false));
      child.on('close', (code) => finish(code === 0));
      
      // Timeout after 1 second per attempt
      setTimeout(() => {
        child.kill();
        finish(false);
      }, 1000);
    };
    
    tryNext();
  });
  
  return checkPromise;
}

/**
 * Initialize tesseract.js scheduler with multiple workers
 */
async function initTesseractJS(): Promise<void> {
  if (tesseractScheduler) return;
  if (initPromise) return initPromise;
  
  initPromise = (async () => {
    workerCount = getOptimalWorkerCount();
    console.log(`[OCR] Initializing tesseract.js with ${workerCount} workers (${os.cpus()?.length ?? '?'} CPU cores detected)...`);
    const t0 = Date.now();
    
    tesseractScheduler = createScheduler();
    
    // Create workers in parallel for faster initialization
    const workerPromises = Array.from({ length: workerCount }, async () => {
      const worker = await createWorker('eng');
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:'
      });
      tesseractScheduler!.addWorker(worker);
    });
    
    await Promise.all(workerPromises);
    console.log(`[OCR] tesseract.js initialized in ${Date.now() - t0}ms`);
  })();
  
  return initPromise;
}

/**
 * Execute OCR using native tesseract binary
 */
function execNativeTesseract(imageBuffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(nativeTesseractPath, [
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

/**
 * Execute OCR using tesseract.js (via scheduler for parallel processing)
 */
async function execTesseractJS(imageBuffer: Buffer): Promise<string> {
  if (!tesseractScheduler) {
    await initTesseractJS();
  }
  
  const { data: { text } } = await tesseractScheduler!.addJob('recognize', imageBuffer);
  return text;
}

/**
 * Main OCR function with automatic fallback
 * @param imageBuffer - Image buffer to process
 * @param method - OCR method: 'native' (default), 'tesseract-js', or 'auto'
 */
export async function execTesseractFromBuffer(
  imageBuffer: Buffer,
  method: OCRMethod = 'native'
): Promise<string> {
  // If we've already resolved a method, use it (sticky)
  if (resolvedMethod) {
    if (resolvedMethod === 'native') {
      return await execNativeTesseract(imageBuffer);
    }
    return await execTesseractJS(imageBuffer);
  }

  // Auto mode: check native availability and decide
  if (method === 'auto') {
    const hasNative = await checkNativeTesseract();
    method = hasNative ? 'native' : 'tesseract-js';
    console.log(`[OCR] Auto-selected: ${method} (native available: ${hasNative})`);
  }

  // Try native first if requested
  if (method === 'native') {
    try {
      const result = await execNativeTesseract(imageBuffer);
      if (!resolvedMethod) {
        console.log('[OCR] Using native tesseract binary');
        resolvedMethod = 'native';
      }
      return result;
    } catch (err) {
      console.warn('[OCR] Native tesseract failed, falling back to tesseract.js:', err);
      method = 'tesseract-js';
    }
  }

  // Use tesseract.js
  if (!resolvedMethod) {
    console.log('[OCR] Using tesseract.js');
    resolvedMethod = 'tesseract-js';
  }
  return await execTesseractJS(imageBuffer);
}

/**
 * Cleanup resources
 */
export async function shutdownTesseract(): Promise<void> {
  if (tesseractScheduler) {
    await tesseractScheduler.terminate();
    tesseractScheduler = null;
    initPromise = null;
    console.log('[OCR] tesseract.js scheduler terminated');
  }
}

/**
 * Pre-initialize tesseract.js workers (call on app startup to avoid first-call delay)
 */
export async function preInitTesseractJS(): Promise<void> {
  await initTesseractJS();
}
