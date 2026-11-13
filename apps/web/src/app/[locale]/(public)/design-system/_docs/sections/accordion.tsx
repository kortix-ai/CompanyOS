'use client';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@kortix/ui/accordion';

import { DocPage, DocSection, Example } from '../doc';

const FAQ = [
  ['sandbox', 'What runs in a sandbox?', 'Every session gets its own cloud machine with your repository, your secrets and the tools the agent needs.'],
  ['billing', 'How are credits counted?', 'Model calls and sandbox time draw from the project balance. The usage page lists every charge.'],
  ['access', 'Who can open a session?', 'Members of the project. An admin can share one session with a link.'],
] as const;

const faqItems = FAQ.map(
  ([value, q, a]) => `  <AccordionItem value="${value}">
    <AccordionTrigger>${q}</AccordionTrigger>
    <AccordionContent className="text-muted-foreground">
      ${a}
    </AccordionContent>
  </AccordionItem>`,
).join('\n');

export default function AccordionPage() {
  return (
    <DocPage
      title="Accordion"
      lead="A stack of titled sections where each body opens in place. Rows divide with a 1px rule; the caret turns 180° and the body slides open at the moderate duration."
    >
      <DocSection
        title="Single"
        description='type="single" opens one item at a time. Add collapsible so the open item can close again.'
      >
        <Example
          previewClassName="block"
          code={`<Accordion type="single" collapsible defaultValue="sandbox" className="w-full">
${faqItems}
</Accordion>`}
        >
          <Accordion type="single" collapsible defaultValue="sandbox" className="w-full">
            {FAQ.map(([value, q, a]) => (
              <AccordionItem key={value} value={value}>
                <AccordionTrigger>{q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Example>
      </DocSection>

      <DocSection title="Multiple" description='type="multiple" lets any number of items stay open. The value is an array.'>
        <Example
          previewClassName="block"
          code={`<Accordion type="multiple" defaultValue={['sandbox', 'billing']} className="w-full">
${faqItems}
</Accordion>`}
        >
          <Accordion type="multiple" defaultValue={['sandbox', 'billing']} className="w-full">
            {FAQ.map(([value, q, a]) => (
              <AccordionItem key={value} value={value}>
                <AccordionTrigger>{q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Example>
      </DocSection>

      <DocSection title="Disabled item" description="disabled on an AccordionItem keeps it closed and fades its trigger.">
        <Example
          previewClassName="block"
          code={`<Accordion type="single" collapsible className="w-full">
  <AccordionItem value="general">
    <AccordionTrigger>General</AccordionTrigger>
    <AccordionContent className="text-muted-foreground">Name, icon and description.</AccordionContent>
  </AccordionItem>
  <AccordionItem value="sso" disabled>
    <AccordionTrigger>Single sign-on</AccordionTrigger>
    <AccordionContent>Available on the Enterprise plan.</AccordionContent>
  </AccordionItem>
</Accordion>`}
        >
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="general">
              <AccordionTrigger>General</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">Name, icon and description.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="sso" disabled>
              <AccordionTrigger>Single sign-on</AccordionTrigger>
              <AccordionContent>Available on the Enterprise plan.</AccordionContent>
            </AccordionItem>
          </Accordion>
        </Example>
      </DocSection>
    </DocPage>
  );
}
