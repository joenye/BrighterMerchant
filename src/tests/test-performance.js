// Test the performance issue with 12 bounties
const pathfinder = require('./dist/algorithm/pathfinder').default;
const bounties = require('./dist/algorithm/bounties').bounties;
const combinations = require('./dist/algorithm/combinations').default;

// Get all bounty keys
const allBountyKeys = Object.keys(bounties);

function getRandomBounties(count) {
  const shuffled = [...allBountyKeys].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// Create a version that evaluates all combinations without early stopping
function findBestBountiesExhaustive(testBounties, detectiveLevel, battleOfFortuneholdCompleted, roundTrip) {
  const GPS = require('./dist/algorithm/gps').default;
  const bountyData = require('./dist/algorithm/bounties').bounties;
  
  const gps = new GPS(detectiveLevel, battleOfFortuneholdCompleted);
  const allCombos = combinations(testBounties, Math.min(testBounties.length, 6));
  
  // Pre-calculate KP and estimated distance for sorting
  const comboData = allCombos.map((combo) => {
    const kp = combo.reduce((acc, bounty) => acc + bountyData[bounty].kp, 0);
    return { combo, kp };
  });
  
  // Sort by KP descending to find good solutions faster
  comboData.sort((a, b) => b.kp - a.kp);
  
  let bestResult = null;
  let bestEfficiency = 0;
  
  for (const { combo, kp } of comboData) {
    const route = pathfinder.findBestRoute(combo, gps, Number.MAX_SAFE_INTEGER, roundTrip);
    if (route) {
      const efficiency = kp / route.distance;
      if (efficiency > bestEfficiency) {
        bestEfficiency = efficiency;
        bestResult = {
          bounties: combo,
          kp,
          distance: route.distance,
          actions: route.actions
        };
      }
    }
  }
  
  return bestResult;
}

const numRuns = 10;
const results = [];

console.log(`Running ${numRuns} tests comparing optimized vs exhaustive search...\n`);

for (let i = 0; i < numRuns; i++) {
  const testBounties = getRandomBounties(12);
  
  console.log(`Run ${i + 1}/${numRuns}:`);
  console.log('  Bounties:', testBounties.join(', '));
  
  // Test optimized version (current implementation)
  let startOpt = Date.now();
  let optimizedResult;
  try {
    const res = pathfinder.findBestBounties(
      testBounties,
      469,
      true,
      true,
      5
    );
    const elapsedOpt = Date.now() - startOpt;
    optimizedResult = {
      time: elapsedOpt,
      efficiency: res.length > 0 ? res[0].kp / res[0].distance : 0,
      kp: res.length > 0 ? res[0].kp : 0,
      distance: res.length > 0 ? res[0].distance : 0,
      bounties: res.length > 0 ? res[0].bounties : []
    };
    console.log(`  Optimized:  ${(elapsedOpt / 1000).toFixed(2)}s, efficiency: ${optimizedResult.efficiency.toFixed(3)} KP/s`);
  } catch (error) {
    console.error(`  ❌ Optimized error: ${error.message}`);
    continue;
  }
  
  // Test exhaustive version (evaluate all combinations)
  let startExh = Date.now();
  let exhaustiveResult;
  try {
    const allCombos = combinations(testBounties, Math.min(testBounties.length, 6));
    console.log(`  Testing all ${allCombos.length} combinations exhaustively...`);
    
    const bestResult = findBestBountiesExhaustive(testBounties, 469, true, true);
    
    const elapsedExh = Date.now() - startExh;
    exhaustiveResult = {
      time: elapsedExh,
      efficiency: bestResult ? bestResult.kp / bestResult.distance : 0,
      kp: bestResult ? bestResult.kp : 0,
      distance: bestResult ? bestResult.distance : 0,
      bounties: bestResult ? bestResult.bounties : []
    };
    console.log(`  Exhaustive: ${(elapsedExh / 1000).toFixed(2)}s, efficiency: ${exhaustiveResult.efficiency.toFixed(3)} KP/s`);
  } catch (error) {
    console.error(`  ❌ Exhaustive error: ${error.message}`);
    console.error(error.stack);
    continue;
  }
  
  const deviation = ((optimizedResult.efficiency - exhaustiveResult.efficiency) / exhaustiveResult.efficiency * 100);
  const speedup = exhaustiveResult.time / optimizedResult.time;
  
  console.log(`  Deviation: ${deviation >= 0 ? '+' : ''}${deviation.toFixed(2)}% | Speedup: ${speedup.toFixed(1)}x`);
  
  // Show if different bounties were selected
  const optBountiesStr = optimizedResult.bounties.slice().sort().join(',');
  const exhBountiesStr = exhaustiveResult.bounties.slice().sort().join(',');
  if (optBountiesStr !== exhBountiesStr) {
    console.log(`  ⚠️  Different bounties selected!`);
    console.log(`    Opt: ${optimizedResult.bounties.join(', ')}`);
    console.log(`    Exh: ${exhaustiveResult.bounties.join(', ')}`);
  }
  console.log();
  
  results.push({
    optimized: optimizedResult,
    exhaustive: exhaustiveResult,
    deviation,
    speedup
  });
}

console.log('='.repeat(60));
console.log('Summary:');
console.log('='.repeat(60));

const avgOptTime = results.reduce((a, b) => a + b.optimized.time, 0) / results.length;
const avgExhTime = results.reduce((a, b) => a + b.exhaustive.time, 0) / results.length;
const avgDeviation = results.reduce((a, b) => a + b.deviation, 0) / results.length;
const avgSpeedup = results.reduce((a, b) => a + b.speedup, 0) / results.length;

const minDeviation = Math.min(...results.map(r => r.deviation));
const maxDeviation = Math.max(...results.map(r => r.deviation));

const perfectMatches = results.filter(r => Math.abs(r.deviation) < 0.01).length;

console.log(`Optimized avg time:   ${(avgOptTime / 1000).toFixed(2)}s`);
console.log(`Exhaustive avg time:  ${(avgExhTime / 1000).toFixed(2)}s`);
console.log(`Average speedup:      ${avgSpeedup.toFixed(1)}x`);
console.log(`Average deviation:    ${avgDeviation >= 0 ? '+' : ''}${avgDeviation.toFixed(2)}%`);
console.log(`Min deviation:        ${minDeviation >= 0 ? '+' : ''}${minDeviation.toFixed(2)}%`);
console.log(`Max deviation:        ${maxDeviation >= 0 ? '+' : ''}${maxDeviation.toFixed(2)}%`);
console.log(`Perfect matches:      ${perfectMatches}/${results.length}`);
console.log(`Total runs:           ${results.length}`);
