/* eslint-disable @next/next/no-html-link-for-pages -- Authentication boundary requires a new document. */
'use client';
import { useTranslations } from '@/i18n/use-translations';
export function BrowserSettingsCapability() {
  const t = useTranslations('browserLogins');
  return <div className="space-y-4 p-6">
    <p role="status">{t('text43')}</p>
    <a className="text-sm underline" href="/auth/browser-logins">{t('text10')}</a>
    <a className="block text-sm underline" href="/auth">{t('text42')}</a>
  </div>;
}
