/* eslint-disable @next/next/no-html-link-for-pages -- Identity changes require a document load to discard private App Router caches. */
'use client';

import { useTranslations } from '@/i18n/use-translations';
import {
  removeAllBrowserDocumentLogins,
  removeBrowserDocumentLogin,
} from '@/lib/auth/browser-document';
import { parseBrowserRoute, stripBrowserSelector } from '@/lib/auth/browser-route';
import { browserLogins, type BrowserLoginSlot } from '@kortix/sdk';
import { Avatar, AvatarFallback } from '@kortix/ui/avatar';
import { Button } from '@kortix/ui/button';
import { ConfirmDialog } from '@kortix/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kortix/ui/dropdown-menu';
import { Input } from '@kortix/ui/input';
import { AuthFrame } from '@kortix/ui/internal/auth/auth-card-shell';
import { KortixLogo } from '@kortix/ui/kortix-logo';
import { Label } from '@kortix/ui/label';
import { ArrowRightIcon, CheckIcon, DotsThreeIcon } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';

import {
  accountHref,
  loginAttemptDestination,
  loginDestination,
} from '@/lib/auth/browser-login-navigation';
function useRoster() {
  const [slots, setSlots] = useState<BrowserLoginSlot[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const reload = async () => {
    setLoading(true);
    setError(false);
    try {
      const capabilities = await browserLogins.capabilities();
      setEnabled(capabilities.enabled);
      try {
        setSlots(capabilities.has_handle === false ? [] : (await browserLogins.roster()).slots);
      } catch (error) {
        if ((error as { status?: number }).status !== 401) throw error;
        setSlots([]);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void reload();
  }, []);
  return { slots, enabled, loading, error, reload };
}

export function SignedInAccounts() {
  const t = useTranslations('browserLogins');
  const { slots, enabled, loading, error, reload } = useRoster();
  if (!enabled && slots.length === 0) return null;
  const current =
    typeof window === 'undefined' ? null : parseBrowserRoute(window.location.pathname)?.slot;
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>{t('text1')}</DropdownMenuLabel>
      {loading && <DropdownMenuItem disabled>{t('text2')}</DropdownMenuItem>}
      {error && <DropdownMenuItem onSelect={() => void reload()}>{t('text3')}</DropdownMenuItem>}
      {slots.map((slot) => (
        <DropdownMenuItem key={slot.slot} asChild>
          <a
            href={accountHref(slot.slot, window.location.pathname + window.location.search)}
            aria-current={current === slot.slot ? 'true' : undefined}
          >
            {current === slot.slot && <CheckIcon className="size-4 shrink-0" aria-hidden />}
            {slot.email ?? t('text5')}
            {slot.needs_sign_in ? t('text6') : ''}
          </a>
        </DropdownMenuItem>
      ))}
      {current && (
        <DropdownMenuItem asChild>
          <a
            href={accountHref(current, window.location.pathname + window.location.search)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('text7')}
          </a>
        </DropdownMenuItem>
      )}
      {enabled && (
        <DropdownMenuItem disabled={slots.length >= 5} asChild>
          <a
            href={
              '/auth/browser-logins?add=1&returnTo=' +
              encodeURIComponent(
                stripBrowserSelector(window.location.pathname + window.location.search),
              )
            }
          >
            {slots.length >= 5 ? t('text8') : t('text9')}
          </a>
        </DropdownMenuItem>
      )}
      <DropdownMenuItem asChild>
        <a href="/auth/browser-logins">{t('text10')}</a>
      </DropdownMenuItem>
    </>
  );
}

export function BrowserAccountsPage({ callback = false }: { callback?: boolean }) {
  const t = useTranslations('browserLogins');
  const callbackStarted = useRef(false);
  const attemptDestination = useRef<string | null>(null);
  const removalTrigger = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const roster = useRoster();
  const [attempt, setAttempt] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [method, setMethod] = useState<'password' | 'email'>('password');
  const [sent, setSent] = useState(false);
  const [candidate, setCandidate] = useState<string | null>(null);
  const [mfa, setMfa] = useState<{
    kind: 'attempt' | 'slot';
    id: string;
    factor: string;
    challenge: string;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [add, setAdd] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const destination = () =>
    loginDestination(new URLSearchParams(window.location.search).get('returnTo'));
  const run = async (work: () => Promise<void>) => {
    setPending(true);
    setMessage('');
    setFailed(false);
    try {
      await work();
    } catch (error) {
      setFailed(true);
      const status = (error as { status?: number }).status;
      setMessage(status === 429 ? t('text11') : t('text12'));
    } finally {
      setPending(false);
    }
  };
  const factors = async (target: { kind: 'attempt' | 'slot'; id: string }) => {
    const result = await browserLogins.mfaFactors(target);
    const factor = result.factors.find((f) => f.factor_type === 'totp' && f.status === 'verified');
    if (!factor) return false;
    const challenge = await browserLogins.challengeMfa(target, { factor_id: factor.id });
    setMfa({ ...target, factor: factor.id, challenge: challenge.id });
    return true;
  };
  useEffect(() => {
    setAdd(new URLSearchParams(window.location.search).get('add') === '1');
    if (new URLSearchParams(window.location.search).get('revocation') === 'pending')
      setMessage(t('text18'));
    if (!callback || callbackStarted.current) return;
    callbackStarted.current = true;
    const params = new URLSearchParams(window.location.search);
    const id = params.get('attempt');
    const providerCode = params.get('code');
    const stored = sessionStorage.getItem('kortix-login-attempt');
    if (!id || !providerCode || stored !== id) {
      sessionStorage.removeItem('kortix-login-return');
      sessionStorage.removeItem('kortix-login-attempt');
      setFailed(true);
      setMessage(t('text13'));
      return;
    }
    attemptDestination.current = loginAttemptDestination(
      sessionStorage.getItem('kortix-login-return'),
      id,
      destination(),
    );
    sessionStorage.removeItem('kortix-login-return');
    sessionStorage.removeItem('kortix-login-attempt');
    setAttempt(id);
    void run(async () => {
      const result = await browserLogins.complete(id, { code: providerCode });
      history.replaceState(null, '', '/auth/browser-logins/callback');
      setCandidate(result.user.email ?? t('text14'));
      await factors({ kind: 'attempt', id });
    });
  }, [callback]);
  const begin = async (kind: 'password' | 'email' | 'google') => {
    attemptDestination.current = destination();
    sessionStorage.removeItem('kortix-login-return');
    sessionStorage.removeItem('kortix-login-attempt');
    await browserLogins.initialize();
    const result = await browserLogins.begin({ method: kind });
    setAttempt(result.attempt);
    return result;
  };
  const confirm = async () => {
    if (!attempt) return;
    const result = await browserLogins.confirm(attempt);
    if (result.duplicate_candidate) await browserLogins.cancel(result.duplicate_candidate);
    await browserLogins.token(result.slot);
    const target = attemptDestination.current ?? destination();
    attemptDestination.current = null;
    sessionStorage.removeItem('kortix-login-return');
    sessionStorage.removeItem('kortix-login-attempt');
    window.location.assign(accountHref(result.slot, target));
  };
  return (
    <AuthFrame footerVariant={add || candidate ? 'continue' : 'none'}>
      <section className="space-y-6" aria-busy={pending}>
        <ConfirmDialog
          open={removing !== null}
          onOpenChange={(open) => {
            if (!open && !pending) setRemoving(null);
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const trigger = removalTrigger.current;
            if (trigger?.isConnected && !trigger.disabled) trigger.focus();
            else heading.current?.focus();
          }}
          title={t(removing === 'all' ? 'text23' : 'text17')}
          description={
            <>
              {t('text16')}
              {failed && message && (
                <p role="alert" className="mt-4 text-sm">
                  {message}
                </p>
              )}
            </>
          }
          confirmLabel={t(removing === 'all' ? 'text25' : 'text20')}
          cancelLabel={t('text40')}
          isPending={pending}
          onConfirm={() =>
            void run(async () => {
              if (!removing) return;
              const receipt =
                removing === 'all'
                  ? await removeAllBrowserDocumentLogins()
                  : await removeBrowserDocumentLogin(removing);
              await roster.reload();
              setMessage(
                receipt.revocation_pending
                  ? t('text18')
                  : t(removing === 'all' ? 'text24' : 'text19'),
              );
              setRemoving(null);
            })
          }
        />
        <KortixLogo variant="icon" size={22} className="text-foreground hidden md:block" />
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-foreground text-2xl font-medium tracking-tight text-balance md:mt-6"
        >
          {candidate ? t('text15') : t('text1')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('text16')}</p>
        {message && !removing && (
          <p role={failed ? 'alert' : 'status'} className="text-sm">
            {message}
          </p>
        )}
        {roster.loading && <p role="status">{t('text2')}</p>}
        {roster.error && (
          <Button variant="outline" onClick={() => void roster.reload()}>
            {t('text3')}
          </Button>
        )}
        {!candidate && roster.slots.length > 0 && (
          <ul className="divide-y rounded-xl border">
            {roster.slots.map((slot) => (
              <li key={slot.slot} className="flex items-center gap-3 p-4">
                <a
                  className="focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:ring-2 focus-visible:outline-none"
                  href={
                    slot.needs_sign_in
                      ? '/auth/browser-logins?add=1&returnTo=' + encodeURIComponent(destination())
                      : accountHref(slot.slot, destination())
                  }
                >
                  <Avatar className="size-9 shrink-0">
                    <AvatarFallback>{(slot.email ?? '?').slice(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span
                    className="min-w-0 flex-1 truncate text-sm font-medium"
                    title={slot.email ?? undefined}
                  >
                    {slot.email ?? t('text5')}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-sm">
                    {t(slot.needs_sign_in ? 'text42' : 'openAccount')}
                    <ArrowRightIcon className="size-4" aria-hidden />
                  </span>
                </a>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('accountActions')}
                      disabled={pending}
                      onPointerDown={(event) => {
                        removalTrigger.current = event.currentTarget;
                      }}
                      onKeyDown={(event) => {
                        removalTrigger.current = event.currentTarget;
                      }}
                    >
                      <DotsThreeIcon className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    onCloseAutoFocus={(event) => {
                      if (removing) event.preventDefault();
                    }}
                  >
                    <DropdownMenuItem
                      disabled={pending}
                      onSelect={() =>
                        void run(async () => {
                          if (!(await factors({ kind: 'slot', id: slot.slot })))
                            setMessage(t('text21'));
                        })
                      }
                    >
                      {t('text22')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={pending} onSelect={() => setRemoving(slot.slot)}>
                      {t('text20')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
        {!candidate && roster.enabled && roster.slots.length < 5 && !add && (
          <Button onClick={() => setAdd(true)}>{t('text9')}</Button>
        )}
        {!candidate && roster.slots.length > 0 && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={(event) => {
              removalTrigger.current = event.currentTarget;
              setRemoving('all');
            }}
          >
            {t('text25')}
          </Button>
        )}
        {roster.slots.length >= 5 && !add && <p>{t('text26')}</p>}
        {add && roster.enabled && !candidate && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const id = attempt ?? (await begin(method)).attempt;
                if (method === 'email' && !sent) {
                  await browserLogins.sendEmail(id, { email });
                  setSent(true);
                  return;
                }
                const result = await browserLogins.complete(
                  id,
                  method === 'password' ? { email, password } : { email, token: code },
                );
                setPassword('');
                setCode('');
                setCandidate(result.user.email ?? t('text14'));
                await factors({ kind: 'attempt', id });
              });
            }}
          >
            <Label htmlFor="saved-email">{t('text27')}</Label>
            <Input
              id="saved-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending || sent}
            />
            {method === 'password' ? (
              <>
                <Label htmlFor="saved-password">{t('text28')}</Label>
                <Input
                  id="saved-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </>
            ) : (
              sent && (
                <>
                  <Label htmlFor="saved-code">{t('text29')}</Label>
                  <Input
                    id="saved-code"
                    autoComplete="one-time-code"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </>
              )
            )}
            <Button type="submit" disabled={pending}>
              {pending ? t('text30') : method === 'email' && !sent ? t('text31') : t('text32')}
            </Button>
            {!attempt && (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setMethod(method === 'password' ? 'email' : 'password')}
              >
                {method === 'password' ? t('text33') : t('text34')}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() =>
                void run(async () => {
                  if (attempt) await browserLogins.cancel(attempt);
                  const result = await begin('google');
                  if (!result.url) throw Error('Missing provider URL');
                  sessionStorage.setItem('kortix-login-attempt', result.attempt);
                  sessionStorage.setItem(
                    'kortix-login-return',
                    JSON.stringify({ attempt: result.attempt, destination: destination() }),
                  );
                  window.location.assign(result.url);
                })
              }
            >
              {t('text35')}
            </Button>
          </form>
        )}
        {mfa && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await browserLogins.verifyMfa(
                  { kind: mfa.kind, id: mfa.id },
                  { factor_id: mfa.factor, challenge_id: mfa.challenge, code },
                );
                setCode('');
                setMfa(null);
                setMessage(t('text36'));
              });
            }}
          >
            <Label htmlFor="mfa-code">{t('text37')}</Label>
            <Input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <Button disabled={pending}>{t('text38')}</Button>
          </form>
        )}
        {candidate && (
          <>
            <p>{candidate}</p>
            <Button disabled={pending || !!mfa} onClick={() => void run(confirm)}>
              {t('text39')}
            </Button>
          </>
        )}
        {(attempt || add) && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              void run(async () => {
                if (attempt) await browserLogins.cancel(attempt);
                attemptDestination.current = null;
                setAttempt(null);
                setCandidate(null);
                setMfa(null);
                setPassword('');
                setAdd(false);
                setSent(false);
                sessionStorage.removeItem('kortix-login-attempt');
                sessionStorage.removeItem('kortix-login-return');
              })
            }
          >
            {t('text40')}
          </Button>
        )}
        {!roster.enabled && <p>{t('text41')}</p>}
        {roster.slots.length === 0 && (
          <a className="text-muted-foreground block text-sm underline" href="/auth">
            {t('standardSignIn')}
          </a>
        )}
      </section>
    </AuthFrame>
  );
}
