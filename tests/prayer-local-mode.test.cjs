const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
test('direct-file mode navigates to the original PDF without fetching or importing it', async () => {
  const element = () => ({ hidden: true, classList: { add() {}, remove() {} }, setAttribute() {}, removeAttribute() {} });
  const image = element(), frame = element();
  let external, finished;
  const context = vm.createContext({
    location: { protocol: 'file:' },
    document: { getElementById: id => id === 'prayerImage' ? image : frame },
    beginDataActivity: () => failed => { finished = failed; },
    updateOpenPdfButton: url => { external = url; },
    AbortController, setTimeout: () => 1, clearTimeout() {},
    URL, console,
    fetch() { throw new Error('Local PDF must not be fetched'); }
  });
  const source = fs.readFileSync('script.js', 'utf8');
  vm.runInContext(source.slice(source.indexOf('let pdfRendererPromise'), source.indexOf('const prayerWeekCache')), context);
  await context.loadPDF('prayer/Markus/N%C3%A4dal%2023.pdf');
  assert.equal(frame.src, 'prayer/Markus/N%C3%A4dal%2023.pdf#toolbar=0&navpanes=0&view=FitH');
  assert.equal(external, 'prayer/Markus/N%C3%A4dal%2023.pdf');
  frame.onload();
  assert.equal(finished, false);
});
