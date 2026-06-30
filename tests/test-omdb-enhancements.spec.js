'use strict';
const { Pool } = require('pg');
const { app, callOmdb, normalizeTitleForLookup, levenshteinDistance, enhancedLookup } = require('../src/server.js');

jest.mock('pg');
jest.mock('fs');
jest.mock('child_process');

// ── Test configuration ───────────────────────────────────────────────────────
const TEST_CONFIG = {
  OMDB_BASE_URL: 'https://www.omdbapi.com/',
  TIMEOUT: 5000,
  MAX_RETRIES: 3,
};

// ── Mock process.env before importing server ───────────────────────────────────
process.env.OMDB_API_KEY = 'test-omdb-key';

// ── Mock fetch globally ─────────────────────────────────────────────────────
const originalFetch = global.fetch;
global.fetch = jest.fn();

// ── Test data factory functions ─────────────────────────────────────────────
function createMockOmdbSuccess(title, year = '1999', label = 'Test Studio', imdb_id = 'tt1234567', poster = '', genres = []) {
  return {
    Response: 'True',
    Title: title,
    Year: year,
    Production: label,
    imdbID: imdb_id,
    Poster: poster || 'N/A',
    Genre: genres.join(', '),
  };
}

function createMockOmdbError(error = 'Movie not found!') {
  return {
    Response: 'False',
    Error: error,
  };
}

