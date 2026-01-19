/**
 * Utility process script for pathfinding.
 * This runs in a separate Node.js process via Electron's utilityProcess API.
 * 
 * Unlike worker_threads, utility processes have their own V8 instance
 * with more predictable JIT behavior.
 */

import GPS from '../../algorithm/gps';
import pathfinder from '../../algorithm/pathfinder';
import { markets, bountyBoard } from '../../algorithm/nodes';

interface ComboTask {
  combo: string[];
  kp: number;
  estimatedEfficiency: number;
}

interface ComboResult {
  combo: string[];
  kp: number;
  actions: any[];
  distance: number;
}

let cachedGps: GPS | null = null;
let cachedGpsKey: string | null = null;

function getGps(detectiveLevel: number, battleOfFortuneholdCompleted: boolean): GPS {
  const key = `${detectiveLevel}:${battleOfFortuneholdCompleted}`;
  if (cachedGpsKey === key && cachedGps) return cachedGps;
  cachedGps = new GPS(detectiveLevel, battleOfFortuneholdCompleted);
  cachedGpsKey = key;
  return cachedGps;
}

process.parentPort?.on('message', (event) => {
  const msg = event.data;
  const msgReceived = Date.now();

  if (msg.type === 'warmup') {
    try {
      const gps = getGps(msg.detectiveLevel, msg.battleOfFortuneholdCompleted);
      const marketNodes = Object.values(markets).map((m: any) => m.node);
      marketNodes.push(bountyBoard.node);
      for (const from of marketNodes) {
        for (const to of marketNodes) {
          if (from !== to) gps.distance(from, to);
        }
      }
      process.parentPort?.postMessage({ id: msg.id, ok: true });
    } catch (e: any) {
      process.parentPort?.postMessage({ id: msg.id, ok: false, error: e?.stack ?? String(e) });
    }
    return;
  }

  if (msg.type !== 'evaluateChunk') return;

  try {
    const { id, tasks, detectiveLevel, battleOfFortuneholdCompleted, roundTrip, numResults, pruningThreshold } = msg;
    const computeStart = Date.now();
    const gps = getGps(detectiveLevel, battleOfFortuneholdCompleted);
    let results: ComboResult[] = [];
    let evaluated = 0;

    for (const task of tasks as ComboTask[]) {
      if (pruningThreshold < 1.0 && results.length >= numResults) {
        const worstEfficiency = results[results.length - 1].kp / results[results.length - 1].distance;
        if (task.estimatedEfficiency < worstEfficiency * pruningThreshold) break;
      }

      const threshold = results.length >= numResults ? results[results.length - 1].distance : Number.MAX_SAFE_INTEGER;
      const route = pathfinder.findBestRoute(task.combo, gps, threshold, roundTrip);
      evaluated++;
      if (route === null) continue;

      results.push({ combo: task.combo, kp: task.kp, actions: route.actions, distance: route.distance });

      if (results.length > numResults) {
        results.sort((a, b) => b.kp / b.distance - a.kp / a.distance);
        results = results.slice(0, numResults);
      }
    }

    results.sort((a, b) => b.kp / b.distance - a.kp / a.distance);
    const computeTime = Date.now() - computeStart;
    const totalTime = Date.now() - msgReceived;

    process.parentPort?.postMessage({
      id,
      ok: true,
      results,
      timing: { computeTime, totalTime, evaluated, tasks: tasks.length }
    });
  } catch (e: any) {
    process.parentPort?.postMessage({ id: msg?.id, ok: false, error: e?.stack ?? String(e) });
  }
});

// Startup log removed - too verbose with 11 processes
