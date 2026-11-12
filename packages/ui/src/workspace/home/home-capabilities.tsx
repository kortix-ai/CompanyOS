'use client';

import {
  AppWindowIcon,
  CaretDownIcon,
  BriefcaseIcon,
  ChatsCircleIcon,
  ClockIcon,
  GrainsIcon,
  PlugsConnectedIcon,
  type Icon,
} from '@phosphor-icons/react';
import {
  Disclosure,
  DisclosureContent,
  DisclosureTrigger,
} from '../../primitives/disclosure';

import { Button } from '../../primitives/button';
import { useTranslations } from '../../i18n';

/** What Kortix does, in the order a new person meets it. Keys under `firstChat.can`. */
const CAPABILITIES: ReadonlyArray<{ key: string; icon: Icon }> = [
  { key: 'work', icon: BriefcaseIcon },
  { key: 'memory', icon: GrainsIcon },
  { key: 'tools', icon: PlugsConnectedIcon },
  { key: 'chat', icon: ChatsCircleIcon },
  { key: 'schedule', icon: ClockIcon },
  { key: 'apps', icon: AppWindowIcon },
];

/** Shared, collapsed capability reference below the home composer. */
export function HomeCapabilities() {
  const t = useTranslations('firstChat');
  return (
    <Disclosure>
      <DisclosureTrigger
        variant="default"
        className="text-muted-foreground text-sm"
      >
        <Button variant="ghost" className="group">
          {t('canTitle')}
          <CaretDownIcon
            className="size-4 group-aria-expanded:rotate-180"
            aria-hidden
          />
        </Button>
      </DisclosureTrigger>
      <DisclosureContent>
        <ul className="grid gap-5 px-4 py-5 sm:grid-cols-2">
          {CAPABILITIES.map(({ key, icon: Glyph }) => (
            <li key={key} className="flex min-w-0 items-start gap-3">
              <Glyph
                className="text-muted-foreground mt-1 size-4 shrink-0"
                aria-hidden
              />
              <div className="min-w-0 space-y-1">
                <h3 className="text-sm font-medium">{t(`can.${key}.title`)}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
                  {t(`can.${key}.body`)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </DisclosureContent>
    </Disclosure>
  );
}
