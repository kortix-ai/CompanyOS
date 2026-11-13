'use client';

import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog';
import { Close } from '../icons/close';
import { useUiStrings } from '../providers/ui-provider';
import {
  DIALOG_ACTION_SIZE,
  DIALOG_CLOSE,
  DIALOG_CLOSE_STYLE,
  DIALOG_DESCRIPTION,
  DIALOG_FOOTER,
  DIALOG_FOOTER_ACTIONS,
  DIALOG_OVERLAY,
  DIALOG_HEADER,
  DIALOG_PADDING,
  DIALOG_RADIUS,
  DIALOG_TITLE,
} from './dialog-recipe';
import * as React from 'react';

import {
  asChildRender,
  composeRefs,
  DismissProvider,
  focusProps,
  openState,
  stateRender,
  useDismissContent,
  useDismissRoot,
  useNativeButton,
  type DismissHandlers,
} from '../lib/base-ui-compat';
import { usePortalContainer } from '../lib/portal-container';
import { cn } from '../lib/utils';
import {
  dialogContentZ,
  DialogDepthProvider,
  dialogOverlayZ,
  useDialogDepth,
  useDialogRootLayer,
} from '../lib/z-stack';
import { ButtonProps, buttonVariants } from './button';

type ButtonLikeProps = Omit<React.ComponentProps<'button'>, 'size'> & { asChild?: boolean };

export interface AlertDialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

// Depth follows the runtime layer stack, so an alert stacks above whatever is
// open even when it is rendered as a sibling. Still prefer rendering an alert
// that confirms for a dialog INSIDE that dialog's React tree: React events from
// the alert then bubble through the dialog, so the dialog's own outside-click
// and focus handlers never see the alert as "outside".
function AlertDialog({ children, open, defaultOpen, onOpenChange }: AlertDialogProps) {
  const layer = useDialogRootLayer({ open, defaultOpen, onOpenChange });
  const dismiss = useDismissRoot(layer.onOpenChange);
  return (
    <DialogDepthProvider depth={layer.depth}>
      <DismissProvider kind="dialog" registry={dismiss.registry}>
        <AlertDialogPrimitive.Root open={layer.open} onOpenChange={dismiss.onOpenChange}>
          {children}
        </AlertDialogPrimitive.Root>
      </DismissProvider>
    </DialogDepthProvider>
  );
}

function AlertDialogTrigger({ asChild, children, ...props }: ButtonLikeProps) {
  const slot = asChildRender(asChild, children);
  const native = useNativeButton(asChild, children);
  return (
    <AlertDialogPrimitive.Trigger
      data-slot="alert-dialog-trigger"
      {...props}
      ref={composeRefs((props as { ref?: React.Ref<HTMLButtonElement> }).ref, native.ref)}
      render={stateRender('button', openState, slot.render)}
      nativeButton={native.nativeButton}
    >
      {slot.children}
    </AlertDialogPrimitive.Trigger>
  );
}

function AlertDialogPortal({
  container,
  forceMount,
  children,
}: {
  container?: HTMLElement | null;
  forceMount?: true;
  children?: React.ReactNode;
}) {
  const scoped = usePortalContainer();
  return (
    <AlertDialogPrimitive.Portal
      data-slot="alert-dialog-portal"
      container={container ?? scoped}
      keepMounted={forceMount}
    >
      {children}
    </AlertDialogPrimitive.Portal>
  );
}

function AlertDialogOverlay({ className, style, ...props }: React.ComponentProps<'div'>) {
  const depth = useDialogDepth();
  return (
    <AlertDialogPrimitive.Backdrop
      data-slot="alert-dialog-overlay"
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 ',
        DIALOG_OVERLAY,
        className,
      )}
      style={{ zIndex: dialogOverlayZ(depth), ...style }}
      render={stateRender('div', openState)}
      {...props}
    />
  );
}

