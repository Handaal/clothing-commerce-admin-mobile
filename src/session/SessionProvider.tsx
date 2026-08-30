import { useAuth } from "@clerk/expo";
import type { TokenProvider } from "@shifted/clothing-commerce-sdk";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
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
}

const SessionContext = createContext<SessionContextValue | null>(null);

export interface SessionProviderProps {
  children: ReactNode;
  /** Test seam: inject an alternate tenant storage. Defaults to secure device storage. */
  storage?: TenantStorage;
}

export function SessionProvider({ children, storage: injectedStorage }: SessionProviderProps) {
  const { isLoaded, isSignedIn, getToken, signOut: clerkSignOut } = useAuth();
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const [reloadNonce, setReloadNonce] = useState(0);

  const storage = useMemo(() => injectedStorage ?? createSecureTenantStorage(), [injectedStorage]);

  // The Commerce SDK receives only this token callback — never a Clerk object. Clerk's getToken is
  // referentially stable per session and changes when the session changes, which is exactly when we
  // want to rebuild the client and re-bootstrap.
  const tokenProvider = useCallback<TokenProvider>(() => getToken(), [getToken]);

  // Single Commerce client for the app lifetime. Construction throws if the API URL is missing.
  const clientResult = useMemo(() => {
    try {
      return { client: createConfiguredCommerceClient({ getToken: tokenProvider }) };
    } catch (error) {
      return { error: error as Error };
    }
  }, [tokenProvider]);

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
    if (clientResult.error) {
      dispatch({
        type: "failed",
        error: { kind: "unknown", message: clientResult.error.message },
      });
      return;
    }

    const client = clientResult.client;
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
  }, [isLoaded, isSignedIn, clientResult, storage, reloadNonce]);

  // Load /me/context once a tenant is resolved.
  useEffect(() => {
    if (state.phase !== "loading-context" || clientResult.error) return;
    const client = clientResult.client;
    const { tenantId, tenants } = state;
    let active = true;
    void (async () => {
      try {
        const context = await loadTenantContext(client, tenantId);
        if (active) dispatch({ type: "context-loaded", tenantId, tenants, context });
      } catch (error) {
        if (active) dispatch({ type: "failed", error: classifyCommerceError(error) });
      }
    })();
    return () => {
      active = false;
    };
  }, [state, clientResult]);

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
    () => ({ state, selectTenant, reload, signOut }),
    [state, selectTenant, reload, signOut],
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
