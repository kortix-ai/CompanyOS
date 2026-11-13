'use client';

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@kortix/ui/breadcrumb';
import { CaretRightIcon } from '@phosphor-icons/react';

import { DocPage, DocSection, Example } from '../doc';

export default function BreadcrumbPage_() {
  return (
    <DocPage
      title="Breadcrumb"
      lead="The path to the current page. Parents are muted links that turn foreground on hover; the current page is foreground and not a link. Use it to name the parent in one line."
    >
      <DocSection title="Default">
        <Example
          code={`<Breadcrumb>
  <BreadcrumbList>
    <BreadcrumbItem>
      <BreadcrumbLink href="#breadcrumb">Projects</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbLink href="#breadcrumb">Website</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbPage>Settings</BreadcrumbPage>
    </BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>`}
        >
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="#breadcrumb">Projects</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="#breadcrumb">Website</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Settings</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </Example>
      </DocSection>

      <DocSection title="Custom separator" description="Pass any glyph as the BreadcrumbSeparator's child.">
        <Example
          code={`<Breadcrumb>
  <BreadcrumbList>
    <BreadcrumbItem>
      <BreadcrumbLink href="#breadcrumb">Files</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator>
      <CaretRightIcon />
    </BreadcrumbSeparator>
    <BreadcrumbItem>
      <BreadcrumbLink href="#breadcrumb">src</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator>
      <CaretRightIcon />
    </BreadcrumbSeparator>
    <BreadcrumbItem>
      <BreadcrumbPage>index.ts</BreadcrumbPage>
    </BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>`}
        >
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="#breadcrumb">Files</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator>
                <CaretRightIcon />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbLink href="#breadcrumb">src</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator>
                <CaretRightIcon />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbPage>index.ts</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </Example>
      </DocSection>

      <DocSection
        title="Collapsed"
        description="A deep path keeps the root and the last two levels. BreadcrumbEllipsis stands in for the middle."
      >
        <Example
          code={`<Breadcrumb>
  <BreadcrumbList>
    <BreadcrumbItem>
      <BreadcrumbLink href="#breadcrumb">Workspace</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbEllipsis />
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbLink href="#breadcrumb">Sessions</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbPage>Fix the login redirect</BreadcrumbPage>
    </BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>`}
        >
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="#breadcrumb">Workspace</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbEllipsis />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="#breadcrumb">Sessions</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Fix the login redirect</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </Example>
      </DocSection>
    </DocPage>
  );
}
