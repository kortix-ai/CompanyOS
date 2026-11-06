/* eslint-disable @next/next/no-html-link-for-pages -- Identity changes require a document load to discard private App Router caches. */
'use client';
import { useTranslations } from '@/i18n/use-translations';
import { browserDocumentIdentity, selectedDocumentSession } from '@/lib/auth/browser-document';
import { createBrowserLifecycle } from '@/lib/auth/browser-lifecycle';
import { Button } from '@kortix/ui/button';
import { AuthFrame } from '@kortix/ui/internal/auth/auth-card-shell';
import Loading from '@kortix/ui/loading';

import { setBootstrapAuthToken, setCachedAuthToken } from '@/lib/auth-token';
import { IDENTITY_MARKER_KEY, shouldResetClientState } from '@/lib/auth/identity-marker';
import { performSignOut } from '@/lib/auth/perform-sign-out';
import { isDefinitiveSessionRejection } from '@/lib/auth/session-rejection';
import { adoptDeviceCaches, detachDeviceCaches } from '@/lib/device-caches';
import { createClient } from '@/lib/supabase/client';
import { rememberValidatedUser } from '@/lib/supabase/mfa';
import { resetClientState } from '@/lib/utils/reset-client-state';
import { resetIdentityState } from '@kortix/sdk/react';
import { getSharedQueryClient } from '@kortix/ui/internal/lib/query-client-singleton';
import {
  adoptManagedStorage,
  detachManagedStorage,
  safeGetItem,
  safeSetItem,
} from '@kortix/ui/internal/lib/storage/managed-storage';
import { Session, SupabaseClient, User } from '@supabase/supabase-js';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { withAuthBootstrapTimeout } from './auth-bootstrap';
// Auth tracking moved to AuthEventTracker component (handles OAuth redirects)

type AuthContextType = {
  selectedDocument: boolean;
  supabase: SupabaseClient;
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  bootstrapError: Error | null;
  retryAuth: () => void;
  signOut: () => Promise<void>;
};

