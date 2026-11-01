'use strict';
const { buildFieldProposals } = require('../src/modules/fill-proposals');

describe('buildFieldProposals', () => {
  test('empty or invalid candidate inputs produce no proposals', () => {
    expect(buildFieldProposals({}, [])).toEqual([]);
    expect(buildFieldProposals({}, null)).toEqual([]);
    expect(buildFieldProposals(null, [{ title: 'Orion' }])).toEqual([]);
    expect(buildFieldProposals({}, [null, 'not-an-object', []])).toEqual([]);
  });

  test('proposes only missing or suspicious Fill fields and preserves trusted fields', () => {
    const tape = {
      year: 'Unknown',
      label: '',
      format: 'VHS',
      value_low: '20',
      value_high: '5',
      barcode: '012345678905',
      imdb_id: 'tt0088763',
    };
    const candidate = {
      title: 'Orion',
      year: '1989',
      format: 'VHS',
      value_low: '4',
      value_high: '10',
      barcode: '012345678905',
      imdb_id: 'tt0088763',
      source: 'OMDb',
    };

    const proposals = buildFieldProposals(tape, [candidate]);
    expect(proposals.map((proposal) => proposal.field)).toEqual(['year', 'label', 'value_low', 'value_high']);
    expect(proposals.every((proposal) => proposal.confidence === 'verified')).toBe(true);
    expect(proposals.find((proposal) => proposal.field === 'year')).toMatchObject({
      field: 'year',
      originalValue: 'Unknown',
      value: '1989',
      source: 'OMDb',
      confidence: 'verified',
    });
    expect(proposals.find((proposal) => proposal.field === 'value_low').reasons).toContain('value range suspicious');
    expect(proposals.find((proposal) => proposal.field === 'value_high').reasons).toContain('value range suspicious');
    expect(proposals.some((proposal) => proposal.field === 'format')).toBe(false);
    expect(proposals.some((proposal) => proposal.field === 'barcode' || proposal.field === 'imdb_id')).toBe(false);
  });

  test('does not propose trusted values even when a candidate differs', () => {
    const tape = {
      year: '1989',
      label: 'Orion',
      format: 'VHS',
      value_low: '4',
      value_high: '10',
      photo_face: 'face.jpg',
      photo_spine: 'spine.jpg',
    };
    const candidate = {
      title: 'Different title',
      year: '1990',
      format: 'DVD',
      value_low: '20',
      value_high: '30',
    };

    expect(buildFieldProposals(tape, [candidate])).toEqual([]);
  });

  test('conflicting supplied identifiers cannot produce verified confidence', () => {
    const tape = {
      year: 'Unknown',
      label: '',
      format: 'VHS',
      barcode: '012345678905',
      imdb_id: 'tt0088763',
    };
    const candidate = {
      title: 'Orion',
      year: '1989',
      format: 'VHS',
      barcode: '012345678905',
      imdb_id: 'tt0000001',
      source: 'OMDb',
    };

    const proposals = buildFieldProposals(tape, [candidate]);
    expect(proposals.length).toBeGreaterThan(0);
    expect(proposals.every((proposal) => proposal.confidence === 'low')).toBe(true);
    expect(proposals.some((proposal) => proposal.reasons.includes('imdb_id mismatch'))).toBe(true);
    expect(proposals.some((proposal) => proposal.confidence === 'verified')).toBe(false);
  });

  test('rejects placeholder, malformed year, non-finite and non-numeric value candidates', () => {
    const tape = { year: '', label: '', value_low: '', value_high: '' };
    const candidate = {
      title: 'N/A',
      year: 'not-a-year',
      value_low: Infinity,
      value_high: 'not-a-number',
    };
    expect(buildFieldProposals(tape, [candidate])).toEqual([]);
  });

  test('bounds source and emits only generated reasons, not provider payloads or errors', () => {
    const tape = { year: 'Unknown', label: '' };
    const candidate = {
      title: 'Orion',
      year: '1989',
      source: 'OMDb<script>alert(1)</script>',
      error: 'provider-secret',
      payload: { token: 'provider-secret' },
      reasons: ['provider-secret'],
    };
    const proposals = buildFieldProposals(tape, [candidate]);
    expect(proposals.length).toBe(2);
    expect(proposals.every((proposal) => proposal.source === 'OMDbscriptalert1script')).toBe(true);
    expect(JSON.stringify(proposals)).not.toContain('provider-secret');
    expect(JSON.stringify(proposals)).not.toContain('payload');
    expect(JSON.stringify(proposals)).not.toContain('token');
  });

  test('does not mutate tape or candidate inputs', () => {
    const tape = { year: 'Unknown', label: '', format: 'VHS', value_low: '20', value_high: '5' };
    const candidates = [{ title: 'Orion', year: '1989', format: 'VHS', value_low: '4', value_high: '10', source: 'OMDb' }];
    const tapeBefore = JSON.parse(JSON.stringify(tape));
    const candidatesBefore = JSON.parse(JSON.stringify(candidates));

    buildFieldProposals(tape, candidates);

    expect(tape).toEqual(tapeBefore);
    expect(candidates).toEqual(candidatesBefore);
  });
});
