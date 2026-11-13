'use client';

/**
 * @example
 * ```tsx
 * import {
 *   Modal,
 *   ModalBody,
 *   ModalContent,
 *   ModalDescription,
 *   ModalFooter,
 *   ModalHeader,
 *   ModalTitle,
 *   ModalTrigger,
 * } from './modal';
 * import { Button } from './button';
 *
 * <Modal>
 *   <ModalTrigger asChild>
 *     <Button>Open</Button>
 *   </ModalTrigger>
 *   <ModalContent className="lg:max-w-md">
 *     <ModalHeader>
 *       <ModalTitle>Title</ModalTitle>
 *       <ModalDescription>Description</ModalDescription>
 *     </ModalHeader>
 *     <ModalBody>{children}</ModalBody>
 *     <ModalFooter>
 *       <Button variant="outline-ghost">Cancel</Button>
 *       <Button>Confirm</Button>
 *     </ModalFooter>
 *   </ModalContent>
 * </Modal>
 * ```
 *
 * Controlled:
 * ```tsx
 * <Modal open={open} onOpenChange={setOpen}>
 *   <ModalContent>...</ModalContent>
 * </Modal>
 * ```
 */

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { Close } from '../icons/close';
import {
  DIALOG_CLOSE_LOOK,
  DIALOG_CLOSE_POSITION,
  DIALOG_CLOSE_STYLE,
  DIALOG_DESCRIPTION,
  DIALOG_FOOTER,
  DIALOG_FOOTER_ACTIONS,
  DIALOG_HEADER,
  DIALOG_OVERLAY,
  DIALOG_TITLE,
} from './dialog-recipe';
import {
  asChildRender,
  openState,
  stateRender,
  type LegacyDismissEvent,
} from '../lib/base-ui-compat';
import { cn } from '../lib/utils';
import {
  dialogContentZ,
  dialogOverlayZ,
  hasOpenFloatingLayer,
  isFloatingLayerTarget,
  useDialogDepth,
} from '../lib/z-stack';
import {
  Dialog,
  DialogClose,
  DialogPopup,
  DialogPortal,
  DialogTrigger,
  type DialogContentBaseProps,
} from './dialog';

// Stacks by open order, not only by JSX nesting: a Modal opened while another
// is open sits above it even when the two share no React ancestor. `Dialog`
// owns that layer stack.
const Modal = Dialog;

const ModalTrigger = DialogTrigger;

const ModalClose = DialogClose;

const ModalPortal = DialogPortal;

const overlayAnimationClasses = {
  default:
    'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-moderate',
  none: '',
} as const;

const ModalOverlay = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'> & {
    animation?: keyof typeof overlayAnimationClasses;
  }
>(({ className, style, animation = 'default', ...props }, ref) => {
  const depth = useDialogDepth();

  return (
    <DialogPrimitive.Backdrop
      render={stateRender('div', openState)}
      className={cn(
        'fixed inset-0 ',
        DIALOG_OVERLAY,
        overlayAnimationClasses[animation],
        className,
      )}
      style={{ zIndex: dialogOverlayZ(depth), ...style }}
      {...props}
      ref={ref}
    />
  );
});
ModalOverlay.displayName = 'ModalOverlay';

/** Centered like Dialog at every width: the phone gets the same card, 1rem from each edge. */
const MODAL_CENTERED =
  'top-1/2 left-1/2 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 max-h-[calc(100dvh-2rem)] sm:max-w-lg';

const ModalVariants = cva(
  // The Dialog's look (D45), part for part: bg-popover, no border, the
  // shadow-ring-lg edge, 12px corners, the same fade + zoom. No gap and no
  // padding here: each part owns the space ABOVE it, so spacing never stacks.
  'fixed flex flex-col gap-0 border-0 p-0 shadow-ring-lg outline-none overflow-y-auto rounded-(--dialog-radius)',
  {
    variants: {
      variant: {
        default: 'bg-popover',
        // `base` is kept for its callers; it is the same surface now (D45).
        base: 'bg-popover',
        transparent: 'bg-transparent border-none p-0 shadow-none',
      },
      side: {
        // top/bottom/left/right are kept for their callers. A side panel is a
        // Sheet; a Modal is always the centered card.
        top: MODAL_CENTERED,
        bottom: MODAL_CENTERED,
        left: MODAL_CENTERED,
        right: MODAL_CENTERED,
        fullscreen: 'inset-0 rounded-none bg-black/60 dark:bg-black/85', // audit:allow full-screen media scrim: black in both themes, deeper in dark so the image keeps its edge
      },
      animation: {
        default:
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-moderate',
        none: '',
      },
    },
    defaultVariants: {
      side: 'bottom',
      variant: 'default',
      animation: 'default',
    },
  },
);

interface ModalContentProps extends DialogContentBaseProps, VariantProps<typeof ModalVariants> {
  closeClassName?: string;
  closeLabel?: string;
  modalClassName?: string;
  showCloseButton?: boolean;
  closeButtonChildren?: React.ReactNode;
  closeOnOutsideClick?: boolean;
  overlayClassName?: string;
}

/**
 * Should an "outside" interaction actually dismiss the modal?
 *
 * Two cases both look like backdrop clicks to the dialog and must NOT dismiss:
 *
 * 1. The click lands on a portaled Select / DropdownMenu / tooltip panel.
 *    Those portal to `document.body`, outside the modal's DOM subtree, so
 *    containment says "outside". `isFloatingLayerTarget` catches that.
 *
 * 2. A *modal* DropdownMenu is open and the click lands anywhere else —
 *    including visually on the modal body, or on the dark overlay. While the
 *    menu is open it sets `pointer-events: none` on everything under it, so
 *    the event target is `body` / the overlay, not the menu. Checking the
 *    target alone fails; Escape already uses `hasOpenFloatingLayer()` for the
 *    same reason. The gesture owns the floating layer: dismiss that first, and
 *    require a second click to close the modal.
 */
