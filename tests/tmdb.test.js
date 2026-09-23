'use strict';

process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';

const mockQuery = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockQuery })) }));

const { tmdbLookup } = require('../src/modules/tmdb');

// ── fetch stubs ───────────────────────────────────────────────────────────────
function jsonRes(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}
function details(overrides = {}) {
  return {
    title: 'Die Hard',
    release_date: '1988-07-15',
    production_companies: [{ name: 'Gordon Company' }, { name: '20th Century Fox Home Entertainment' }],
    external_ids: { imdb_id: 'tt0095016' },
    poster_path: '/dh.jpg',
    genres: [{ name: 'Action' }, { name: 'Thriller' }],
    ...overrides,
  };
}
const url = call => String(call[0]);

let fetchMock;
let warnSpy;
beforeEach(() => {
  mockQuery.mockReset();
  // Default: cache miss, insert succeeds.
  mockQuery.mockResolvedValue({ rows: [] });
  fetchMock = jest.fn();
  global.fetch = fetchMock;
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warnSpy.mockRestore());

describe('tmdbLookup', () => {
  it('returns null without touching db or network when apiKey is missing', async () => {
    expect(await tmdbLookup({ title: 'Die Hard' }, '')).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a cached hit without calling TMDb', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        success: true,
        lookup_data: { original_title: 'Die Hard' },
        year: '1988', label: 'Fox', imdb_id: 'tt0095016',
        poster: 'p.jpg', genres: ['Action'], source: 'tmdb_search',
      }],
    });
    const r = await tmdbLookup({ title: 'die hard' }, 'key');
    expect(r).toEqual({
      title: 'Die Hard', year: '1988', label: 'Fox', imdb_id: 'tt0095016',
      poster: 'p.jpg', genres: ['Action'], source: 'tmdb_search',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('fills defaults for sparse cached rows', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ success: true, lookup_data: null }] });
    const r = await tmdbLookup({ title: 'Heat' }, 'key');
    expect(r).toEqual({
      title: 'Heat', year: '', label: '', imdb_id: '', poster: '', genres: [], source: 'cache',
    });
  });

  it('ignores cached failures and re-queries TMDb', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ success: false }] });
    fetchMock
      .mockResolvedValueOnce(jsonRes({ results: [{ id: 1, title: 'Die Hard' }] }))
      .mockResolvedValueOnce(jsonRes(details()));
    const r = await tmdbLookup({ title: 'Die Hard' }, 'key');
    expect(r.source).toBe('tmdb_search');
  });

  it('continues to network when the cache read throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    fetchMock
      .mockResolvedValueOnce(jsonRes({ results: [{ id: 1, title: 'Die Hard' }] }))
      .mockResolvedValueOnce(jsonRes(details()));
    const r = await tmdbLookup({ title: 'Die Hard' }, 'key');
    expect(r.title).toBe('Die Hard');
    expect(warnSpy).toHaveBeenCalledWith('TMDb cache read-through failed:', 'db down');
  });

  it('looks up by IMDb id via /find and maps details', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({ movie_results: [{ id: 562 }] }))
      .mockResolvedValueOnce(jsonRes(details()));
    const r = await tmdbLookup({ title: 'Die Hard', imdbId: 'tt0095016' }, 'key');
    expect(r).toEqual({
      title: 'Die Hard',
      year: '1988',
      label: '20th Century Fox Home Entertainment',
      imdb_id: 'tt0095016',
      poster: 'https://image.tmdb.org/t/p/w500/dh.jpg',
      genres: ['Action', 'Thriller'],
      source: 'tmdb_imdb',
    });
    expect(url(fetchMock.mock.calls[0])).toContain('/find/tt0095016?');
    expect(url(fetchMock.mock.calls[0])).toContain('external_source=imdb_id');
    expect(url(fetchMock.mock.calls[1])).toContain('/movie/562?');
    expect(url(fetchMock.mock.calls[1])).toContain('append_to_response=external_ids%2Cvideos');
  });

  it('IMDb path falls back to the supplied imdbId and empty fields when details are sparse', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({ movie_results: [{ id: 9 }] }))
      .mockResolvedValueOnce(jsonRes({ title: 'Obscure' }));
    const r = await tmdbLookup({ title: 'Obscure', imdbId: 'tt123' }, 'key');
    expect(r).toEqual({
      title: 'Obscure', year: '', label: '', imdb_id: 'tt123', poster: '', genres: [], source: 'tmdb_imdb',
    });
  });

  it('falls back to title search when /find has no movie results', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({ movie_results: [] }))
      .mockResolvedValueOnce(jsonRes({ results: [{ id: 1, title: 'Die Hard' }] }))
      .mockResolvedValueOnce(jsonRes(details()));
    const r = await tmdbLookup({ title: 'Die Hard', imdbId: 'tt0095016' }, 'key');
    expect(r.source).toBe('tmdb_search');
    expect(url(fetchMock.mock.calls[1])).toContain('/search/movie?');
  });

  it('falls back to title search when /find is not ok', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({}, { ok: false, status: 401 }))
      .mockResolvedValueOnce(jsonRes({ results: [{ id: 1, title: 'Die Hard' }] }))
      .mockResolvedValueOnce(jsonRes(details()));
    const r = await tmdbLookup({ title: 'Die Hard', imdbId: 'tt0095016' }, 'key');
    expect(r.source).toBe('tmdb_search');
  });

  it('falls back to title search when IMDb details fetch is not ok', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({ movie_results: [{ id: 562 }] }))
      .mockResolvedValueOnce(jsonRes({}, { ok: false, status: 404 }))
      .mockResolvedValueOnce(jsonRes({ results: [{ id: 1, title: 'Die Hard' }] }))
      .mockResolvedValueOnce(jsonRes(details()));
    const r = await tmdbLookup({ title: 'Die Hard', imdbId: 'tt0095016' }, 'key');
    expect(r.source).toBe('tmdb_search');
  });

  it('warns and falls back to title search when the /find request throws', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(jsonRes({ results: [{ id: 1, title: 'Die Hard' }] }))
      .mockResolvedValueOnce(jsonRes(details()));
    const r = await tmdbLookup({ title: 'Die Hard', imdbId: 'tt0095016' }, 'key');
    expect(r.source).toBe('tmdb_search');
    expect(warnSpy).toHaveBeenCalledWith('TMDb IMDB lookup failed:', 'timeout');
  });

  it('picks the closest title match among search results', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({ results: [
        { id: 10, title: 'Die Hard 2' },
        { id: 11, title: 'Die Hard' },
        { id: 12, title: 'Die Hard with a Vengeance' },
      ] }))
      .mockResolvedValueOnce(jsonRes(details()));
    await tmdbLookup({ title: 'Die Hard' }, 'key');
    expect(url(fetchMock.mock.calls[1])).toContain('/movie/11?');
  });

  it('search path leaves imdb_id empty when details lack external_ids', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({ results: [{ id: 1, title: 'Heat' }] }))
      .mockResolvedValueOnce(jsonRes({ title: 'Heat', production_companies: [] }));
    const r = await tmdbLookup({ title: 'Heat' }, 'key');
    expect(r).toEqual({
      title: 'Heat', year: '', label: '', imdb_id: '', poster: '', genres: [], source: 'tmdb_search',
    });
  });

  it('uses the first production company when none look like a VHS distributor', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({ results: [{ id: 1, title: 'Heat' }] }))
      .mockResolvedValueOnce(jsonRes(details({ production_companies: [{ name: 'Forward Pass' }, {}] })));
    await expect(tmdbLookup({ title: 'Heat' }, 'key')).resolves.toMatchObject({ label: 'Forward Pass' });
  });

  it('matches a VHS keyword even after a nameless company', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({ results: [{ id: 1, title: 'Heat' }] }))
      .mockResolvedValueOnce(jsonRes(details({ production_companies: [{}, { name: 'Warner Home Video' }] })));
    await expect(tmdbLookup({ title: 'Heat' }, 'key')).resolves.toMatchObject({ label: 'Warner Home Video' });
  });

  it('returns null and records a failed lookup when search has no results', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ results: [] }));
    expect(await tmdbLookup({ title: 'Nonexistent' }, 'key')).toBeNull();
    const insert = mockQuery.mock.calls[1];
    expect(insert[0]).toMatch(/INSERT INTO tmdb_lookups/);
    const params = insert[1];
    expect(params[2]).toBe('Nonexistent');
    expect(params[9]).toBe('[]');
    expect(params[10]).toBe('tmdb_search');
    expect(params[11]).toBeNull();
    expect(params[14]).toBe(false);
  });

  it('returns null when search responds not ok', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({}, { ok: false, status: 500 }));
    expect(await tmdbLookup({ title: 'Heat' }, 'key')).toBeNull();
  });

  it('returns null when search details are not ok', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({ results: [{ id: 1, title: 'Heat' }] }))
      .mockResolvedValueOnce(jsonRes({}, { ok: false, status: 404 }));
    expect(await tmdbLookup({ title: 'Heat' }, 'key')).toBeNull();
  });

  it('warns and returns null when the search request throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    expect(await tmdbLookup({ title: 'Heat' }, 'key')).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('TMDb search lookup failed:', 'network');
  });

  it('persists a successful lookup', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({ results: [{ id: 1, title: 'Die Hard' }] }))
      .mockResolvedValueOnce(jsonRes(details()));
    await tmdbLookup({ title: 'Die Hard' }, 'key');
    const params = mockQuery.mock.calls[1][1];
    expect(params[5]).toBe('1988');
    expect(params[7]).toBe('tt0095016');
    expect(params[9]).toBe(JSON.stringify(['Action', 'Thriller']));
    expect(params[10]).toBe('tmdb_search');
    expect(params[11]).toBeInstanceOf(Date);
    expect(params[14]).toBe(true);
  });

  it('still returns the result when the cache write fails', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('insert failed'));
    fetchMock
      .mockResolvedValueOnce(jsonRes({ results: [{ id: 1, title: 'Die Hard' }] }))
      .mockResolvedValueOnce(jsonRes(details()));
    const r = await tmdbLookup({ title: 'Die Hard' }, 'key');
    expect(r.title).toBe('Die Hard');
    expect(warnSpy).toHaveBeenCalledWith('TMDb cache write failed:', 'insert failed');
  });
});
