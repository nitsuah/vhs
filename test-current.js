const { normalizeTitleForLookup } = require('./src/modules/string-utils.js');

const testCases = [
  'Interstellar: The Movie (2014)',
  'E.T. the Extra-Terrestrial (VHS Collectible)',
  'The Shining (Director\'s Cut)',
  '!@#$%^&*()1234567890VG2.0',
  'Pulp Fiction (1994) - Special',
  'Matrix Reloaded (VHS)',
  'Star Wars Episode V (VHS)'
];

testCases.forEach((tc, i) => {
  console.log(`${i + 1}. ${tc} → ${normalizeTitleForLookup(tc)}`);
});
