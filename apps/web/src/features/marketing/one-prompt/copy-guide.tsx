'use client';

import { Claude } from '@kortix/ui/internal/icons/claude';
import { Codex } from '@kortix/ui/internal/icons/codex';
import { Cursor } from '@kortix/ui/internal/icons/cursor';
import { SolidCheckIcon } from '@kortix/ui/internal/icons/solid-check-icon';
import { Modal, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from '@kortix/ui/modal';
import { PlusIcon } from '@phosphor-icons/react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

import { MarketingButton } from '@/features/marketing/kit/marketing-button';

import { AsciiHoop } from './ascii-hoop';

/** The coding agents the dialog shows, each with its own mark. A "+" closes the row: any agent with a shell runs the prompt. */
const AGENTS: ReadonlyArray<{ name: string; mark: ReactNode }> = [
  { name: 'Claude Code', mark: <Claude className="size-5" /> },
  { name: 'Codex', mark: <Codex className="size-5" /> },
  { name: 'Cursor', mark: <Cursor className="size-5" /> },
  // eslint-disable-next-line @next/next/no-img-element -- a 20px static SVG; next/image adds nothing here
  { name: 'OpenCode', mark: <img src="/provider-icons/opencode.svg" alt="" width={20} height={20} className="size-5 invert" /> },
];

type CopyGuide = { open: (text: string) => void };

const CopyGuideContext = createContext<CopyGuide | null>(null);

/** Opens the "what now" dialog after a copy. Null outside the provider: the button then only copies. */
export function useCopyGuide(): CopyGuide | null {
  return useContext(CopyGuideContext);
}

/** Set on the dialog while it is open: the page's C key does not copy again under it. */
export const COPY_GUIDE_ATTR = 'data-copy-guide';

/**
 * The page's guide after every Copy prompt: the prompt is on the clipboard,
 * now paste it into a coding agent. One dialog for the whole page; each button
 * opens it with the text it copied. Closing it puts focus back on that button.
 */
export function CopyGuideProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const done = useRef<HTMLButtonElement | null>(null);
  const open = useCallback((copied: string) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setText(copied);
    // Done takes the focus once the dialog has placed its own: no focus ring greets the reader, Copy again is one Tab back.
    setTimeout(() => done.current?.focus(), 60);
  }, []);
  const close = () => {
    setText(null);
    // After the close starts, so the dialog's own focus handling does not take it back.
    requestAnimationFrame(() => opener.current?.focus());
  };
  return (
    <CopyGuideContext.Provider value={{ open }}>
      {children}
      <Modal open={text !== null} onOpenChange={(next) => !next && close()}>
        <ModalContent {...{ [COPY_GUIDE_ATTR]: '' }} className="overflow-hidden sm:max-w-md">
          {/* The art: the hula hoop as an ASCII spinning donut, on black. Mounted only while the dialog is open. */}
          <div aria-hidden className="bg-background h-56 sm:h-64">
            <AsciiHoop className="animate-in fade-in duration-slow size-full" />
          </div>
          <ModalHeader>
            <ModalTitle className="inline-flex items-center gap-2">
              <SolidCheckIcon aria-hidden className="size-4.5" />
              Prompt copied
            </ModalTitle>
            <ModalDescription>Open your coding agent, paste it and hit Enter.</ModalDescription>
          </ModalHeader>
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-3 px-6 pb-2">
            {AGENTS.map((agent) => (
              <li key={agent.name} className="text-foreground inline-flex items-center gap-2 text-sm">
                <span aria-hidden className="inline-flex shrink-0">
                  {agent.mark}
                </span>
                {agent.name}
              </li>
            ))}
            <li className="text-muted-foreground inline-flex items-center">
              <PlusIcon aria-hidden className="size-5" />
              <span className="sr-only">and more</span>
            </li>
          </ul>
          <ModalFooter className="sm:justify-between">
            {text !== null ? <CopyAgain text={text} /> : null}
            <MarketingButton ref={done} type="button" variant="primary" size="md" onClick={close}>
              Done
            </MarketingButton>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </CopyGuideContext.Provider>
  );
}

/** Copies the prompt again: a later copy elsewhere may have replaced it on the clipboard. */
function CopyAgain({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <MarketingButton type="button" variant="secondary" size="md" onClick={() => void copy()}>
      {copied ? 'Copied' : 'Copy again'}
    </MarketingButton>
  );
}
