const { normalizeTitleForLookup } = require('./src/modules/string-utils.js');

// Test cases
const tests = [
  '!@#$%^&*()1234567890VG2.0',
  'Terminator 2: Judgment Day (VHS)',
  'E.T. the Extra-Terrestrial (VHS Collectible)',
  'Movie (DVD)',
  'Pulp Fiction (1994) - Special',
  'Matrix & Revolution',
];

tests.forEach(input => {
  const out = normalizeTitleForLookup(input);
  console.log(JSON.stringify(input), '→', JSON.stringify(out));
});