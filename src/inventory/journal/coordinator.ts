import type { JournalOwner } from "./model";

/** Runs a critical section with exclusive access to one durable journal namespace. */
export type RunExclusive = <T>(work: () => Promise<T>) => Promise<T>;

/** The durable namespace a journal addresses: one coordinator exists per (tenant, membership). */
export function namespaceKey(owner: JournalOwner): string {
  return `${owner.tenantId}::${owner.membershipId}`;
}

/** The cross-context (cross-tab) lock name — stable per namespace, matching the storage namespace. */
export function lockName(owner: JournalOwner): string {
  return `admin-mobile.inventory-journal.v2.${owner.tenantId}.${owner.membershipId}`;
}

/** The minimal slice of the Web Locks API we use (so it can be faked in tests). */
export interface WebLocks {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

/** An in-process async mutex: chains work so only one critical section runs at a time in this runtime. */
function createMutex(): RunExclusive {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(work: () => Promise<T>): Promise<T> => {
    const run = tail.then(work, work);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

/** Resolve the real Web Locks API if the runtime (a browser tab) exposes it; otherwise null. */
function resolveWebLocks(): WebLocks | null {
  const nav = (globalThis as { navigator?: { locks?: WebLocks } }).navigator;
  return nav?.locks && typeof nav.locks.request === "function" ? nav.locks : null;
}

/**
 * Build a namespace coordinator. Serialization has two layers:
 *
 * 1. An in-process mutex guarantees that, within ONE JS runtime, overlapping journal operations never
 *    interleave their whole-document read-modify-write — even when the Inventory screen unmounts with an
 *    operation in flight and remounts a brand-new {@link InventoryJournal} over the same namespace (both
 *    instances share this one coordinator via the module registry below).
 * 2. On web, a Web Locks request wraps each critical section so two browser TABS addressing the same
 *    namespace also serialize. Where Web Locks is unavailable the in-process mutex still fully protects a
 *    single runtime; cross-tab coordination simply is not offered (documented), never silently faked.
 */
export function createNamespaceCoordinator(
  owner: JournalOwner,
  webLocks: WebLocks | null = resolveWebLocks(),
): RunExclusive {
  const mutex = createMutex();
  const name = lockName(owner);
  if (!webLocks) return mutex;
  return <T>(work: () => Promise<T>): Promise<T> => mutex(() => webLocks.request(name, work));
}

// One coordinator per durable namespace for the lifetime of the JS runtime, so every InventoryJournal
// instance addressing the same (tenant, membership) — including those created across remounts — shares a
// single effective lock rather than each holding its own instance-local mutex.
const registry = new Map<string, RunExclusive>();

export function getNamespaceCoordinator(owner: JournalOwner): RunExclusive {
  const key = namespaceKey(owner);
  let coordinator = registry.get(key);
  if (!coordinator) {
    coordinator = createNamespaceCoordinator(owner);
    registry.set(key, coordinator);
  }
  return coordinator;
}

/** Test-only: reset the registry so coordinators do not leak between isolated test cases. */
export function resetNamespaceCoordinators(): void {
  registry.clear();
}
