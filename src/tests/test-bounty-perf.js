// Test bounty calculation performance for 12 bounties with different combinations
const pathfinder = require('./dist/algorithm/pathfinder').default;
const { bounties } = require('./dist/algorithm/bounties');

const allBountyKeys = Object.keys(bounties);

function getRandomBounties(count) {
  const shuffled = [...allBountyKeys].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// Predefined test cases with different characteristics
const testCases = [
  { name: 'Low level bounties', bounties: ['CARROTS', 'SOAP', 'RIBS', 'MEAT_WRAP', 'BEEF_JOINT', 'CLOCKWORK_SHEEP', 'PORCELAIN_DOLL', 'PLATES', 'PIN_BADGE', 'PUMPKIN', 'PIZZA', 'BANANAS'] },
  { name: 'High level bounties', bounties: ['UNICORN_HAIR', 'PORTRAIT_PAINTING', 'PENDULUM_CLOCK', 'MONOCLE', 'TOPHILL_WINE', 'ANTIQUE_BOOK', 'TRUFFLES', 'TEA_LIGHTS', 'STRIPED_VASE', 'FARGUST_WINE', 'OLD_RARG', 'SILK'] },
  { name: 'Mixed levels', bounties: ['CARROTS', 'BANANAS', 'HOMESPUN_CLOTH', 'SPECTACLES', 'RUG', 'TOMATOES', 'CURRY', 'ORANGES', 'SILK', 'UNICORN_HAIR', 'PENDULUM_CLOCK', 'TRUFFLES'] },
  { name: 'High KP bounties', bounties: ['ORANGES', 'PENDULUM_CLOCK', 'UNICORN_HAIR', 'CURRY', 'CARROTS', 'PIZZA', 'ARGANIAN_WINE', 'OLD_RARG', 'BATH_SALTS', 'SNOW_GLOBE', 'RHUBARB', 'TOMATOES'] },
];

console.log('='.repeat(70));
console.log('Bounty Calculation Performance Test (12 bounties)');
console.log('='.repeat(70));
console.log();

const results = [];

// Run predefined test cases
for (const testCase of testCases) {
  console.log(`Test: ${testCase.name}`);
  console.log(`Bounties: ${testCase.bounties.join(', ')}`);
  
  const start = Date.now();
  const result = pathfinder.findBestBounties(
    testCase.bounties,
    500,  // detective level
    true, // battle completed
    true, // round trip
    5     // num results
  );
  const elapsed = Date.now() - start;
  
  if (result.length > 0) {
    const best = result[0];
    console.log(`  Time: ${elapsed}ms`);
    console.log(`  Best combo: ${best.bounties.join(', ')}`);
    console.log(`  KP: ${best.kp.toFixed(1)}, Distance: ${best.distance.toFixed(1)}s, Efficiency: ${(best.kp / best.distance).toFixed(4)} KP/s`);
  } else {
    console.log(`  Time: ${elapsed}ms - No result found`);
  }
  console.log();
  
  results.push({ name: testCase.name, time: elapsed, result });
}

// Run random test cases
console.log('-'.repeat(70));
console.log('Random bounty combinations:');
console.log('-'.repeat(70));
console.log();

for (let i = 0; i < 5; i++) {
  const randomBounties = getRandomBounties(12);
  console.log(`Random test ${i + 1}:`);
  console.log(`Bounties: ${randomBounties.join(', ')}`);
  
  const start = Date.now();
  const result = pathfinder.findBestBounties(
    randomBounties,
    500,
    true,
    true,
    5
  );
  const elapsed = Date.now() - start;
  
  if (result.length > 0) {
    const best = result[0];
    console.log(`  Time: ${elapsed}ms`);
    console.log(`  Best combo: ${best.bounties.join(', ')}`);
    console.log(`  KP: ${best.kp.toFixed(1)}, Distance: ${best.distance.toFixed(1)}s, Efficiency: ${(best.kp / best.distance).toFixed(4)} KP/s`);
  } else {
    console.log(`  Time: ${elapsed}ms - No result found`);
  }
  console.log();
  
  results.push({ name: `Random ${i + 1}`, time: elapsed, result });
}

// Summary
console.log('='.repeat(70));
console.log('Summary:');
console.log('='.repeat(70));
const times = results.map(r => r.time);
console.log(`Min time: ${Math.min(...times)}ms`);
console.log(`Max time: ${Math.max(...times)}ms`);
console.log(`Avg time: ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)}ms`);
