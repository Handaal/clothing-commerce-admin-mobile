import { afterEach, describe, expect, it } from "vitest";

import {
  createNamespaceCoordinator,
  getNamespaceCoordinator,
  lockName,
  namespaceKey,
  resetNamespaceCoordinators,
  type WebLocks,
} from "./coordinator";
import type { JournalOwner } from "./model";

const OWNER_A: JournalOwner = { tenantId: "t1", membershipId: "m1" };
const OWNER_A2: JournalOwner = { tenantId: "t1", membershipId: "m1" };
const OWNER_B: JournalOwner = { tenantId: "t1", membershipId: "m2" };

afterEach(() => resetNamespaceCoordinators());

describe("namespace identity", () => {
  it("keys and lock names are per (tenant, membership)", () => {
    expect(namespaceKey(OWNER_A)).toBe(namespaceKey(OWNER_A2));
    expect(namespaceKey(OWNER_A)).not.toBe(namespaceKey(OWNER_B));
    expect(lockName(OWNER_A)).toBe("admin-mobile.inventory-journal.v2.t1.m1");
  });
});

describe("namespace registry", () => {
  it("returns ONE shared coordinator per namespace (so remount-created journals share a lock)", () => {
    expect(getNamespaceCoordinator(OWNER_A)).toBe(getNamespaceCoordinator(OWNER_A2));
    expect(getNamespaceCoordinator(OWNER_A)).not.toBe(getNamespaceCoordinator(OWNER_B));
  });

  it("serializes overlapping critical sections sharing the coordinator", async () => {
    const coordinator = getNamespaceCoordinator(OWNER_A);
    const order: string[] = [];
    const slow = (label: string, delay: number) =>
      coordinator(async () => {
        order.push(`${label}:start`);
        await new Promise((r) => setTimeout(r, delay));
        order.push(`${label}:end`);
      });
    // B is faster but must still wait for A to finish — no interleaving.
    await Promise.all([slow("A", 20), slow("B", 0)]);
    expect(order).toEqual(["A:start", "A:end", "B:start", "B:end"]);
  });
});

describe("web cross-context coordinator", () => {
  it("wraps each critical section in a Web Locks request for the namespace", async () => {
    const requested: string[] = [];
    const webLocks: WebLocks = {
      request: async (name, callback) => {
        requested.push(name);
        return callback();
      },
    };
    const coordinator = createNamespaceCoordinator(OWNER_A, webLocks);
    await coordinator(async () => "ok");
    await coordinator(async () => "ok");
    expect(requested).toEqual([lockName(OWNER_A), lockName(OWNER_A)]);
  });

  it("still serializes in-process even when the Web Lock resolves immediately", async () => {
    const webLocks: WebLocks = { request: (_name, cb) => cb() };
    const coordinator = createNamespaceCoordinator(OWNER_A, webLocks);
    const order: string[] = [];
    const task = (label: string, delay: number) =>
      coordinator(async () => {
        order.push(`${label}:start`);
        await new Promise((r) => setTimeout(r, delay));
        order.push(`${label}:end`);
      });
    await Promise.all([task("A", 15), task("B", 0)]);
    expect(order).toEqual(["A:start", "A:end", "B:start", "B:end"]);
  });

  it("falls back to the in-process mutex when Web Locks is unavailable (no throw)", async () => {
    const coordinator = createNamespaceCoordinator(OWNER_A, null);
    await expect(coordinator(async () => 42)).resolves.toBe(42);
  });

  it("different namespaces lock on distinct names (not serialized against each other)", async () => {
    const requested: string[] = [];
    const webLocks: WebLocks = {
      request: (name, cb) => {
        requested.push(name);
        return cb();
      },
    };
    const a = createNamespaceCoordinator(OWNER_A, webLocks);
    const b = createNamespaceCoordinator(OWNER_B, webLocks);
    await Promise.all([a(async () => 1), b(async () => 2)]);
    expect(requested).toEqual(expect.arrayContaining([lockName(OWNER_A), lockName(OWNER_B)]));
    expect(lockName(OWNER_A)).not.toBe(lockName(OWNER_B));
  });
});
