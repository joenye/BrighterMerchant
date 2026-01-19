// Test utility process pathfinder pool
// Run with: electron test-utility-process.js

const { app } = require('electron');
const path = require('path');

app.on('ready', async () => {
  console.log('Testing utilityProcess-based pathfinder pool...\n');

  const { PathfinderUtilityPool } = require('./dist/app/workers/pathfinder-utility');
  
  const pool = new PathfinderUtilityPool(11);
  pool.setConfig(500, true);

  try {
    await pool.warmup();
    console.log();

    // Test bounties from the slow run
    const testBounties = ['CUPS','HAM_LEG','IVORY_SWIRL_PEARL','LANDSCAPE_PAINTING','LANDSCAPE_PAINTING','PIZZA','PORCELAIN_DOLL','POSTCARDS','RED_CABBAGE','SILK','STRIPED_VASE'];

    console.log(`Testing with 11 bounties (336 combinations)...\n`);

    const times = [];
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      await pool.findBest({
        allBounties: testBounties,
        detectiveLevel: 500,
        battleOfFortuneholdCompleted: true,
        pruningOptions: { maxCombinations: Infinity, pruningThreshold: 1.0 }
      }, 60000);
      const elapsed = Date.now() - start;
      times.push(elapsed);
      console.log(`Run ${i + 1}: ${elapsed}ms\n`);
    }

    console.log('='.repeat(50));
    console.log(`Summary: min=${Math.min(...times)}ms, max=${Math.max(...times)}ms, avg=${Math.round(times.reduce((a,b)=>a+b,0)/times.length)}ms`);

    await pool.terminate();
  } catch (err) {
    console.error('Error:', err);
  }

  app.quit();
});
