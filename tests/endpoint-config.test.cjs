const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('script.js', 'utf8');
const loader = source.slice(source.indexOf('let endpointConfigPromise'), source.indexOf('function hydrateStateFromStorage'));
const config = JSON.parse(fs.readFileSync('tools/prayer-generator/config.json', 'utf8'));
test('file mode uses generated config without fetching blocked local JSON', async () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const embedded = html.match(/window.BJK_FILE_ENDPOINT = (.*);/)[1];
  assert.equal(JSON.parse(embedded), config.google_sheet_endpoint);
  const c = vm.createContext({ location: { protocol: 'file:' }, window: { BJK_FILE_ENDPOINT: JSON.parse(embedded) }, fetch() { throw new Error('Local config fetch is blocked'); } });
  vm.runInContext(loader, c);
  assert.equal(await c.getAppsScriptEndpoint(), config.google_sheet_endpoint);
});
test('HTTP mode reads shared JSON, coalesces reads, and retries failed configuration loads', async () => {
  let calls = 0;
  const c = vm.createContext({ location: { protocol: 'http:' }, window: {}, AbortController, setTimeout, clearTimeout,
    async fetch(url) {
      assert.equal(url, 'tools/prayer-generator/config.json');
      calls++;
      if (calls === 1) throw new Error('Offline');
      return { ok: true, json: async () => config };
    }
  });
  vm.runInContext(loader, c);
  await assert.rejects(c.getAppsScriptEndpoint(), /Offline/);
  const results = await Promise.all([c.getAppsScriptEndpoint(), c.getAppsScriptEndpoint()]);
  assert.deepEqual(results, [config.google_sheet_endpoint, config.google_sheet_endpoint]);
  assert.equal(calls, 2);
});
