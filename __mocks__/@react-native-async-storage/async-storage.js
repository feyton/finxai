/**
 * In-memory AsyncStorage for Jest.
 *
 * async-storage v3 removed the mock it used to ship at
 * `@react-native-async-storage/async-storage/jest/async-storage-mock`, so the
 * long-standing `jest.mock(...)` pointing at that path now throws
 * "Cannot find module" the moment a test actually pulls AsyncStorage in. It went
 * unnoticed because the one test file referencing it no longer imports anything
 * that reaches AsyncStorage, so the factory never ran.
 *
 * Living in `__mocks__/` at the project root means Jest applies it automatically
 * to every suite — no per-file `jest.mock` call to forget or let rot.
 *
 * Backed by a real Map rather than jest.fn()s returning null, so code that
 * writes a value and reads it back (the channel/merchant memory in
 * src/tools/merchantMemory.ts) behaves the way it does on device.
 */
const store = new Map();

const AsyncStorage = {
  getItem: jest.fn(async key => (store.has(key) ? store.get(key) : null)),
  setItem: jest.fn(async (key, value) => {
    store.set(key, String(value));
  }),
  removeItem: jest.fn(async key => {
    store.delete(key);
  }),
  mergeItem: jest.fn(async (key, value) => {
    const existing = store.has(key) ? JSON.parse(store.get(key)) : {};
    store.set(key, JSON.stringify({...existing, ...JSON.parse(value)}));
  }),
  clear: jest.fn(async () => {
    store.clear();
  }),
  getAllKeys: jest.fn(async () => [...store.keys()]),
  multiGet: jest.fn(async keys =>
    keys.map(k => [k, store.has(k) ? store.get(k) : null]),
  ),
  multiSet: jest.fn(async pairs => {
    pairs.forEach(([k, v]) => store.set(k, String(v)));
  }),
  multiRemove: jest.fn(async keys => {
    keys.forEach(k => store.delete(k));
  }),
  // Test helper — not part of the real API.
  __reset: () => store.clear(),
};

module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