// ── Main test suite ─────────────────────────────────────────────────────────
describe('Enhanced OMDb Lookup Improvements', () => {
  let mockPool;
  let mockQuery;

  beforeEach(() => {
    mockQuery = jest.fn();
    mockPool = {
      query: mockQuery,
      connect: jest.fn().mockResolvedValue(mockPool),
      end: jest.fn(),
    };
    Pool.mockImplementation(() => mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.OMDB_API_KEY;
    global.fetch = originalFetch;
  });

  // ── Title Normalization Tests ───────────────────────────────────────────────
  describe('Title Normalization', () => {
    test('should normalize VHS titles correctly', () => {
      const title = 'The Godfather (VHS)';
      const normalized = normalizeTitleForLookup(title);
      expect(normalized).toBe('godfather');
    });

    test('should handle case-insensitive normalization', () => {
      const title = 'THE DARK KNIGHT DVD';
      const normalized = normalizeTitleForLookup(title);
      expect(normalized).toBe('dark knight');
    });

    test('should remove media type indicators', () => {
      const title = 'Inception (Blu-ray) Special Edition';
      const normalized = normalizeTitleForLookup(title);
      expect(normalized).toBe('inception');
    });

    test('should handle year-based titles', () => {
      const title = 'Pulp Fiction (1994) - Special';
      const normalized = normalizeTitleForLookup(title);
      expect(normalized).toBe('pulp fiction');
    });

    test('should remove leading articles', () => {
      const title = 'A Star Is Born';
      const normalized = normalizeTitleForLookup(title);
      expect(normalized).toBe('star is born');
    });

    test('should clean up extra spaces', () => {
      const title = '  The   Matrix   ';
      const normalized = normalizeTitleForLookup(title);
      expect(normalized).toBe('matrix');
    });

    test('should convert symbols to words', () => {
      const title = 'Matrix & Revolution';
      const normalized = normalizeTitleForLookup(title);
      expect(normalized).toBe('matrix and revolution');
    });

    test('should handle empty string', () => {
      const title = '';
      const normalized = normalizeTitleForLookup(title);
      expect(normalized).toBe('');
    });

    test('should handle null input', () => {
      const normalized = normalizeTitleForLookup(null);
      expect(normalized).toBe('');
    });

    test('should handle whitespace-only input', () => {
      const normalized = normalizeTitleForLookup('   ');
      expect(normalized).toBe('');
    });

    test('should normalize common VHS titles', () => {
      const vhsTitles = [
        'Jaws (VHS)',
        'Star Wars (SDE) VHS',
        'E.T. the Extra-Terrestrial (VHS Collectible)',
        'The Dark Knight (Movie, VHS Edition)',
        'Back to the Future (VHS, Special Edition)',
      ];

      vhsTitles.forEach(title => {
        const normalized = normalizeTitleForLookup(title);
        expect(normalized).toBeTruthy();
        expect(normalized).not.toContain('vhs');
        expect(normalized).not.toContain('dvd');
        expect(normalized).not.toContain('bluray');
      });
    });

    test('should handle collector editions', () => {
      const collectorTitles = [
        "The Shining (Director's Cut)",
        'Blade Runner (Extended)',
        'Alien (Special Edition)',
        "Goodfellas (Director's Cut)",
      ];

      collectorTitles.forEach(title => {
        const normalized = normalizeTitleForLookup(title);
        expect(normalized).toBeTruthy();
        expect(normalized).not.toMatch(/director.s cut|extended|special edition/i);
      });
    });

    test('should handle release year variations', () => {
      const yearPatternTitles = [
        'The Godfather (1972)',
        'The Dark Knight (2008)',
        'Pulp Fiction (1994)',
        'Forrest Gump (1994)',
      ];

      yearPatternTitles.forEach(title => {
        const normalized = normalizeTitleForLookup(title);
        const base = title.split(' (')[0].toLowerCase().trim().replace(/^the\s+/i, '');
        expect(normalized).toBe(base);
      });
    });

    test('should handle special characters and punctuation', () => {
      const specialTitles = [
        'Matrix! (1999)',
        'The Dark Knight... DVD',
        'Inception? (2010)',
        'Interstellar: The Movie (2014)',
      ];

      specialTitles.forEach(title => {
        const normalized = normalizeTitleForLookup(title);
        expect(normalized).toBeTruthy();
        expect(normalized).not.toContain('!');
        expect(normalized).not.toContain('...');
        expect(normalized).not.toContain('?');
        expect(normalized).not.toContain(':');
      });
    });
  });

  // ── Levenshtein Distance Tests ─────────────────────────────────────────────
  describe('Levenshtein Distance', () => {
    test('should calculate exact match distance', () => {
      const distance = levenshteinDistance('test', 'test');
      expect(distance).toBe(0);
    });

    test('should calculate insertion distance', () => {
      const distance = levenshteinDistance('test', 'testing');
      expect(distance).toBe(2);
    });

    test('should calculate substitution distance', () => {
      const distance = levenshteinDistance('test', 'tent');
      expect(distance).toBe(1);
    });

    test('should calculate deletion distance', () => {
      const distance = levenshteinDistance('testing', 'test');
      expect(distance).toBe(2);
    });

    test('should handle empty strings', () => {
      const distance = levenshteinDistance('', 'test');
      expect(distance).toBe(4);
    });

    test('should handle both empty strings', () => {
      const distance = levenshteinDistance('', '');
      expect(distance).toBe(0);
    });

    test('should be symmetric', () => {
      const s1 = 'kitten';
      const s2 = 'sitting';
      expect(levenshteinDistance(s1, s2)).toBe(levenshteinDistance(s2, s1));
    });

    test('should calculate distance for similar strings', () => {
      const s1 = 'algorithm';
      const s2 = 'altruistic';
      const distance = levenshteinDistance(s1, s2);
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThanOrEqual(Math.max(s1.length, s2.length));
    });

    test('should handle case-insensitive distance calculation', () => {
      const distance = levenshteinDistance('TEST', 'test');
      expect(distance).toBe(0);
    });

    test('should calculate distance for completely different strings', () => {
      const s1 = 'abc';
      const s2 = 'xyz';
      const distance = levenshteinDistance(s1, s2);
      expect(distance).toBe(3);
    });

    test('should handle long strings', () => {
      const s1 = 'The quick brown fox jumps over the lazy dog';
      const s2 = 'The quick brown fox leaped over the lazy cat';
      const distance = levenshteinDistance(s1, s2);
      expect(distance).toBeGreaterThan(0);
    });
  });

  // ── OMDb Integration Tests ────────────────────────────────────────────────
  describe('OMDb Integration Tests', () => {
    test('should handle missing API key', async () => {
      process.env.OMDB_API_KEY = '';
      const result = await enhancedLookup({ title: 'The Matrix' }, '');
      expect(result).toBeNull();
    });

    test('should handle network timeout gracefully', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network timeout'));

      mockQuery.mockImplementation((query, ...params) => {
        if (query.includes('SELECT') && query.includes('omdb_lookups')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await enhancedLookup({ title: 'The Matrix' }, 'test-key');
      expect(result).toBeNull();
    });

    test('should handle OMDb API error response', async () => {
      const mockErrorResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue(createMockOmdbError('Movie not found!'))
      };
      global.fetch = jest.fn().mockResolvedValue(mockErrorResponse);

      mockQuery.mockImplementation((query, ...params) => {
        if (query.includes('SELECT') && query.includes('omdb_lookups')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('INSERT INTO omdb_lookups')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await enhancedLookup({ title: 'NonExistentMovie12345' }, 'test-key');
      expect(result).toBeNull();
    });

    test('should handle successful OMDb lookup', async () => {
      const mockSuccessResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue(createMockOmdbSuccess('The Matrix', '1999', 'Warner Bros', 'tt0133093'))
      };
      global.fetch = jest.fn().mockResolvedValue(mockSuccessResponse);
      mockQuery.mockImplementation((query, ...params) => {
        if (query.includes('SELECT') && query.includes('omdb_lookups')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('INSERT INTO omdb_lookups')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await enhancedLookup({ title: 'The Matrix' }, 'test-key');

      expect(result).not.toBeNull();
      expect(result.title).toBe('The Matrix');
      expect(result.year).toBe('1999');
      expect(result.label).toBe('Warner Bros');
      expect(result.imdb_id).toBe('tt0133093');
      expect(result.source).toBe('omdb_exact');
    });
  });

  // ── Lookup Workflow Integration Tests ─────────────────────────────────────
  describe('Lookup Workflow Integration', () => {
    test('should create lookup entry for successful response', async () => {
      const mockSuccessResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue(createMockOmdbSuccess('The Matrix', '1999', 'Warner Bros', 'tt0133093'))
      };
      global.fetch = jest.fn().mockResolvedValue(mockSuccessResponse);
      mockQuery.mockImplementation((query, ...params) => {
        if (query.includes('SELECT') && query.includes('omdb_lookups')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('INSERT INTO omdb_lookups')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await enhancedLookup({ title: 'The Matrix' }, 'test-key');

      expect(result).not.toBeNull();
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO omdb_lookups'), expect.anything());
    });

    test('should attempt fuzzy matching when exact match fails', async () => {
      // Mock exact lookup failure followed by fuzzy success
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(createMockOmdbError('Movie not found!'))
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(createMockOmdbSuccess('The Matrix (Alternative)', '1999', 'Test Studio', 'tt0133093-alternative'))
        });

      mockQuery.mockImplementation((query, ...params) => {
        if (query.includes('SELECT') && query.includes('omdb_lookups')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('INSERT INTO omdb_lookups')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('INSERT INTO lookup_alternatives')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await enhancedLookup({ title: 'The Matrix' }, 'test-key');

      expect(result).not.toBeNull();
      expect(result.source).toBe('omdb_fuzzy');
      expect(result.title).toContain('Matrix');
    });

    test('should handle complete lookup failure gracefully', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      mockQuery.mockImplementation((query, ...params) => {
        if (query.includes('SELECT') && query.includes('omdb_lookups')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('INSERT INTO omdb_lookups')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await enhancedLookup({ title: 'CompletelyFakeTitle12345' }, 'test-key');
      expect(result).toBeNull();
    });
  });
});

// ── VHS Collection Specific Tests ────────────────────────────────────────────
describe('VHS Collection Lookup Patterns', () => {
  test('should normalize various VHS title formats', () => {
    const vhsFormatPatterns = [
      { input: 'Jaws (VHS)', expected: 'jaws' },
      { input: 'Star Wars (SDE) VHS Edition', expected: 'star wars' },
      { input: 'E.T. the Extra-Terrestrial (VHS Collectible)', expected: 'e.t. the extra-terrestrial' },
      { input: 'Back to the Future (VHS Special Edition)', expected: 'back to the future' },
      { input: 'Terminator 2: Judgment Day (VHS)', expected: 'terminator 2 judgment day' },
    ];

    vhsFormatPatterns.forEach(pattern => {
      const normalized = normalizeTitleForLookup(pattern.input);
      expect(normalized).toBe(pattern.expected);
    });
  });

  test('should handle different VHS release variants', () => {
    const vhsVariants = [
      'Jaws (VHS)',
      'Jaws (VHS, Special Edition)',
      'Jaws (VHS Collectible)',
      'Jaws (SDE)',
      'Jaws (1995)',
    ];

    vhsVariants.forEach(title => {
      const normalized = normalizeTitleForLookup(title);
      expect(normalized).toBe('jaws');
    });
  });

  test('should normalize different media types', () => {
    const mediaTypes = [
      'Movie (DVD)',
      'Film (Blu-ray)',
      'Title (Digital)',
      'Video (VHS)',
      'Tape (Other)',
    ];

    mediaTypes.forEach(title => {
      const normalized = normalizeTitleForLookup(title);
      expect(normalized).toBe('movie');
    });
  });

  test("should handle director's cuts and extended versions", () => {
    const specialVersions = [
      "The Matrix (Director's Cut)",
      'Blade Runner (Extended)',
      'Alien (Special Edition)',
      "Goodfellas (Director's Cut)",
      'Terminator 2 (Extended)',
    ];

    specialVersions.forEach(title => {
      const normalized = normalizeTitleForLookup(title);
      expect(normalized).toBeTruthy();
      expect(normalized).not.toMatch(/director.s cut|extended|special edition/i);
    });
  });

  test('should handle multi-part titles with editions', () => {
    const multiPartTitles = [
      'The Godfather Part II (VHS)',
      'Star Wars Episode V (VHS)',
      'Matrix Reloaded (VHS)',
      'X-Men (VHS Special)',
    ];

    multiPartTitles.forEach(title => {
      const normalized = normalizeTitleForLookup(title);
      expect(normalized).toBeTruthy();
    });
  });
});

// ── Performance and Edge Case Tests ──────────────────────────────────────────
describe('Performance and Edge Cases', () => {
  test('should handle very long titles', () => {
    const longTitle = 'A Very Long Movie Title That Goes On and On and On and On and On and On and On and On and On and On';
    const normalized = normalizeTitleForLookup(longTitle);
    expect(normalized).toBeTruthy();
  });

  test('should handle titles with only numbers and symbols', () => {
    const symbolsOnly = '!@#$%^&*()1234567890VG2.0';
    const normalized = normalizeTitleForLookup(symbolsOnly);
    expect(normalized).toBe('');
  });

  test('should handle rapid successive normalizations', () => {
    const titles = ['Test Movie 1', 'Another Test Movie', 'Test Movie Two'];
    titles.forEach(title => {
      const normalized = normalizeTitleForLookup(title);
      expect(normalized).toBeTruthy();
    });
  });

  test('should handle memory efficiently with many titles', () => {
    const titles = [];
    for (let i = 0; i < 1000; i++) {
      titles.push(`Test Movie ${i}`);
    }

    const results = titles.map(title => normalizeTitleForLookup(title));
    expect(results).toHaveLength(1000);
    results.forEach(result => expect(result).toBeTruthy());
  });
});

console.log('OMDb enhancements test suite loaded successfully');
