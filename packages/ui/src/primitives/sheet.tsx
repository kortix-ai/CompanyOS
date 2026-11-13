'use client';

import { Dialog as SheetPrimitive } from '@base-ui/react/dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { Close } from '../icons/close';
import { asChildRender, openState, stateRender } from '../lib/base-ui-compat';
import { cn } from '../lib/utils';
import {
  DIALOG_CLOSE,
  DIALOG_CLOSE_STYLE,
  DIALOG_DESCRIPTION,
  DIALOG_FOOTER,
  DIALOG_HEADER,
  DIALOG_OVERLAY,
  DIALOG_PADDING,
  DIALOG_TITLE,
} from './dialog-recipe';
import { useUiStrings } from '../providers/ui-provider';
import { dialogContentZ, dialogOverlayZ, useDialogDepth } from '../lib/z-stack';
import {
  Dialog,
  DialogClose,
  DialogPopup,
  DialogPortal,
  DialogTrigger,
  type DialogContentBaseProps,
} from './dialog';

// A sheet is a dialog that slides in from an edge: same root, trigger, close,
// portal and popup contract; only the surface and its motion differ.
const Sheet = Dialog;

const SheetTrigger = DialogTrigger;

const SheetClose = DialogClose;

const SheetPortal = DialogPortal;

const SheetOverlay = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
  ({ className, style, ...props }, ref) => {
    const depth = useDialogDepth();

    return (
      <SheetPrimitive.Backdrop
        className={cn(
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0',
          DIALOG_OVERLAY,
          className,
        )}
        style={{ zIndex: dialogOverlayZ(depth), ...style }}
        render={stateRender('div', openState)}
        {...props}
        ref={ref}
      />
    );
  },
);
SheetOverlay.displayName = 'SheetOverlay';

/**
 * Every side floats the same way (D45): a 12px margin from the window edge and
 * 12px corners from md up (full-bleed on a phone), the dialog's shadow ring for
 * an edge, and the dialog's spacing. Left and right take the full height; top
 * and bottom take their content, up to 85% of the screen.
 */
const sheetVariants = cva(
  cn(
    'bg-popover fixed flex min-h-0 flex-col overflow-hidden shadow-ring-lg outline-none transition-transform ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out',
    'md:m-(--dialog-inset) md:rounded-(--dialog-radius)',
    DIALOG_PADDING,
  ),
  {
    variants: {
      side: {
        top: 'inset-x-0 top-0 max-h-[85dvh] data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
        bottom:
          'inset-x-0 bottom-0 max-h-[85dvh] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        left: 'inset-y-0 left-0 h-full w-full md:h-[calc(100dvh-2*var(--dialog-inset))] md:w-3/4 sm:max-w-sm data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
        right:
          'inset-y-0 right-0 h-full w-full md:h-[calc(100dvh-2*var(--dialog-inset))] md:w-3/4 sm:max-w-sm data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
      },
    },
    defaultVariants: {
      side: 'right',
    },
  },
);

interface SheetContentProps extends DialogContentBaseProps, VariantProps<typeof sheetVariants> {
  showCloseButton?: boolean;
  overlayClassName?: string;
}

const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  (
    {
      side = 'right',
      className,
      children,
      showCloseButton = true,
      overlayClassName,
      style,
      forceMount,
      ...props
    },
    ref,
  ) => {
    const depth = useDialogDepth();
    const strings = useUiStrings();

    return (
      <SheetPortal keepMounted={forceMount}>
        <SheetOverlay className={overlayClassName} />
        <DialogPopup
          ref={ref}
          className={cn(sheetVariants({ side }), className)}
          style={{ zIndex: dialogContentZ(depth), ...style }}
          {...props}
        >
          {children}
          {showCloseButton && (
            // The dialog's close (D45): a 24px ghost square on the title's line.
            // DIALOG_CLOSE puts `absolute` after the button classes, so the
            // button's own `relative` cannot override it.
            <SheetPrimitive.Close className={DIALOG_CLOSE} style={DIALOG_CLOSE_STYLE}>
              <Close className="size-4" />
              <span className="sr-only">{strings.close}</span>
            </SheetPrimitive.Close>
          )}
        </DialogPopup>
      </SheetPortal>
    );
  },
);
SheetContent.displayName = 'SheetContent';

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(DIALOG_HEADER, 'shrink-0', className)}
    {...props}
  />
);
SheetHeader.displayName = 'SheetHeader';

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      DIALOG_FOOTER,
      'shrink-0',
      className,
    )}
    {...props}
  />
);
SheetFooter.displayName = 'SheetFooter';

const SheetBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex min-h-0 w-full flex-1 flex-col items-start justify-start gap-4 overflow-y-auto',
      className,
    )}
    {...props}
  />
);
SheetBody.displayName = 'SheetBody';

const SheetTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<'h2'> & { asChild?: boolean }
>(({ className, asChild, children, ...props }, ref) => (
  <SheetPrimitive.Title
    {...asChildRender(asChild, children)}
    ref={ref}
    className={cn(DIALOG_TITLE, className)}
    {...props}
  />
));
SheetTitle.displayName = 'SheetTitle';

const SheetDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<'p'> & { asChild?: boolean }
>(({ className, asChild, children, ...props }, ref) => (
  <SheetPrimitive.Description
    {...asChildRender(asChild, children)}
    ref={ref}
    className={cn(DIALOG_DESCRIPTION, className)}
    {...props}
  />
));
SheetDescription.displayName = 'SheetDescription';

export {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
