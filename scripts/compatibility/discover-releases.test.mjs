import assert from 'node:assert/strict';
import test from 'node:test';
import { compareVersions, validateConfiguration, watchedPackages } from './discover-releases.mjs';

const config = {
  schemaVersion: 1,
  integrations: [
    { id: 'one', displayName: 'One', packages: ['one', 'shared'], documentationUrls: ['https://one.example/docs'] },
    { id: 'two', displayName: 'Two', packages: ['shared'], documentationUrls: ['https://two.example/docs'] },
    { id: 'local', displayName: 'Local', packages: [], documentationUrls: ['https://local.example/docs'], releaseMonitoring: false },
  ],
};
const lock = { schemaVersion: 1, packages: { one: '1.0.0', shared: '2.0.0' } };

test('validates and deduplicates watched packages', () => {
  validateConfiguration(config, lock);
  assert.deepEqual(watchedPackages(config), ['one', 'shared']);
});

test('reports only new registry versions and maps integrations', () => {
  assert.deepEqual(compareVersions(config, lock, { one: '1.0.0', shared: '3.0.0' }), [{
    package: 'shared',
    previouslyAnalyzed: '2.0.0',
    latest: '3.0.0',
    integrations: ['one', 'two'],
  }]);
});

test('rejects duplicate integration ids', () => {
  const invalid = { ...config, integrations: [...config.integrations, config.integrations[0]] };
  assert.throws(() => validateConfiguration(invalid, lock), /duplicate integration id/);
});
