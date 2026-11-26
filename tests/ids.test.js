const { describe, expect, it } = require('@jest/globals');
const { jobId, reviewItemId, analyticsId } = require('../src/modules/ids');

describe('ID generators', () => {
  it.each([
    [jobId, /^job_\d+_[a-z0-9]{1,6}$/],
    [reviewItemId, /^rev_\d+_[a-z0-9]{1,6}$/],
    [analyticsId, /^anl_\d+_[a-z0-9]{1,6}$/],
  ])('generates a correctly shaped ID', (makeId, pattern) => {
    expect(makeId()).toMatch(pattern);
  });
  it('generates distinct job IDs', () => {
    expect(jobId()).not.toBe(jobId());
  });
});