export function modalDismissesOnOutsideInteraction(
  target: EventTarget | null,
  closeOnOutsideClick: boolean,
): boolean {
  if (!closeOnOutsideClick) return false;
  if (hasOpenFloatingLayer()) return false;
  return !isFloatingLayerTarget(target);
}

const ModalContentInner = React.forwardRef<HTMLDivElement, ModalContentProps>(
  (
    {
      side = 'bottom',
      animation = 'default',
      className,
      modalClassName,
      closeClassName,
      closeLabel = 'Close',
      children,
      variant = 'default',
      showCloseButton = true,
      closeButtonChildren,
      closeOnOutsideClick = true,
      overlayClassName,
      style,
      ...props
    },
    ref,
  ) => {
    const depth = useDialogDepth();

    const handleInteractOutside = (event: LegacyDismissEvent) => {
      if (
        !modalDismissesOnOutsideInteraction(event.detail.originalEvent.target, closeOnOutsideClick)
      ) {
        event.preventDefault();
      }
    };

    // Same asymmetry for the keyboard: Escape aimed at an open select or menu must
    // dismiss that panel, not the modal underneath it.
    //
    // Deliberately NOT guarded on `hasOpenNestedDialog()`. The dialog runs this
    // handler on the top-most layer only, so a nested modal would see its own parent in
    // that count, prevent its own dismissal, and leave Escape dead. Callers that
    // need the nested-dialog guard pass their own `onEscapeKeyDown` — it lands in
    // `...props` below and replaces this one (see the legacy Customize panel).
    const handleEscapeKeyDown = (event: KeyboardEvent) => {
      if (hasOpenFloatingLayer()) {
        event.preventDefault();
      }
    };

    return (
      <DialogPopup
        ref={ref}
        className={cn(
          ModalVariants({ side, animation, className: modalClassName, variant }),
          className,
        )}
        style={{ zIndex: dialogContentZ(depth), ...style }}
        onInteractOutside={handleInteractOutside}
        onEscapeKeyDown={handleEscapeKeyDown}
        {...props}
      >
        {children}

        {/* The × and any extra controls beside it, on the title's line (D45). */}
        <div className={cn(DIALOG_CLOSE_POSITION, 'flex items-center justify-end gap-2')} style={DIALOG_CLOSE_STYLE}>
          {closeButtonChildren}
          {showCloseButton && (
            <ModalClose className={cn(DIALOG_CLOSE_LOOK, closeClassName)}>
              <Close className="size-4" />
              <span className="sr-only">{closeLabel}</span>
            </ModalClose>
          )}
        </div>
      </DialogPopup>
    );
  },
);
ModalContentInner.displayName = 'ModalContentInner';

const ModalContent = React.forwardRef<HTMLDivElement, ModalContentProps>(
  ({ animation = 'default', overlayClassName, forceMount, ...props }, ref) => {
  const resolvedAnimation = animation ?? 'default';

  return (
    <ModalPortal keepMounted={forceMount}>
      <ModalOverlay animation={resolvedAnimation} className={overlayClassName} />
      <ModalContentInner animation={resolvedAnimation} {...props} ref={ref} />
    </ModalPortal>
  );
});
ModalContent.displayName = 'ModalContent';

const ModalHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  // Spacing (D45): the header holds the panel's top padding; the body and the
  // footer each hold the 16px gap above them; only the footer holds the bottom
  // padding. Nothing else adds vertical space, so a gap can never double.
  // mt, not pt: the top space sits outside the header box (callers set their own mt).
  <div className={cn(DIALOG_HEADER, 'ps-(--dialog-padding) pe-12 mt-(--dialog-padding-top)', className)} {...props} />
);
ModalHeader.displayName = 'ModalHeader';

const ModalFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="modal-footer"
    className={cn(
      DIALOG_FOOTER,
      DIALOG_FOOTER_ACTIONS,
      'items-center px-(--dialog-padding) pt-(--dialog-gap) pb-(--dialog-padding)',

      className,
    )}
    {...props}
  />
);
ModalFooter.displayName = 'ModalFooter';

const ModalTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<'h2'> & { asChild?: boolean }
>(({ className, asChild, children, ...props }, ref) => (
  <DialogPrimitive.Title
    {...asChildRender(asChild, children)}
    ref={ref}
    className={cn(DIALOG_TITLE, className)}
    {...props}
  />
));
ModalTitle.displayName = 'ModalTitle';

const ModalDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<'p'> & { asChild?: boolean }
>(({ className, asChild, children, ...props }, ref) => (
  <DialogPrimitive.Description
    {...asChildRender(asChild, children)}
    ref={ref}
    className={cn(DIALOG_DESCRIPTION, className)}
    {...props}
  />
));
ModalDescription.displayName = 'ModalDescription';

const ModalBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="modal-body"
    className={cn(
      'flex-1 space-y-4 px-(--dialog-padding) pt-(--dialog-gap)',
      // A body with no footer after it is the modal's last part, so it holds the
      // bottom padding itself; otherwise the footer holds it (D45: spacing never
      // stacks, and never goes missing).
      'not-has-[~[data-slot=modal-footer]]:pb-(--dialog-padding)',
      className,
    )}
    {...props}
  />
);
ModalBody.displayName = 'ModalBody';

export {
  Modal,
  ModalBody,
  ModalClose,
  ModalContent,
  ModalContentInner,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  ModalPortal,
  ModalTitle,
  ModalTrigger,
};
