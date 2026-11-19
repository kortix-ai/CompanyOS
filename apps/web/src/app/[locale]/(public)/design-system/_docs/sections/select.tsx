'use client';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@kortix/ui/select';

import { DocPage, DocSection, Example } from '../doc';
import { useControlSizes } from '../control-sizes';

const SIZES = ['sm', 'md', 'lg', 'xl'] as const;
const SIZE_LABEL = { sm: 'Small', md: 'Medium', lg: 'Large', xl: 'Extra Large' } as const;

const FRAMEWORKS = ['React', 'Vue', 'Svelte', 'Solid'];

const PLANS = [
  ['hobby', 'Hobby', 'For personal projects.'],
  ['pro', 'Pro', 'For professionals.'],
  ['team', 'Team', 'For small teams.'],
  ['business', 'Business', 'For growing companies.'],
  ['enterprise', 'Enterprise', 'For larger organizations.'],
] as const;

function FrameworkSelect({
  size,
  disabled,
  invalid,
  label = 'Framework',
}: {
  size?: (typeof SIZES)[number];
  disabled?: boolean;
  invalid?: boolean;
  label?: string;
}) {
  return (
    <Select defaultValue="react" disabled={disabled}>
      <SelectTrigger size={size} aria-label={label} aria-invalid={invalid || undefined} className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {FRAMEWORKS.map((f) => (
          <SelectItem key={f} value={f.toLowerCase()}>
            {f}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function SelectPage() {
  return (
    <DocPage
      title="Select"
      lead="Pick one value from a short, known list. md is the default; the trigger is exactly as tall as a Button of the same size and shares its corner. The list opens from the trigger: 0.97 to 1 and a fade in 200ms."
    >
      <DocSection title="Default">
        <Example
          code={`<Select defaultValue="react">
  <SelectTrigger aria-label="Framework" className="w-48">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="react">React</SelectItem>
    <SelectItem value="vue">Vue</SelectItem>
    <SelectItem value="svelte">Svelte</SelectItem>
    <SelectItem value="solid">Solid</SelectItem>
  </SelectContent>
</Select>`}
        >
          <FrameworkSelect />
        </Example>
      </DocSection>

      <DocSection title="Sizes">
        <Example
          previewClassName="flex-col items-start gap-3"
          code={SIZES.map((s) => `<SelectTrigger size="${s}">…</SelectTrigger>`).join('\n')}
        >
          {SIZES.map((s) => (
            <div key={s} className="flex items-center gap-4">
              <span className="text-muted-foreground w-24 text-xs">{SIZE_LABEL[s]}</span>
              <FrameworkSelect size={s} label={SIZE_LABEL[s]} />
            </div>
          ))}
        </Example>
        <SelectSpec />
      </DocSection>

      <DocSection title="Grouped">
        <Example
          code={`<SelectContent>
  <SelectGroup>
    <SelectLabel>Frontend</SelectLabel>
    <SelectItem value="react">React</SelectItem>
    <SelectItem value="vue">Vue</SelectItem>
  </SelectGroup>
  <SelectSeparator />
  <SelectGroup>
    <SelectLabel>Backend</SelectLabel>
    <SelectItem value="hono">Hono</SelectItem>
    <SelectItem value="express">Express</SelectItem>
  </SelectGroup>
</SelectContent>`}
        >
          <Select defaultValue="react">
            <SelectTrigger aria-label="Framework" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Frontend</SelectLabel>
                <SelectItem value="react">React</SelectItem>
                <SelectItem value="vue">Vue</SelectItem>
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Backend</SelectLabel>
                <SelectItem value="hono">Hono</SelectItem>
                <SelectItem value="express">Express</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Example>
      </DocSection>

      <DocSection title="States">
        <Example
          code={`<SelectTrigger>…</SelectTrigger>
<Select disabled>…</Select>
<SelectTrigger aria-invalid>…</SelectTrigger>`}
        >
          <FrameworkSelect label="Default" />
          <FrameworkSelect label="Disabled" disabled />
          <FrameworkSelect label="Invalid" invalid />
        </Example>
      </DocSection>

      <DocSection title="Inline" description="The transparent trigger sits in a sentence or a toolbar without a field box.">
        <Example code={`<SelectTrigger variant="transparent" size="sm">…</SelectTrigger>`}>
          <span className="text-muted-foreground flex items-center gap-1 text-sm">
            Build with
            <Select defaultValue="react">
              <SelectTrigger variant="transparent" size="sm" aria-label="Framework">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FRAMEWORKS.map((f) => (
                  <SelectItem key={f} value={f.toLowerCase()}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </span>
        </Example>
      </DocSection>

      <DocSection
        title="With description"
        description="A described row puts the check in its own column on the left and the label over a muted description. The trigger shows the label only."
      >
        <Example
          code={`<SelectContent className="w-72">
  <SelectItem value="hobby" description="For personal projects.">Hobby</SelectItem>
  <SelectItem value="pro" description="For professionals.">Pro</SelectItem>
  <SelectItem value="team" description="For small teams.">Team</SelectItem>
  <SelectItem value="business" description="For growing companies.">Business</SelectItem>
  <SelectItem value="enterprise" description="For larger organizations.">Enterprise</SelectItem>
</SelectContent>`}
        >
          <Select defaultValue="pro">
            <SelectTrigger size="lg" aria-label="Plan" className="w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="w-72">
              {PLANS.map(([value, label, description]) => (
                <SelectItem key={value} value={value} description={description}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Example>
      </DocSection>
    </DocPage>
  );
}

function SelectSpec() {
  const all = useControlSizes();
  const sizes = all.filter((s) => (SIZES as readonly string[]).includes(s.size));
  // Trigger radius: the control radius of the size (D44).
  const radiusOf: Record<string, string> = { sm: 'sm', md: 'md', lg: 'lg', xl: 'xl' };
  const r = (name: string) => all.find((s) => s.size === name)?.radius ?? 0;
  return (
    <div tabIndex={0} role="region" aria-label="Select sizes" className="border-border overflow-x-auto rounded-md border">
      <table className="w-full text-left text-sm">
        <thead className="text-muted-foreground text-xs">
          <tr className="border-border border-b">
            {['Size', 'Height', 'Start', 'End (caret)', 'Radius', 'Caret'].map((h) => (
              <th key={h} className="px-3 py-2 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono text-xs tabular-nums">
          {sizes.map((s) => (
            <tr key={s.size} className="border-border border-b last:border-b-0">
              <td className="px-3 py-2 font-sans text-sm font-medium">
                {s.size}
                {s.size === 'md' && <span className="text-muted-foreground ms-1.5 text-xs font-normal">default</span>}
              </td>
              <td className="px-3 py-2">{s.height}px</td>
              <td className="px-3 py-2">{s.selectPs}px</td>
              <td className="px-3 py-2">{s.selectPe}px</td>
              <td className="px-3 py-2">{r(radiusOf[s.size] ?? 'md')}px</td>
              <td className="px-3 py-2">{s.icon}px</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