const AUTH_BOOTSTRAP_TIMEOUT_MS = 15_000;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const supabase = useMemo(() => createClient(), []);
  const [selectedDocument, setSelectedDocument] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<Error | null>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const retryAuth = useCallback(() => {
    setIsLoading(true);
    setBootstrapError(null);
    setBootstrapAttempt((attempt) => attempt + 1);
  }, []);
  /**
   * The last user THIS document published. The localStorage marker cannot do
   * this job: it is one origin-wide value, so two tabs signed into two accounts
   * overwrite each other's while each keeps its own React Query cache. See
   * `lib/auth/identity-marker.ts` for what each marker is allowed to mean.
   */
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const selected = browserDocumentIdentity();
    if (selected) {
      setSelectedDocument(true);
      let validating = false;
      const lifecycle = createBrowserLifecycle({
        validate: async () => {
          validating = true;
          selected.getToken.invalidate();
          validating = false;
          return withAuthBootstrapTimeout(selectedDocumentSession(), AUTH_BOOTSTRAP_TIMEOUT_MS);
        },
        clear: () => {
          detachManagedStorage();
          detachDeviceCaches();
          getSharedQueryClient()?.clear();
          resetIdentityState();
          setSession(null);
          setUser(null);
          setIsLoading(true);
        },
        publish: (verified) => {
          adoptManagedStorage(verified.user.id);
          adoptDeviceCaches(verified.user.id);
          setSession(verified);
          setUser(verified.user);
          setBootstrapError(null);
          setIsLoading(false);
        },
        error: (error) => {
          if ([401, 404].includes((error as { status?: number })?.status ?? 0))
            selected.select(null);
          setBootstrapError(
            error instanceof Error ? error : new Error('Browser identity unavailable'),
          );
          setIsLoading(false);
        },
      });
      // Self-initiated cache invalidation is not another validation request.
      const revalidate = () => lifecycle.revalidate();
      const backgroundRevalidate = () => lifecycle.revalidate(false);
      const pageshow = (event: PageTransitionEvent) => lifecycle.revalidate(event.persisted);
      const unsubscribe = selected.subscribe(() => {
        if (!validating) lifecycle.revalidate();
      });
      const channel =
        typeof BroadcastChannel === 'undefined'
          ? null
          : new BroadcastChannel('kortix-browser-roster');
      if (channel)
        channel.onmessage = (event) => {
          if (event.data?.slot === selected.getSlot()) revalidate();
        };
      window.addEventListener('focus', backgroundRevalidate);
      window.addEventListener('pageshow', pageshow);
      window.addEventListener('online', backgroundRevalidate);
      const heartbeat = window.setInterval(() => lifecycle.revalidate(false), 30_000);
      revalidate();
      return () => {
        active = false;
        lifecycle.dispose();
        unsubscribe();
        channel?.close();
        window.clearInterval(heartbeat);
        window.removeEventListener('focus', backgroundRevalidate);
        window.removeEventListener('pageshow', pageshow);
        window.removeEventListener('online', backgroundRevalidate);
      };
    }

    /**
     * Make the client state safe to hand to `nextUserId`, then record that it
     * belongs to them. Resolves only once any wipe has finished, so callers can
     * publish the new user immediately after awaiting it.
     */
    const adoptUser = async (nextUserId: string) => {
      const mustReset = shouldResetClientState({
        inDocumentUserId: lastUserIdRef.current,
        persistedUserId: safeGetItem(IDENTITY_MARKER_KEY),
        nextUserId,
      });

      if (mustReset) {
        // Cross-tab SIGNED_IN can replace the user without SIGNED_OUT.
        // Fence pending requests before cleanup yields or the new token lands.
        setBootstrapAuthToken(null);
        setCachedAuthToken(null);
        try {
          await resetClientState();
        } catch (error) {
          // Swallowed on purpose. This runs BEFORE the user is published and
          // before `isLoading` is cleared; an escaping rejection would leave
          // the whole app parked on the loading frame forever.
          console.error('[AuthProvider] Failed to clear state for the incoming user:', error);
        }
      }

      lastUserIdRef.current = nextUserId;
      safeSetItem(IDENTITY_MARKER_KEY, nextUserId);
      // Before the publish, like the reset above: the first frame that knows
      // this user already has their cached projects and sessions to render.
      adoptDeviceCaches(nextUserId);
    };

    const getInitialSession = async () => {
      try {
        const {
          data: { session: currentSession },
        } = await withAuthBootstrapTimeout(supabase.auth.getSession(), AUTH_BOOTSTRAP_TIMEOUT_MS);
        if (!active) return;

        if (currentSession) {
          // Validate the session against the auth server — catches stale
          // sessions after a DB reset where the JWT is valid but the user
          // no longer exists.
          const { data: validated, error: userError } = await withAuthBootstrapTimeout(
            supabase.auth.getUser(),
            AUTH_BOOTSTRAP_TIMEOUT_MS,
          );
          if (!active) return;
          // The sign-in gate's first AAL read reuses this answer instead of a
          // second auth round trip (see `rememberValidatedUser`).
          rememberValidatedUser(userError ? null : (validated?.user ?? null));
          //
          // Only the auth server's VERDICT signs out (`isDefinitiveSessionRejection`:
          // 401, 403, or no session to validate). A round trip that never
          // completed is not a verdict. This provider also runs inside the
          // GitHub identity-proof popup, which closes itself 200ms after
          // posting its token; its in-flight `getUser()` then aborts into a
          // retryable status-0 error, and signing out on THAT cleared the
          // cookie every tab shares and broadcast `SIGNED_OUT` to the opener
          // (dev, 2026-09-17). See `lib/auth/session-rejection.ts`.
          if (userError && isDefinitiveSessionRejection(userError)) {
            console.warn('[AuthProvider] Stale session detected, signing out:', userError.message);
            await supabase.auth.signOut();
            if (!active) return;
            setBootstrapAuthToken(null);
            setCachedAuthToken(null);
            setSession(null);
            setUser(null);
            return;
          }
          if (userError) {
            console.warn(
              '[AuthProvider] Could not validate the session; keeping it:',
              userError.message,
            );
          }
        }

        // Before the publish, not after: the state on screen belongs to
        // whoever the markers name, and handing it to a different account —
        // even for the length of one render — is the bug this guard exists for.
        if (currentSession?.user?.id) {
          await adoptUser(currentSession.user.id);
          if (!active) return;
        }

        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        if (currentSession?.access_token) {
          setCachedAuthToken(currentSession.access_token);
          setBootstrapAuthToken(null);
        }
      } catch (error) {
        if (!active) return;
        console.warn('[AuthProvider] Failed to bootstrap initial session:', error);
        setBootstrapError(
          error instanceof Error && error.message.startsWith('Authentication did not answer')
            ? new Error('Authentication is not responding. Check your connection and retry.')
            : error instanceof Error
              ? error
              : new Error('Authentication failed'),
        );
      } finally {
        if (active) setIsLoading(false);
      }
    };

    getInitialSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      const nextUserId = newSession?.user?.id;

      // INITIAL_SESSION is here, and not only in the switch below, for one
      // reason: a cross-user COLD LOAD arrives as INITIAL_SESSION, and it
      // arrives before `getInitialSession()` has finished its `getUser()`
      // round trip. Publishing first would hand the previous account's
      // mounted caches to the new user for the whole length of the reset,
      // which is long enough for every consumer that reads on mount to fetch
      // against them.
      if (nextUserId && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) {
        await adoptUser(nextUserId);
        if (!active) return;
      }

      setSession(newSession);
      setUser(newSession?.user ?? null);

      // Only getInitialSession clears initial loading, after validation and
      // identity cleanup. INITIAL_SESSION can arrive before either finishes.
      switch (event) {
        case 'SIGNED_IN': {
          if (newSession?.access_token) {
            setCachedAuthToken(newSession.access_token);
            setBootstrapAuthToken(null);
          }
          break;
        }
        case 'SIGNED_OUT':
          setBootstrapAuthToken(null);
          setCachedAuthToken(null);
          await resetClientState();
          // This branch no longer calls `safeRemoveItem(IDENTITY_MARKER_KEY)`
          // directly — an earlier revision did, which deleted the exact
          // value the next `SIGNED_IN` compares against, so after an
          // explicit logout the cross-user reset could never fire. But the
          // marker does NOT survive this branch: `resetClientState()` above
          // -> `clearUserLocalStorage()` runs a PREFIX sweep, and
          // `IDENTITY_MARKER_KEY` ('kortix-last-user-id') matches
          // `APP_STORAGE_PREFIXES[0]` ('kortix-') and is not on
          // `KEEP_STORAGE_KEYS` — so it is swept like every other per-user
          // key. That is SAFE, not a residual hole: `shouldResetClientState`
          // reads an absent marker as UNKNOWN, and unknown resets (see its
          // own doc comment). The next sign-in rewrites the marker
          // unconditionally (`safeSetItem` in `adoptUser`, above) regardless
          // of whether this branch ran.
          break;
        case 'TOKEN_REFRESHED':
          if (newSession?.access_token) {
            setCachedAuthToken(newSession.access_token);
            setBootstrapAuthToken(null);
          }
          break;
        case 'MFA_CHALLENGE_VERIFIED':
          if (newSession?.access_token) {
            setCachedAuthToken(newSession.access_token);
            setBootstrapAuthToken(null);
          }
          break;
        default:
      }
    });

    return () => {
      active = false;
      authListener?.subscription.unsubscribe();
    };
  }, [bootstrapAttempt, supabase]);

  // Memoize the context value to prevent cascading re-renders of the entire
  // component tree on every auth state change (e.g. silent token refreshes).
  //
  // `signOut` is the shared `performSignOut` itself, not a provider-local
  // wrapper: it is a module constant, so it is stable across renders, and
  // routing it through here is what keeps every consumer of `useAuth()` on the
  // one sign-out path instead of hand-rolling a fifth cleanup.
  const value = useMemo<AuthContextType>(
    () => ({
      selectedDocument,
      supabase,
      session,
      user,
      isLoading,
      bootstrapError,
      retryAuth,
      signOut: performSignOut,
    }),
    [selectedDocument, supabase, session, user, isLoading, bootstrapError, retryAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/** Mount inside I18nProvider so validation screens use the same catalog and UI providers. */
export function BrowserIdentityGate({ children }: { children: ReactNode }) {
  const { selectedDocument, user, isLoading, bootstrapError, retryAuth } = useAuth();
  const tAccounts = useTranslations('browserLogins');
  return selectedDocument && (!user || isLoading) ? (
    <AuthFrame footerVariant="none">
      <div role="status" className="space-y-4 text-center text-sm">
        {!bootstrapError && (
          <div className="flex justify-center">
            <Loading className="size-5" />
          </div>
        )}
        <p>{bootstrapError ? tAccounts('identityUnavailable') : tAccounts('validatingIdentity')}</p>
        {bootstrapError && (
          <div className="flex flex-col gap-2">
            <Button onClick={retryAuth}>{tAccounts('retryIdentity')}</Button>
            <Button variant="outline" asChild>
              <a href="/auth/browser-logins">{tAccounts('text10')}</a>
            </Button>
          </div>
        )}
      </div>
    </AuthFrame>
  ) : (
    children
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
