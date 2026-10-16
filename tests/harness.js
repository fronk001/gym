// A deliberately tiny test harness: the browser is the only JS engine here.

export const results = [];
export const running = []; // async tests still in flight; test.html waits for them

export function test(name, fn) {
  const pass = () => results.push({ name, ok: true });
  const fail = (e) => results.push({ name, ok: false, err: e.message });
  try {
    const r = fn();
    if (r && typeof r.then === 'function') running.push(r.then(pass, fail));
    else pass();
  } catch (e) {
    fail(e);
  }
}

export function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg ? `${msg}: ` : ''}expected ${b}, got ${a}`);
}

export function ok(cond, msg = 'expected true') {
  if (!cond) throw new Error(msg);
}