type AlertDialogContentProps = React.ComponentProps<'div'> &
  Omit<DismissHandlers, 'onPointerDownOutside' | 'onInteractOutside' | 'onFocusOutside'> & {
    asChild?: boolean;
    forceMount?: true;
    overlayClassName?: string;
    onOpenAutoFocus?: (event: Event) => void;
    onCloseAutoFocus?: (event: Event) => void;
    /** The ghost × in the top-end corner, the same as Dialog and Modal (D45). Default true. */
    showCloseButton?: boolean;
  };

function AlertDialogContent({
  className,
  style,
  overlayClassName,
  asChild,
  forceMount,
  children,
  onEscapeKeyDown,
  onOpenAutoFocus,
  onCloseAutoFocus,
  showCloseButton = true,
  ...props
}: AlertDialogContentProps) {
  const strings = useUiStrings();
  const depth = useDialogDepth();
  useDismissContent('dialog', { onEscapeKeyDown });
  const popupRef = React.useRef<HTMLDivElement | null>(null);
  const slot = asChildRender(asChild, children);
  return (
    <AlertDialogPortal forceMount={forceMount}>
      <AlertDialogOverlay className={overlayClassName} />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-content"
        className={cn(
          'bg-popover data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-moderate fixed top-[50%] left-[50%] grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] shadow-ring-lg outline-none sm:max-w-md',
          DIALOG_PADDING,
          DIALOG_RADIUS,
          className,
        )}
        style={{ zIndex: dialogContentZ(depth), ...style }}
        ref={popupRef}
        {...focusProps(() => popupRef.current, onOpenAutoFocus, onCloseAutoFocus, { dialog: true })}
        {...props}
        render={stateRender('div', openState, slot.render)}
      >
        {slot.children}
        {showCloseButton && (
          <AlertDialogPrimitive.Close className={DIALOG_CLOSE} style={DIALOG_CLOSE_STYLE}>
            <Close className="size-4" />
            <span className="sr-only">{strings.close}</span>
          </AlertDialogPrimitive.Close>
        )}
      </AlertDialogPrimitive.Popup>
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(DIALOG_HEADER, className)}
      {...props}
    />
  );
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(DIALOG_FOOTER, DIALOG_FOOTER_ACTIONS, className)}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  asChild,
  children,
  ...props
}: React.ComponentProps<'h2'> & { asChild?: boolean }) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn(DIALOG_TITLE, className)}
      {...props}
      {...asChildRender(asChild, children)}
    />
  );
}

function AlertDialogDescription({
  className,
  asChild,
  children,
  ...props
}: React.ComponentProps<'p'> & { asChild?: boolean }) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn(DIALOG_DESCRIPTION, className)}
      {...props}
      {...asChildRender(asChild, children)}
    />
  );
}

/**
 * A button that closes the alert. As with Radix, an `onClick` that calls
 * `preventDefault()` keeps the alert open (an async confirm closes it itself).
 */
function AlertDialogClose({ asChild, children, onClick, ...props }: ButtonLikeProps) {
  const slot = asChildRender(asChild, children);
  const native = useNativeButton(asChild, children);
  return (
    <AlertDialogPrimitive.Close
      {...props}
      ref={composeRefs((props as { ref?: React.Ref<HTMLButtonElement> }).ref, native.ref)}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) {
          (event as { preventBaseUIHandler?: () => void }).preventBaseUIHandler?.();
        }
      }}
      render={slot.render}
      nativeButton={native.nativeButton}
    >
      {slot.children}
    </AlertDialogPrimitive.Close>
  );
}

function AlertDialogAction({
  className,
  variant,
  ...props
}: ButtonLikeProps & {
  variant?: ButtonProps['variant'];
}) {
  return (
    <AlertDialogClose
      className={cn(buttonVariants({ size: DIALOG_ACTION_SIZE, variant }), className)}
      {...props}
    />
  );
}

function AlertDialogCancel({ className, ...props }: ButtonLikeProps) {
  return (
    <AlertDialogClose
      className={cn(buttonVariants({ variant: 'secondary', size: DIALOG_ACTION_SIZE }), className)}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
