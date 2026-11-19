'use client';

import { Button } from '@kortix/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@kortix/ui/drawer';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@kortix/ui/sheet';

import { DocPage, DocSection, Example } from '../doc';

const SIDES = ['right', 'left', 'top', 'bottom'] as const;
const DIRECTIONS = ['bottom', 'right'] as const;

export default function SheetPage() {
  return (
    <DocPage
      title="Sheet"
      lead="A panel that slides in from an edge over a dimmed page, for secondary content beside the task: details, settings, a log. Sheet is a dialog with a close button; Drawer adds swipe to dismiss for touch."
    >
      <DocSection
        title="Sides"
        description="right is the default and floats with an 11px inset from 768px up. left is full height. top and bottom span the width. SheetBody fills the height between header and footer and scrolls."
      >
        <Example
          code={SIDES.map(
            (side) => `<Sheet>
  <SheetTrigger asChild>
    <Button variant="outline">${side}</Button>
  </SheetTrigger>
  <SheetContent side="${side}">
    <SheetHeader>
      <SheetTitle>Session details</SheetTitle>
      <SheetDescription>Model, sandbox and usage for this session.</SheetDescription>
    </SheetHeader>
    <SheetBody>
      <p className="text-muted-foreground text-sm">The body scrolls when it is taller than the sheet.</p>
    </SheetBody>
  </SheetContent>
</Sheet>`,
          ).join('\n')}
        >
          {SIDES.map((side) => (
            <Sheet key={side}>
              <SheetTrigger asChild>
                <Button variant="outline">{side}</Button>
              </SheetTrigger>
              <SheetContent side={side}>
                <SheetHeader>
                  <SheetTitle>Session details</SheetTitle>
                  <SheetDescription>Model, sandbox and usage for this session.</SheetDescription>
                </SheetHeader>
                <SheetBody>
                  <p className="text-muted-foreground text-sm">The body scrolls when it is taller than the sheet.</p>
                </SheetBody>
              </SheetContent>
            </Sheet>
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="Drawer"
        description="direction is the edge it slides in from, in 200ms ease-out. A swipe back toward that edge dismisses it. A bottom drawer shows a grab bar; bar={false} hides it."
      >
        <Example
          code={DIRECTIONS.map(
            (direction) => `<Drawer direction="${direction}">
  <DrawerTrigger asChild>
    <Button variant="outline">${direction}</Button>
  </DrawerTrigger>
  <DrawerContent>
    <DrawerHeader>
      <DrawerTitle>Share session</DrawerTitle>
      <DrawerDescription>Anyone in the project can open the link.</DrawerDescription>
    </DrawerHeader>
    <DrawerFooter>
      <Button>Copy link</Button>
      <DrawerClose asChild>
        <Button variant="secondary">Cancel</Button>
      </DrawerClose>
    </DrawerFooter>
  </DrawerContent>
</Drawer>`,
          ).join('\n')}
        >
          {DIRECTIONS.map((direction) => (
            <Drawer key={direction} direction={direction}>
              <DrawerTrigger asChild>
                <Button variant="outline">{direction}</Button>
              </DrawerTrigger>
              <DrawerContent>
                <DrawerHeader>
                  <DrawerTitle>Share session</DrawerTitle>
                  <DrawerDescription>Anyone in the project can open the link.</DrawerDescription>
                </DrawerHeader>
                <DrawerFooter>
                  <Button>Copy link</Button>
                  <DrawerClose asChild>
                    <Button variant="secondary">Cancel</Button>
                  </DrawerClose>
                </DrawerFooter>
              </DrawerContent>
            </Drawer>
          ))}
        </Example>
      </DocSection>
    </DocPage>
  );
}
