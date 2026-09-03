import { useAuth } from "@clerk/expo";
import type {
  CommerceClient,
  TenantCommerceClient,
  TokenProvider,
} from "@shifted/clothing-commerce-sdk";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { createConfiguredCommerceClient } from "../commerce/client";
import { classifyCommerceError } from "../commerce/errors";
import { bootstrapTenants, loadTenantContext, persistTenantSelection } from "../tenant/bootstrap";
import { createSecureTenantStorage } from "../tenant/secure-storage";
import type { TenantStorage } from "../tenant/storage";
import { initialSessionState, sessionReducer, type SessionState } from "./reducer";

export interface SessionContextValue {
  state: SessionState;
  /** Choose a tenant from the multi-tenant selector. */
  selectTenant: (tenantId: string) => void;
  /** Re-run the authenticated bootstrap (e.g. after a transient error). */
  reload: () => void;
  /** Sign out of Clerk and clear all local tenant/session state. */
  signOut: () => Promise<void>;
  /**
   * The single Commerce client, scoped to a resolved tenant. Screens pass the `tenantId` from the
   * resolved session state; the SDK owns the `X-Tenant-Id` header and the server remains the sole
   * authority on what that tenant may read. The returned client is stable per tenant so it is safe
   * to use directly in effect/callback dependencies.
   */
  getTenantClient: (tenantId: string) => TenantCommerceClient;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export interface SessionProviderProps {
  children: ReactNode;
  /** Test seam: inject an alternate tenant storage. Defaults to secure device storage. */
  storage?: TenantStorage;
}

export function SessionProvider({ children, storage: injectedStorage }: SessionProviderProps) {
  const { isLoaded, isSignedIn, userId, sessionId, getToken, signOut: clerkSignOut } = useAuth();
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const [reloadNonce, setReloadNonce] = useState(0);

  const storage = useMemo(() => injectedStorage ?? createSecureTenantStorage(), [injectedStorage]);

  // Clerk's `useAuth` (via @clerk/expo) returns a BRAND-NEW `getToken` function on every render — it
  // is not memoized. Depending on its identity would rebuild the token adapter, hence the Commerce
  // client, hence retrigger the bootstrap effect on every render (an infinite update loop). Instead
  // we keep the latest `getToken` in a ref and expose one stable adapter for the client's lifetime.
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });

  // The Commerce SDK receives only this token callback — never a Clerk object. This adapter is
  // referentially stable (empty deps) yet always calls the current Clerk `getToken` via the ref, so
  // token refreshes are transparent and the client below never has to be rebuilt.
  const tokenProvider = useCallback<TokenProvider>(() => getTokenRef.current(), []);

  // Single, stable Commerce client, built lazily on first use and cached for the app lifetime.
  // Construction happens inside effects (never during render) because it reads the token ref;
  // `tokenProvider` never changes identity, so the client is created exactly once. Construction
  // throws if the API URL is missing — callers translate that into a failed session state.
  const clientRef = useRef<CommerceClient | null>(null);
  const ensureClient = useCallback((): CommerceClient => {
    if (clientRef.current === null) {
      clientRef.current = createConfiguredCommerceClient({ getToken: tokenProvider });
    }
    return clientRef.current;
  }, [tokenProvider]);

  // `withTenant` returns a fresh immutable client on every call, so we memoise one tenant-scoped
  // client per tenantId. This gives screens a referentially stable client they can pass straight
  // into hook dependencies without retriggering fetches on every render.
  const tenantClientsRef = useRef(new Map<string, TenantCommerceClient>());
  const getTenantClient = useCallback(
    (tenantId: string): TenantCommerceClient => {
      const cache = tenantClientsRef.current;
      const existing = cache.get(tenantId);
      if (existing) return existing;
      const scoped = ensureClient().withTenant(tenantId);
      cache.set(tenantId, scoped);
      return scoped;
    },
    [ensureClient],
  );

  // Bootstrap: react to Clerk auth state.
  useEffect(() => {
    if (!isLoaded) {
      dispatch({ type: "clerk-loading" });
      return;
    }
    if (!isSignedIn) {
      dispatch({ type: "signed-out" });
      return;
    }

    let client: CommerceClient;
    try {
      client = ensureClient();
    } catch (error) {
      dispatch({ type: "failed", error: { kind: "unknown", message: (error as Error).message } });
      return;
    }

    let active = true;
    dispatch({ type: "bootstrap-start" });
    void (async () => {
      try {
        const resolution = await bootstrapTenants({ client, storage });
        if (active) dispatch({ type: "resolved", resolution });
      } catch (error) {
        if (active) dispatch({ type: "failed", error: classifyCommerceError(error) });
      }
    })();
    return () => {
      active = false;
    };
    // Bootstrap is keyed on stable session identity (userId/sessionId) plus the explicit reload
    // nonce — NOT on `state`, so our own bootstrap-start/failed dispatches never retrigger this
    // effect (that was the update loop). `ensureClient` and `storage` are referentially stable, so
    // they are safe, correct dependencies that do not cause reruns.
  }, [isLoaded, isSignedIn, userId, sessionId, ensureClient, storage, reloadNonce]);

  // Load /me/context once a tenant is resolved.
  useEffect(() => {
    if (state.phase !== "loading-context") return;
    const { tenantId, tenants } = state;
    let active = true;
    void (async () => {
      try {
        const context = await loadTenantContext(ensureClient(), tenantId);
        if (active) dispatch({ type: "context-loaded", tenantId, tenants, context });
      } catch (error) {
        if (active) dispatch({ type: "failed", error: classifyCommerceError(error) });
      }
    })();
    return () => {
      active = false;
    };
  }, [state, ensureClient]);

  const selectTenant = useCallback(
    (tenantId: string) => {
      if (state.phase !== "choosing") return;
      const { tenants } = state;
      void persistTenantSelection(storage, tenantId);
      dispatch({ type: "context-loading", tenantId, tenants });
    },
    [state, storage],
  );

  const reload = useCallback(() => setReloadNonce((n) => n + 1), []);

  const signOut = useCallback(async () => {
    await storage.clearSelectedTenantId();
    await clerkSignOut();
    dispatch({ type: "signed-out" });
  }, [storage, clerkSignOut]);

  const value = useMemo<SessionContextValue>(
    () => ({ state, selectTenant, reload, signOut, getTenantClient }),
    [state, selectTenant, reload, signOut, getTenantClient],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return value;
}
