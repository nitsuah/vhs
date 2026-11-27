'use strict';

const express = require('express');
const request = require('supertest');
const { registerStaticAndProxy } = require('../src/modules/routes/system');

const app = express();
registerStaticAndProxy(app);

describe('page routes', () => {
  it.each(['/', '/?tab=collect', '/c/some-slug'])('serves the app for %s', async url => {
    const res = await request(app).get(url);
    expect(res.status).toBe(200);
    expect(res.text).toContain('<title>VHS Box</title>');
  });

  it.each(['/this-page-does-not-exist', '/c/a/b'])('answers 404 for %s', async url => {
    const res = await request(app).get(url);
    expect(res.status).toBe(404);
    expect(res.text).toContain('Page not found');
  });
});
