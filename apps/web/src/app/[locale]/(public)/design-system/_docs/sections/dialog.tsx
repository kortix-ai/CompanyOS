'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@kortix/ui/alert-dialog';
import { Button } from '@kortix/ui/button';
import { ConfirmDialog } from '@kortix/ui/confirm-dialog';
import { Input } from '@kortix/ui/input';
import { Label } from '@kortix/ui/label';
import {
  Modal,
  ModalBody,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
} from '@kortix/ui/modal';
import { useState } from 'react';

import { DocPage, DocSection, Example } from '../doc';

export default function DialogPage() {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <DocPage
      title="Dialog"
      lead="A dialog takes the whole screen's attention for one task. Write Modal in product code: it looks exactly like Dialog, a centered card at every width, and adds a scrolling body. Dialog is the primitive Modal builds on. Confirm a destructive action with ConfirmDialog."
    >
      <DocSection
        title="Modal"
        description="Header, body and footer are separate slots with their own padding. The close button is built in; Escape and an outside click also close it."
      >
        <Example
          code={`<Modal>
  <ModalTrigger asChild>
    <Button variant="outline">Add secret</Button>
  </ModalTrigger>
  <ModalContent>
    <ModalHeader>
      <ModalTitle>Add secret</ModalTitle>
      <ModalDescription>Sessions in this project read it as an environment variable.</ModalDescription>
    </ModalHeader>
    <ModalBody className="flex flex-col gap-1.5">
      <Label htmlFor="secret-name">Name</Label>
      <Input id="secret-name" placeholder="OPENAI_API_KEY" />
    </ModalBody>
    <ModalFooter>
      <ModalClose asChild>
        <Button variant="secondary">Cancel</Button>
      </ModalClose>
      <Button>Add secret</Button>
    </ModalFooter>
  </ModalContent>
</Modal>`}
        >
          <Modal>
            <ModalTrigger asChild>
              <Button variant="outline">Add secret</Button>
            </ModalTrigger>
            <ModalContent>
              <ModalHeader>
                <ModalTitle>Add secret</ModalTitle>
                <ModalDescription>Sessions in this project read it as an environment variable.</ModalDescription>
              </ModalHeader>
              <ModalBody className="flex flex-col gap-1.5">
                <Label htmlFor="secret-name">Name</Label>
                <Input id="secret-name" placeholder="OPENAI_API_KEY" />
              </ModalBody>
              <ModalFooter>
                <ModalClose asChild>
                  <Button variant="secondary">Cancel</Button>
                </ModalClose>
                <Button>Add secret</Button>
              </ModalFooter>
            </ModalContent>
          </Modal>
        </Example>
      </DocSection>

      <DocSection
        title="Confirm"
        description="ConfirmDialog is the controlled confirm for product code: a title, one sentence, and two buttons. confirmVariant='destructive' colors the confirm button; isPending holds it while the action runs."
      >
        <Example
          code={`const [open, setOpen] = useState(false);

<Button variant="outline" onClick={() => setOpen(true)}>Delete project</Button>
<ConfirmDialog
  open={open}
  onOpenChange={setOpen}
  title="Delete this project?"
  description="Its sessions, files and secrets are deleted. This cannot be undone."
  confirmLabel="Delete"
  confirmVariant="destructive"
  onConfirm={() => setOpen(false)}
/>`}
        >
          <Button variant="outline" onClick={() => setConfirmOpen(true)}>
            Delete project
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Delete this project?"
            description="Its sessions, files and secrets are deleted. This cannot be undone."
            confirmLabel="Delete"
            confirmVariant="destructive"
            onConfirm={() => setConfirmOpen(false)}
          />
        </Example>
      </DocSection>

      <DocSection
        title="Alert Dialog"
        description="The primitive under ConfirmDialog. An outside click does not close it: the user must choose. Action and Cancel both close it."
      >
        <Example
          code={`<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="outline">Revoke key</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Revoke this key?</AlertDialogTitle>
      <AlertDialogDescription>
        Scripts that use it stop working at once.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction variant="danger">Revoke</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>`}
        >
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">Revoke key</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Revoke this key?</AlertDialogTitle>
                <AlertDialogDescription>Scripts that use it stop working at once.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="danger">Revoke</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Example>
      </DocSection>
    </DocPage>
  );
}
