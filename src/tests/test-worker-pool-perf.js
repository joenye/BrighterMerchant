// Test bounty calculation performance using the worker pool (same as app)
const path = require('path');
const { PathfinderPool, ensurePathfinderWorkerScript } = require('./dist/app/workers/pathfinder-pool');
const { bounties } = require('./dist/algorithm/bounties');

const allBountyKeys = Object.keys(bounties);

function getRandomBounties(count) {
  const shuffled = [...allBountyKeys].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

async function runTests() {
  const workerPath = path.join(__dirname, 'dist/app/pathfinder_worker.js');
  ensurePathfinderWorkerScript(workerPath, true);
  
  const pool = new PathfinderPool(workerPath, 11); // Same as app with 12 cores
  pool.setConfig(500, true);
  
  console.log('Warming up worker pool...');
  await pool.warmup();
  console.log();

  const testCases = [
    { name: 'From logs: 12 bounties (490 combos)', bounties: ['BEEF_JOINT', 'BEEF_JOINT', 'CARROTS', 'CAVIAR', 'HAM_LEG', 'LANDSCAPE_PAINTING', 'ORANGES', 'ORANGES', 'RHUBARB', 'RIBS', 'SCENTED_CANDLE', 'STRIPED_VASE'] },
    { name: 'From logs: 11 bounties (245 combos)', bounties: ['BEEF_JOINT', 'BEEF_JOINT', 'HAM_LEG', 'ORANGES', 'ORANGES', 'PORTRAIT_PAINTING', 'POSTCARDS', 'SHARPSEED_WINE', 'SOAP', 'STEAK', 'UNICORN_HAIR'] },
    { name: 'From logs: 12 bounties with duplicates', bounties: ['BEEF_JOINT', 'BEEF_JOINT', 'BEEF_JOINT', 'CARROTS', 'CUPS', 'HAM_LEG', 'ORANGES', 'ORANGES', 'RAINBOW_CHEESE', 'SOAP', 'TIN_POCKET_WATCH', 'UNICORN_DUST'] },
  ];

  console.log('='.repeat(70));
  console.log('Worker Pool Performance Test (matching app behavior)');
  console.log('='.repeat(70));
  console.log();

  // Test with default pruning (maxCombinations=400)
  console.log('--- With pruning (maxCombinations=400) ---');
  for (const testCase of testCases) {
    console.log(`\nTest: ${testCase.name}`);
    
    const start = Date.now();
    try {
      const result = await pool.findBest({
        allBounties: testCase.bounties,
        detectiveLevel: 500,
        battleOfFortuneholdCompleted: true,
        pruningOptions: { maxCombinations: 400, pruningThreshold: 0.95 }
      }, 60000);
      
      const elapsed = Date.now() - start;
      console.log(`  Time: ${elapsed}ms`);
      console.log(`  Best: ${result.bounties.join(', ')}`);
      console.log(`  KP: ${result.kp.toFixed(1)}, Distance: ${result.distance.toFixed(1)}s, Efficiency: ${(result.kp / result.distance).toFixed(4)}`);
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
  }

  // Test with no pruning (optimal mode)
  console.log('\n--- Without pruning (optimal mode) ---');
  for (const testCase of testCases) {
    console.log(`\nTest: ${testCase.name}`);
    
    const start = Date.now();
    try {
      const result = await pool.findBest({
        allBounties: testCase.bounties,
        detectiveLevel: 500,
        battleOfFortuneholdCompleted: true,
        pruningOptions: { maxCombinations: Infinity, pruningThreshold: 1.0 }
      }, 60000);
      
      const elapsed = Date.now() - start;
      console.log(`  Time: ${elapsed}ms`);
      console.log(`  Best: ${result.bounties.join(', ')}`);
      console.log(`  KP: ${result.kp.toFixed(1)}, Distance: ${result.distance.toFixed(1)}s, Efficiency: ${(result.kp / result.distance).toFixed(4)}`);
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
  }

  // Random tests
  console.log('\n--- Random 12-bounty tests (with pruning) ---');
  const randomTimes = [];
  for (let i = 0; i < 5; i++) {
    const randomBounties = getRandomBounties(12);
    console.log(`\nRandom ${i + 1}: ${randomBounties.join(', ')}`);
    
    const start = Date.now();
    try {
      const result = await pool.findBest({
        allBounties: randomBounties,
        detectiveLevel: 500,
        battleOfFortuneholdCompleted: true,
        pruningOptions: { maxCombinations: 400, pruningThreshold: 0.95 }
      }, 60000);
      
      const elapsed = Date.now() - start;
      randomTimes.push(elapsed);
      console.log(`  Time: ${elapsed}ms, Efficiency: ${(result.kp / result.distance).toFixed(4)}`);
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('Summary (random tests with pruning):');
  console.log(`  Min: ${Math.min(...randomTimes)}ms`);
  console.log(`  Max: ${Math.max(...randomTimes)}ms`);
  console.log(`  Avg: ${(randomTimes.reduce((a, b) => a + b, 0) / randomTimes.length).toFixed(0)}ms`);

  await pool.terminate();
  console.log('\nWorker pool terminated.');
}

runTests().catch(console.error);
