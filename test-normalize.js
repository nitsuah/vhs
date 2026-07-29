const { levenshteinDistance, normalizeTitleForLookup } = require('./src/modules/string-utils.js');

const levenshteinTests = [
  { s1: 'test', s2: 'test', expected: 0 },
  { s1: 'test', s2: 'testing', expected: 3 },
  { s1: 'test', s2: 'tent', expected: 1 },
  { s1: 'testing', s2: 'test', expected: 3 },
  { s1: '', s2: 'test', expected: 4 },
  { s1: '', s2: '', expected: 0 },
  { s1: 'kitten', s2: 'sitting', expected: 3 },
  { s1: 'algorithm', s2: 'altruistic', expected: 6 },
  { s1: 'TEST', s2: 'test', expected: 4 },
  { s1: 'abc', s2: 'xyz', expected: 3 },
  { s1: 'The quick brown fox jumps over the lazy dog', s2: 'The quick brown fox leaped over the lazy cat', expected: 6 },
];

const normalizeTests = [
  { input: 'The Godfather (VHS)', expected: 'godfather' },
  { input: 'THE DARK KNIGHT DVD', expected: 'dark knight' },
  { input: 'Inception (Blu-ray) Special Edition', expected: 'inception' },
  { input: 'Pulp Fiction (1994) - Special', expected: 'pulp fiction' },
  { input: 'A Star Is Born', expected: 'star is born' },
  { input: '  The   Matrix   ', expected: 'matrix' },
  { input: 'Matrix & Revolution', expected: 'matrix and revolution' },
  { input: '', expected: '' },
  { input: null, expected: '' },
  { input: '   ', expected: '' },
  { input: 'Jaws (VHS)', expected: 'jaws' },
  { input: 'Star Wars (SDE) VHS Edition', expected: 'star wars' },
  { input: 'E.T. the Extra-Terrestrial (VHS Collectible)', expected: 'e.t. the extra-terrestrial' },
  { input: 'The Dark Knight (Movie, VHS Edition)', expected: 'dark knight' },
  { input: 'Back to the Future (VHS, Special Edition)', expected: 'back to the future' },
  { input: 'Pulp Fiction (1994)', expected: 'pulp fiction' },
  { input: 'The Dark Knight (2008)', expected: 'dark knight' },
  { input: 'Forrest Gump (1994)', expected: 'forrest gump' },
  { input: 'Matrix! (1999)', expected: 'matrix' },
  { input: 'The Dark Knight... DVD', expected: 'dark knight' },
  { input: 'Inception? (2010)', expected: 'inception' },
  { input: 'Interstellar: The Movie (2014)', expected: 'interstellar the movie' },
  { input: "The Shining (Director's Cut)", expected: 'the shining' },
  { input: 'Blade Runner (Extended)', expected: 'blade runner' },
  { input: 'Alien (Special Edition)', expected: 'alien' },
  { input: "Goodfellas (Director's Cut)", expected: 'goodfellas' },
  { input: 'Terminator 2 (Extended)', expected: 'terminator 2' },
  { input: 'The Godfather Part II (VHS)', expected: 'godfather part ii' },
  { input: 'Star Wars Episode V (VHS)', expected: 'star wars episode v' },
  { input: 'Matrix Reloaded (VHS)', expected: 'matrix reloaded' },
  { input: 'X-Men (VHS Special)', expected: 'x-men' },
  { input: '!@#$%^&*()1234567890VG2.0', expected: '' },
  { input: 'A Very Long Movie Title That Goes On and On and On and On and On and On and On and On and On and On', expected: 'a very long movie title that goes on and on and on and on and on and on and on and on and on and on' }
];

const testCases = [...normalizeTests];

function runTests() {
  let passed = 0;
  let failed = 0;

  console.log('🧪 Running normalizeTitleForLookup tests...\n');

  for (const test of testCases) {
    const result = normalizeTitleForLookup(test.input);
    const expected = test.expected;
    const passed = result === expected;

    if (passed) {
      console.log(`✅ PASS: "${test.input}" → "${result}"\n`);
    } else {
      console.log(`❌ FAIL: "${test.input}"\n   Expected: "${expected}"\n   Got:      "${result}"\n`);
      failed++;
    }
  }

  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests, testCases };