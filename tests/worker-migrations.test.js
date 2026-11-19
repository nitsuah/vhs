const fs = require('fs');
const path = require('path');

// worker/migrations.js lists SQL files by hand (Workers can't read the dir).
test('worker migration list matches migrations/', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'worker', 'migrations.js'), 'utf8');
  const listed = [...src.matchAll(/'(\d{3}_[^']+\.sql)',/g)].map(m => m[1]).sort();
  const onDisk = fs.readdirSync(path.join(__dirname, '..', 'migrations')).filter(f => f.endsWith('.sql')).sort();
  expect(listed).toEqual(onDisk);
});
