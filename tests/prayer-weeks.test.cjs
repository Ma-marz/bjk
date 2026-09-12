const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('script.js', 'utf8');

test('PDF index exactly matches files in each user folder', () => {
  const c = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync('prayer/available-weeks.js', 'utf8'), c);
  for (const folder of fs.readdirSync('prayer', { withFileTypes: true }).filter(p => p.isDirectory())) {
    const expected = fs.readdirSync(`prayer/${folder.name}`).map(p => /^Nädal ([1-9]\d*)\.pdf$/.exec(p)).filter(Boolean).map(m => Number(m[1])).sort((a,b) => b-a);
    assert.deepEqual(Array.from(c.window.BJK_PRAYER_WEEKS[folder.name]), expected);
  }
});

test('availability preserves gaps, includes new weeks and isolates users', async () => {
  const c = vm.createContext({ window: { BJK_PRAYER_WEEKS: { Anett: [24, 5, 1], Leo: [21, 2] } } });
  vm.runInContext(source.slice(source.indexOf('const prayerWeekCache'), source.indexOf("let prayerRenderKey")), c);
  assert.deepEqual(Array.from(await c.getAvailablePrayerWeeks('Anett')), [24,5,1]);
  assert.deepEqual(Array.from(await c.getAvailablePrayerWeeks('Leo')), [21,2]);
  assert.deepEqual(Array.from(await c.getAvailablePrayerWeeks('Unknown')), []);
  delete c.window.BJK_PRAYER_WEEKS;
  await assert.rejects(c.getAvailablePrayerWeeks('Anett'));
});

test('returning to prayers opens the newest PDF instead of the previous selection', async () => {
  const select = { value: '', options: [], disabled: false,
    set innerHTML(value) { this.options = []; },
    appendChild(option) { this.options.push(option); } };
  const loaded = [];
  const c = vm.createContext({
    appState: { currentUser: { name: 'Anett' }, currentView: 'prayers', weekNr: 3 },
    window: { BJK_PRAYER_WEEKS: { Anett: [24, 3, 1] }, scrollTo() {} },
    document: {
      getElementById: id => id === 'prayerSelect' ? select : null,
      createElement: () => ({}), querySelectorAll: () => []
    },
    hideOpenPdfButton() {}, renderDataActivity() {}, setActivityResult() {},
    loadPDF: async url => loaded.push(url)
  });
  vm.runInContext(source.slice(source.indexOf('function showView'), source.indexOf('let pdfRendererPromise')), c);
  vm.runInContext(source.slice(source.indexOf('const prayerWeekCache'), source.indexOf('function getUserAvatar')), c);
  await c.renderPrayers();
  assert.equal(select.value, '24');
  select.value = '3';
  await select.onchange();
  assert.equal(c.appState.weekNr, 3);
  await c.renderPrayers();
  assert.equal(select.value, '3', 'background rerenders preserve the manual choice');
  c.showView('messages');
  c.window.BJK_PRAYER_WEEKS.Anett.unshift(25);
  c.showView('prayers');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(select.value, '25');
  assert.equal(c.appState.weekNr, 25);
  assert.equal(loaded.at(-1), 'prayer/Anett/N%C3%A4dal%2025.pdf');
});
