/* Independent Flappy BjK physics; coordinates stay constant on every screen. */
(function (root) {
  const WIDTH = 420, HEIGHT = 600, FLOOR = 552, X = 112, RADIUS = 17;
  function touchesRect(x, y, radius, left, top, width, height) {
    const dx = x - Math.max(left, Math.min(x, left + width));
    const dy = y - Math.max(top, Math.min(y, top + height));
    return dx * dx + dy * dy <= radius * radius;
  }
  class Flight {
    constructor(random = Math.random) { this.random = random; this.reset(); }
    reset() {
      this.y = 260; this.velocity = 0; this.score = 0; this.distance = 0;
      this.alive = true; this.pipes = []; this.nextCenter = 270;
      this.addGate(500);
    }
    addGate(x) {
      const gap = Math.max(144, 170 - this.score * 1.2);
      this.nextCenter = Math.max(145, Math.min(400, this.nextCenter + (this.random() - .5) * 170));
      this.pipes.push({ x, width: 64, center: this.nextCenter, gap, scored: false });
    }
    flap() { if (this.alive) this.velocity = -340; }
    step(dt) {
      if (!this.alive) return;
      const speed = Math.min(205, 138 + this.score * 1.4);
      this.velocity += 1050 * dt;
      this.y += this.velocity * dt;
      this.distance += speed * dt;
      for (const gate of this.pipes) gate.x -= speed * dt;
      if (this.pipes[this.pipes.length - 1].x < WIDTH - 220) this.addGate(WIDTH + 20);
      if (this.y - RADIUS <= 0 || this.y + RADIUS >= FLOOR) this.alive = false;
      for (const gate of this.pipes) {
        const upper = gate.center - gate.gap / 2, lower = gate.center + gate.gap / 2;
        if (touchesRect(X, this.y, RADIUS, gate.x - 5, 0, gate.width + 10, upper) ||
            touchesRect(X, this.y, RADIUS, gate.x - 5, lower, gate.width + 10, FLOOR - lower)) this.alive = false;
        if (this.alive && !gate.scored && gate.x + gate.width < X - RADIUS) {
          gate.scored = true; this.score++;
        }
      }
      this.pipes = this.pipes.filter(gate => gate.x + gate.width > -10);
    }
  }
  const api = { Flight, WIDTH, HEIGHT, FLOOR, X, RADIUS, touchesRect };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    const security = root.BJKGameSecurity;
    // The prototype proxy traps attempts to disable collision or replace physics.
    Object.defineProperty(Flight.prototype, 'constructor', { value: ProtectedFlight });
    const prototype = security.readonly(Flight.prototype, 'Flappy physics');
    function ProtectedFlight(...args) {
      const flight = new Flight(...args);
      const cache = new WeakMap();
      const deny = () => { security.block('Flappy state changed'); return false; };
      function view(value) {
        if (!value || typeof value !== 'object') return value;
        if (cache.has(value)) return cache.get(value);
        const proxy = new Proxy(value, {
          get(target, key) { return view(Reflect.get(target, key)); },
          set: deny, defineProperty: deny, deleteProperty: deny, setPrototypeOf: deny
        });
        cache.set(value, proxy);
        return proxy;
      }
      // Engine methods alone receive the writable model. The renderer receives a
      // read-only view, including gates and arrays, with the same public shape.
      const methods = Object.fromEntries(['reset', 'addGate', 'flap', 'step'].map(key =>
        [key, (...values) => { if (!security.blocked) return flight[key](...values); }]));
      return new Proxy(flight, {
        get(target, key) { return Object.hasOwn(methods, key) ? methods[key] : view(Reflect.get(target, key)); },
        set: deny, defineProperty: deny, deleteProperty: deny, setPrototypeOf: deny
      });
    }
    ProtectedFlight.prototype = prototype;
    Object.freeze(ProtectedFlight);
    api.Flight = security.readonly(ProtectedFlight, 'Flappy constructor');
    security.publish('BJKFlappyEngine', api);
  }
})(globalThis);
