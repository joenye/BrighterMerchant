// Test pathfinder directly in main process (no workers)
// Run with: electron test-main-process.js

const { app } = require('electron');
const pathfinder = require('./dist/algorithm/pathfinder').default;
const GPS = require('./dist/algorithm/gps').default;
const combinations = require('./dist/algorithm/combinations').default;
const { bounties } = require('./dist/algorithm/bounties');

app.on('ready', async () => {
  console.log('Testing pathfinder in Electron main process (no workers)...\n');
  
  const gps = new GPS(500, true);
  
  // Warm up GPS cache
  const { markets, bountyBoard } = require('./dist/algorithm/nodes');
  const marketNodes = Object.values(markets).map(m => m.node);
  marketNodes.push(bountyBoard.node);
  for (const from of marketNodes) {
    for (const to of marketNodes) {
      if (from !== to) gps.distance(from, to);
    }
  }
  console.log('GPS cache warmed up\n');
  
  // Test bounties from your slow run
  const testBounties = ['CUPS','HAM_LEG','IVORY_SWIRL_PEARL','LANDSCAPE_PAINTING','LANDSCAPE_PAINTING','PIZZA','PORCELAIN_DOLL','POSTCARDS','RED_CABBAGE','SILK','STRIPED_VASE'];
  
  const combos = combinations(testBounties, 6);
  console.log(`Testing ${combos.length} combinations...\n`);
  
  for (let run = 0; run < 5; run++) {
    const start = Date.now();
    let results = [];
    
    for (const combo of combos) {
      const kp = combo.reduce((acc, b) => acc + bounties[b].kp, 0);
      const route = pathfinder.findBestRoute(combo, gps, Number.MAX_SAFE_INTEGER, true);
      if (route) {
        results.push({ combo, kp, distance: route.distance });
      }
    }
    
    results.sort((a, b) => b.kp / b.distance - a.kp / a.distance);
    const elapsed = Date.now() - start;
    
    console.log(`Run ${run + 1}: ${elapsed}ms (${(elapsed / combos.length).toFixed(1)}ms per combo)`);
  }
  
  console.log('\nDone');
  app.quit();
});
