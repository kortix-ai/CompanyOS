'use client';

import { Alert, AlertActions, AlertContent, AlertDescription, AlertMedia, AlertTitle } from '@kortix/ui/alert';
import { Button } from '@kortix/ui/button';
import Loading from '@kortix/ui/loading';

import { DocPage, DocSection, Example } from '../doc';

const VARIANTS = [
  ['default', 'Sandbox is starting', 'Your first message runs once it is ready.'],
  ['success', 'GitHub connected', 'Sessions can now open pull requests.'],
  ['warning', 'Credits are low', 'About 2 hours of sessions remain this month.'],
  ['destructive', 'Sync failed', 'The repository could not be reached.'],
] as const;

export default function AlertPage() {
  return (
    <DocPage
      title="Alert"
      lead="An inline message in a view that did load. The tone is a 15% fill and a solid 16px glyph; the title and body stay in ink, because tone-colored text on a tone fill fails contrast. A page that failed to load shows ErrorState instead."
    >
      <DocSection title="Variants" description="default is blue for information. Each variant brings its own glyph.">
        <Example
          previewClassName="flex-col items-stretch gap-3"
          code={VARIANTS.map(
            ([v, title, body]) => `<Alert variant="${v}">
  <AlertTitle>${title}</AlertTitle>
  <AlertDescription>${body}</AlertDescription>
</Alert>`,
          ).join('\n')}
        >
          {VARIANTS.map(([v, title, body]) => (
            <Alert key={v} variant={v}>
              <AlertTitle>{title}</AlertTitle>
              <AlertDescription>{body}</AlertDescription>
            </Alert>
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="Description only"
        description="One sentence needs no title. A link in the description is underlined."
      >
        <Example
          previewClassName="flex-col items-stretch gap-3"
          code={`<Alert>
  <AlertDescription>
    Secrets are encrypted at rest. <a href="#">How it works</a>
  </AlertDescription>
</Alert>`}
        >
          <Alert>
            <AlertDescription>
              Secrets are encrypted at rest. <a href="#">How it works</a>
            </AlertDescription>
          </Alert>
        </Example>
      </DocSection>

      <DocSection
        title="With actions"
        description="AlertActions sits at the end of the row, centered on it. The main action is a default Button (solid, so it holds its contrast on any tint); a second action is ghost. Keep it to one or two small buttons."
      >
        <Example
          previewClassName="flex-col items-stretch gap-3"
          code={`<Alert variant="warning">
  <AlertContent>
    <AlertTitle>Credits are low</AlertTitle>
    <AlertDescription>About 2 hours of sessions remain this month.</AlertDescription>
  </AlertContent>
  <AlertActions>
    <Button size="sm">Add credits</Button>
  </AlertActions>
</Alert>
<Alert variant="destructive">
  <AlertContent>
    <AlertTitle>Sync failed</AlertTitle>
    <AlertDescription>The repository could not be reached.</AlertDescription>
  </AlertContent>
  <AlertActions>
    <Button variant="ghost" size="sm">Details</Button>
    <Button size="sm">Try again</Button>
  </AlertActions>
</Alert>`}
        >
          <Alert variant="warning">
            <AlertContent>
              <AlertTitle>Credits are low</AlertTitle>
              <AlertDescription>About 2 hours of sessions remain this month.</AlertDescription>
            </AlertContent>
            <AlertActions>
              <Button size="sm">
                Add credits
              </Button>
            </AlertActions>
          </Alert>
          <Alert variant="destructive">
            <AlertContent>
              <AlertTitle>Sync failed</AlertTitle>
              <AlertDescription>The repository could not be reached.</AlertDescription>
            </AlertContent>
            <AlertActions>
              <Button variant="ghost" size="sm">
                Details
              </Button>
              <Button size="sm">
                Try again
              </Button>
            </AlertActions>
          </Alert>
        </Example>
      </DocSection>

      <DocSection
        title="Custom media"
        description="AlertMedia replaces the glyph. Use it only for a state the glyph cannot say, such as a spinner while the thing loads."
      >
        <Example
          previewClassName="flex-col items-stretch gap-3"
          code={`<Alert>
  <AlertMedia>
    <Loading variant="spokes" />
  </AlertMedia>
  <AlertTitle>Connecting the repository</AlertTitle>
  <AlertDescription>Sessions can use it once it is connected.</AlertDescription>
</Alert>`}
        >
          <Alert>
            <AlertMedia>
              <Loading variant="spokes" />
            </AlertMedia>
            <AlertTitle>Connecting the repository</AlertTitle>
            <AlertDescription>Sessions can use it once it is connected.</AlertDescription>
          </Alert>
        </Example>
      </DocSection>
    </DocPage>
  );
}
