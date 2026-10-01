/**
 * Test helpers for the Web Locks API capability the inventory journal relies on for cross-tab safety.
 *
 * Component specs render the inventory write surface as if in a SUPPORTED browser — one that exposes
 * `navigator.locks` — because that is the normal case the write forms are designed for. jsdom does not
 * implement Web Locks, so {@link installWebLocks} stubs a minimal, correct, in-process implementation
 * (the lock simply runs the critical section). Specs that exercise the UNSUPPORTED-browser fail-closed
 * path call {@link removeWebLocks} to simulate a browser without Web Locks.
 */

interface WebLocksLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

/** Install a minimal working `navigator.locks` so cross-context journal writes are considered safe. */
export function installWebLocks(): void {
  const nav = globalThis.navigator as unknown as { locks?: WebLocksLike };
  const locks: WebLocksLike = { request: (_name, callback) => callback() };
  Object.defineProperty(nav, "locks", { value: locks, configurable: true, writable: true });
}

/** Remove `navigator.locks` so the runtime is treated as a browser without Web Locks (fail closed). */
export function removeWebLocks(): void {
  const nav = globalThis.navigator as unknown as { locks?: WebLocksLike };
  if (nav && "locks" in nav) {
    delete nav.locks;
  }
}
