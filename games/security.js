/* Page-local tamper resistance. This is not a replacement for server validation.
 * Each module keeps its capability in a closure. Only synchronous game callbacks
 * may change their watched state/DOM; never keep a transaction open across await.
 */
(function () {
  'use strict';
  const message = 'Mäng blokeeriti, sest mängu parameetreid muudeti. Mängimiseks värskenda lehte.';
  const clients = new Map();
  const permits = new WeakMap();
  const requests = new Set();
  const natives = [
    [window, 'Date'], [window, 'Math'], [window, 'JSON'],
    [Date, 'now'], ...['random', 'min', 'max', 'round', 'floor', 'ceil'].map(key => [Math, key]),
    [JSON, 'stringify'], [JSON, 'parse'],
    ...[Symbol.iterator, 'filter', 'map', 'forEach', 'push'].map(key => [Array.prototype, key]), [window, 'requestAnimationFrame'],
    [window, 'setInterval'], [window, 'setTimeout'], [window, 'getComputedStyle'],
    [performance, 'now']
  ].map(([object, key]) => [object, key, object[key]]);
  const interval = window.setInterval.bind(window);
  const timeout = window.setTimeout.bind(window);
  const clearTimer = window.clearTimeout.bind(window);
  let blocked = false, reason = '', submitScore;

  function showBlock() {
    let banner = document.getElementById('gameSecurityMessage');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'gameSecurityMessage';
      banner.setAttribute('role', 'alert');
      banner.className = 'game-security-message';
      document.body.appendChild(banner);
    }
    banner.textContent = message;
    document.querySelectorAll('#game, #memoryBoard, #flappyStage').forEach(el => el.setAttribute('inert', ''));
  }
  function block(detail) {
    if (blocked) return false;
    blocked = true;
    reason = detail;
    for (const client of clients.values()) {
      for (const watch of client.watches) watch.observer.disconnect();
      for (const handle of client.timers) clearTimer(handle);
      client.timers.clear();
      for (const stop of client.stops) { try { stop(); } catch (e) { console.warn(e); } }
    }
    for (const request of requests) request.abort();
    requests.clear();
    showBlock();
    return false;
  }
  function check() {
    if (blocked) return false;
    if (natives.some(([object, key, value]) => object[key] !== value)) return block('Game clock or runtime changed');
    for (const client of clients.values()) {
      if (client.depth) continue;
      for (const watch of client.watches) {
        if (!watch.node.isConnected || watch.observer.takeRecords().length) return block(`${client.id}: gameplay DOM changed`);
      }
      for (const monitor of client.monitors) {
        if (monitor.read() !== monitor.expected) return block(`${client.id}: gameplay state changed`);
      }
    }
    return true;
  }
  function readonly(value, label, seen = new WeakMap()) {
    if (!value || !['object', 'function'].includes(typeof value)) return value;
    if (seen.has(value)) return seen.get(value);
    // Freeze the target's own data as well as trapping attempted writes. Functions
    // are monitored separately: replacing their public properties is forbidden.
    const deny = () => { block(`${label} changed`); return false; };
    const proxy = new Proxy(value, { set: deny, defineProperty: deny, deleteProperty: deny, setPrototypeOf: deny });
    seen.set(value, proxy);
    for (const key of Object.keys(value)) {
      if (typeof value[key] === 'object' && value[key]) value[key] = readonly(value[key], `${label}.${key}`, seen);
    }
    Object.freeze(value);
    return proxy;
  }
  function publish(name, value) {
    const api = readonly(value, name);
    Object.defineProperty(window, name, {
      configurable: false, enumerable: true, get: () => api,
      set: () => block(`${name} replaced`)
    });
    return api;
  }
  function register(id) {
    const files = { portal: '/script.js', 'bjker-mario': '/game/game-script.js', 'bjk-memory': '/games/memory/memory.js', 'bjk-flappy': '/games/flappy/flappy.js' };
    if (!files[id] || clients.has(id) || !document.currentScript?.src.endsWith(files[id])) {
      block('Unauthorized game registration');
      throw new Error('Game registration denied');
    }
    const client = { id, depth: 0, watches: [], monitors: [], stops: [], timers: new Set() };
    clients.set(id, client);
    function run(fn, ...args) {
      if (!check()) return;
      client.depth++;
      try { return fn(...args); }
      finally {
        client.depth--;
        if (!client.depth && !blocked) {
          for (const watch of client.watches) watch.observer.takeRecords();
          for (const monitor of client.monitors) monitor.expected = monitor.read();
        }
      }
    }
    const capability = {
      run, wrap: fn => (...args) => run(fn, ...args),
      watch(node, options = { attributes: true, childList: true, characterData: true, subtree: true }) {
        if (!node || client.watches.some(w => w.node === node)) return;
        const observer = new MutationObserver(() => block(`${id}: gameplay DOM changed`));
        observer.observe(node, options);
        client.watches.push({ node, observer });
      },
      monitor(read) { client.monitors.push({ read, expected: read() }); },
      // CSSOM edits in the Styles panel do not produce DOM mutations. Monitor
      // authored rules for game selectors, independent of viewport/media state.
      styles(pattern) {
        const read = () => {
          const found = [];
          const visit = (rules, scope = '') => { for (const rule of rules) {
            if (rule.selectorText && pattern.test(rule.selectorText)) found.push(scope + rule.cssText);
            if (rule.cssRules) visit(rule.cssRules, scope + (rule.conditionText || rule.name || ''));
          } };
          for (const sheet of document.styleSheets) {
            try { visit(sheet.cssRules, `${sheet.disabled}:${sheet.media?.mediaText || ''}:`); } catch (_) { /* cross-origin fonts */ }
          }
          return JSON.stringify(found);
        };
        capability.monitor(read);
      },
      onBlock(stop) { client.stops.push(stop); },
      interval(fn, ms) { const handle = interval(capability.wrap(fn), ms); client.timers.add(handle); return handle; },
      timeout(fn, ms) {
        const handle = timeout(() => { client.timers.delete(handle); run(fn); }, ms);
        client.timers.add(handle); return handle;
      },
      clearTimer(handle) { clearTimer(handle); client.timers.delete(handle); },
      submit(score) {
        if (!check() || id === 'portal') return Promise.resolve({ success: false, blocked: true });
        const permit = {};
        permits.set(permit, { kind: 'score', game: id, score });
        return submitScore(id, score, permit);
      }
    };
    if (id === 'portal') {
      capability.bindSaver = fn => { submitScore = fn; };
      capability.requestPermit = (game, score) => {
        const permit = {};
        permits.set(permit, { kind: 'request', game, score });
        return permit;
      };
    }
    return Object.freeze(capability);
  }
  function authorize(kind, game, score, permit) {
    if (!check()) return false;
    const proof = permits.get(permit);
    permits.delete(permit);
    return proof?.kind === kind && proof.game === game && proof.score === score || block('Unauthorized score submission');
  }
  const api = {
    get blocked() { return blocked; }, get reason() { return reason; },
    check, block, register, publish, readonly, authorize,
    trackRequest(controller) { if (blocked) controller.abort(); else requests.add(controller); return () => requests.delete(controller); }
  };
  publish('BJKGameSecurity', api);
  interval(check, 100);
  // Navigation remains usable. A removed banner cannot re-enable any game.
  document.addEventListener('click', event => {
    if (blocked && event.target.closest('.play-game-button, #game, #memoryBoard, #memoryRestart, #flappyStage')) {
      event.preventDefault(); event.stopImmediatePropagation(); showBlock();
    }
  }, true);
})();
