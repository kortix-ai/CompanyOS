'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kortix/ui/tabs';

import { DocPage, DocSection, Example } from '../doc';
import { useControlSizes } from '../control-sizes';

const SIZES = ['sm', 'md', 'lg', 'xl', '2xl'] as const;
const SIZE_LABEL = { sm: 'Small', md: 'Medium', lg: 'Large', xl: 'Extra Large', '2xl': '2X Large' } as const;

const DEFAULT_CODE = `<Tabs defaultValue="overview">
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="settings">Settings</TabsTrigger>
    <TabsTrigger value="activity">Activity</TabsTrigger>
  </TabsList>
  <TabsContent value="overview">Overview</TabsContent>
  <TabsContent value="settings">Settings</TabsContent>
  <TabsContent value="activity">Activity</TabsContent>
</Tabs>`;

function Demo({ type, size }: { type?: 'underline'; size?: (typeof SIZES)[number] }) {
  return (
    <Tabs defaultValue="overview" className="gap-4">
      <TabsList type={type} size={size} animate="fluid">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      {!size && (
        <>
          <TabsContent value="overview" className="text-muted-foreground text-sm">
            Overview
          </TabsContent>
          <TabsContent value="settings" className="text-muted-foreground text-sm">
            Settings
          </TabsContent>
          <TabsContent value="activity" className="text-muted-foreground text-sm">
            Activity
          </TabsContent>
        </>
      )}
    </Tabs>
  );
}

export default function TabsPage() {
  return (
    <DocPage
      title="Tabs"
      lead="Two looks, one component. The default is a track with a raised chip that slides to the active tab; underline is a 2px bar under the active label, which slides when animate is fluid. Both switch in 200ms ease-out, and both take every control size."
    >
      <DocSection title="Default">
        <Example previewClassName="items-start" code={DEFAULT_CODE}>
          <Demo />
        </Example>
      </DocSection>

      <DocSection title="Underline" description="For page-level navigation inside a pane. The bar is as wide as the label.">
        <Example previewClassName="items-start" code={DEFAULT_CODE.replace('<TabsList>', '<TabsList type="underline" animate="fluid">')}>
          <Demo type="underline" />
        </Example>
      </DocSection>

      <DocSection title="Sizes" description="md is the default. The trigger height, padding and radius follow the control ladder.">
        <Example
          previewClassName="flex-col items-stretch gap-0 p-0"
          code={SIZES.map(
            (s) => `<TabsList size="${s}">…</TabsList>\n<TabsList type="underline" size="${s}" animate="fluid">…</TabsList>`,
          ).join('\n\n')}
        >
          {SIZES.map((s) => (
            <div key={s} className="border-border flex flex-col items-start gap-3 border-b px-4 py-4 last:border-b-0 xl:grid xl:grid-cols-[6rem_1fr_1fr] xl:items-center xl:gap-4">
              <span className="text-muted-foreground text-xs">{SIZE_LABEL[s]}</span>
              <Demo size={s} />
              <Demo type="underline" size={s} />
            </div>
          ))}
        </Example>
        <TabsSpec />
      </DocSection>
    </DocPage>
  );
}

function TabsSpec() {
  const all = useControlSizes();
  const sizes = all.filter((s) => (SIZES as readonly string[]).includes(s.size));
  return (
    <div tabIndex={0} role="region" aria-label="Tab sizes" className="border-border overflow-x-auto rounded-md border">
      <table className="w-full text-left text-sm">
        <thead className="text-muted-foreground text-xs">
          <tr className="border-border border-b">
            {['Size', 'Height', 'Tab padding', 'Radius', 'Underline gap', 'Text'].map((h) => (
              <th key={h} className="px-3 py-2 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono text-xs tabular-nums">
          {sizes.map((s) => (
            <tr key={s.size} className="border-border border-b last:border-b-0">
              <td className="px-3 py-2 font-sans text-sm font-medium">{s.size}</td>
              <td className="px-3 py-2">{s.height}px</td>
              <td className="px-3 py-2">{s.tabPadding}px</td>
              <td className="px-3 py-2">{s.radius}px</td>
              <td className="px-3 py-2">{s.tabGap}px</td>
              <td className="px-3 py-2">{s.size === 'xl' || s.size === '2xl' ? '14px' : '13px'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
