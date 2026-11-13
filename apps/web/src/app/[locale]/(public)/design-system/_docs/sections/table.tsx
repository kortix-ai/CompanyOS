'use client';

import { Checkbox } from '@kortix/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@kortix/ui/table';
import { useState } from 'react';

import { DocPage, DocSection, Example } from '../doc';

const INVOICES = [
  ['INV-001', 'Paid', 'Card', '$250.00'],
  ['INV-002', 'Pending', 'Transfer', '$150.00'],
  ['INV-003', 'Paid', 'Card', '$350.00'],
] as const;

const MEMBERS = [
  ['ada', 'Ada Lovelace', 'Admin'],
  ['alan', 'Alan Turing', 'Member'],
  ['grace', 'Grace Hopper', 'Member'],
] as const;

export default function TablePage() {
  const [selected, setSelected] = useState<string[]>(['alan']);
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));

  return (
    <DocPage
      title="Table"
      lead="Rows of records with the same columns. The table sits in flow: a 1px border, the md radius and no shadow. The header is a muted band; a row tints on hover and when selected."
    >
      <DocSection
        title="Default"
        description="Right-align numbers and set them in tabular figures, so the digits line up."
      >
        <Example
          previewClassName="block"
          code={`<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Invoice</TableHead>
      <TableHead>Status</TableHead>
      <TableHead>Method</TableHead>
      <TableHead className="text-right">Amount</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
${INVOICES.map(
  ([id, status, method, amount]) => `    <TableRow>
      <TableCell className="font-medium">${id}</TableCell>
      <TableCell>${status}</TableCell>
      <TableCell>${method}</TableCell>
      <TableCell className="text-right tabular-nums">${amount}</TableCell>
    </TableRow>`,
).join('\n')}
  </TableBody>
  <TableFooter>
    <TableRow>
      <TableCell colSpan={3}>Total</TableCell>
      <TableCell className="text-right tabular-nums">$750.00</TableCell>
    </TableRow>
  </TableFooter>
</Table>`}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {INVOICES.map(([id, status, method, amount]) => (
                <TableRow key={id}>
                  <TableCell className="font-medium">{id}</TableCell>
                  <TableCell>{status}</TableCell>
                  <TableCell>{method}</TableCell>
                  <TableCell className="text-right tabular-nums">{amount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>Total</TableCell>
                <TableCell className="text-right tabular-nums">$750.00</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </Example>
      </DocSection>

      <DocSection
        title="Selectable rows"
        description='A Checkbox in the first cell selects the row. Set data-state="selected" on the row so it keeps the tint.'
      >
        <Example
          previewClassName="block"
          code={`const [selected, setSelected] = useState<string[]>(['alan']);
const toggle = (id: string, on: boolean) =>
  setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));

<Table>
  <TableHeader>
    <TableRow>
      <TableHead className="w-10">
        <Checkbox
          aria-label="Select all"
          checked={selected.length === MEMBERS.length ? true : selected.length ? 'indeterminate' : false}
          onCheckedChange={(on) => setSelected(on ? MEMBERS.map(([id]) => id) : [])}
        />
      </TableHead>
      <TableHead>Name</TableHead>
      <TableHead>Role</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {MEMBERS.map(([id, name, role]) => (
      <TableRow key={id} data-state={selected.includes(id) ? 'selected' : undefined}>
        <TableCell>
          <Checkbox
            aria-label={\`Select \${name}\`}
            checked={selected.includes(id)}
            onCheckedChange={(on) => toggle(id, on === true)}
          />
        </TableCell>
        <TableCell className="font-medium">{name}</TableCell>
        <TableCell className="text-muted-foreground">{role}</TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>`}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Select all"
                    checked={selected.length === MEMBERS.length ? true : selected.length ? 'indeterminate' : false}
                    onCheckedChange={(on) => setSelected(on ? MEMBERS.map(([id]) => id) : [])}
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MEMBERS.map(([id, name, role]) => (
                <TableRow key={id} data-state={selected.includes(id) ? 'selected' : undefined}>
                  <TableCell>
                    <Checkbox
                      aria-label={`Select ${name}`}
                      checked={selected.includes(id)}
                      onCheckedChange={(on) => toggle(id, on === true)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{name}</TableCell>
                  <TableCell className="text-muted-foreground">{role}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Example>
      </DocSection>
    </DocPage>
  );
}
