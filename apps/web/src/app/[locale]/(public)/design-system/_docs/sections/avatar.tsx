'use client';

import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from '@kortix/ui/avatar';
import { EntityAvatar } from '@kortix/ui/entity-avatar';
import { BriefcaseIcon, CodeIcon, RocketLaunchIcon } from '@phosphor-icons/react';

import { DocPage, DocSection, Example } from '../doc';

const SIZES = ['sm', 'default', 'lg'] as const;
const BADGE_TONES = ['online', 'away', 'busy', 'neutral'] as const;
const SIZE_PX = { sm: '24px', default: '32px', lg: '40px' } as const;
/** Portraits already published on the marketing site (public/images/team). */
const FACES = [1, 2, 3, 4, 5, 6].map((n) => `/images/team/face-${n}.webp`);
const FACE = FACES[0]!;
const GROUP = FACES.slice(1, 4);
const ENTITY_SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;

export default function AvatarPage() {
  return (
    <DocPage
      title="Avatar"
      lead="A square tile with 6px corners: a photo, or initials on a muted fill while the photo is missing. For a person in product code, compose UserAvatar; for an account or a project, EntityAvatar. Both build on this primitive."
    >
      <DocSection title="Sizes" description="sm is 24px, the default is 32px, lg is 40px. The fallback text drops to text-xs at sm.">
        <Example
          code={SIZES.map(
            (s) => `<Avatar size="${s}">\n  <AvatarImage src="${FACE}" alt="Ada Lovelace" />\n  <AvatarFallback>AL</AvatarFallback>\n</Avatar>`,
          ).join('\n')}
        >
          {SIZES.map((s) => (
            <div key={s} className="flex flex-col items-center gap-2">
              <Avatar size={s}>
                <AvatarImage src={FACE} alt="Ada Lovelace" />
                <AvatarFallback>AL</AvatarFallback>
              </Avatar>
              <span className="text-muted-foreground font-mono text-xs">{SIZE_PX[s]}</span>
            </div>
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="Image and fallback"
        description="AvatarImage paints once the file loads. Until then, or when it fails, AvatarFallback shows. Set delayMs so a fast image never flashes the initials."
      >
        <Example
          code={`<Avatar>
  <AvatarImage src="${FACE}" alt="Ada Lovelace" />
  <AvatarFallback delayMs={300}>AL</AvatarFallback>
</Avatar>
<Avatar>
  <AvatarFallback>GH</AvatarFallback>
</Avatar>`}
        >
          <Avatar>
            <AvatarImage src={FACE} alt="Ada Lovelace" />
            <AvatarFallback delayMs={300}>AL</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>GH</AvatarFallback>
          </Avatar>
        </Example>
      </DocSection>

      <DocSection
        title="Badge"
        description="A status dot that sits just outside the bottom-right corner, with a ring in the page color. tone names the status: online (green, the default), away (yellow), busy (red) or neutral. It scales with the avatar: 8px, 10px, 12px."
      >
        <Example
          code={BADGE_TONES.map(
            (tone) =>
              `<Avatar>\n  <AvatarImage src="${FACES[4]}" alt="Grace Hopper" />\n  <AvatarFallback>GH</AvatarFallback>\n  <AvatarBadge tone="${tone}" />\n</Avatar>`,
          ).join('\n')}
        >
          {BADGE_TONES.map((tone, i) => (
            <Avatar key={tone} size={SIZES[i % SIZES.length]}>
              <AvatarImage src={FACES[4]} alt="Grace Hopper" />
              <AvatarFallback>GH</AvatarFallback>
              <AvatarBadge tone={tone} />
            </Avatar>
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="Group"
        description="AvatarGroup overlaps its avatars and rings each one in the page color. AvatarGroupCount closes the row with the number not shown, at the same size."
      >
        <Example
          previewClassName="flex-col items-start gap-4"
          code={SIZES.map(
            (s) =>
              `<AvatarGroup>\n${GROUP.map(
                (src) =>
                  `  <Avatar size="${s}">\n    <AvatarImage src="${src}" alt="" />\n    <AvatarFallback>KX</AvatarFallback>\n  </Avatar>`,
              ).join('\n')}\n  <AvatarGroupCount>+4</AvatarGroupCount>\n</AvatarGroup>`,
          ).join('\n')}
        >
          {SIZES.map((s) => (
            <AvatarGroup key={s}>
              {GROUP.map((src) => (
                <Avatar key={src} size={s}>
                  <AvatarImage src={src} alt="" />
                  <AvatarFallback>KX</AvatarFallback>
                </Avatar>
              ))}
              <AvatarGroupCount>+4</AvatarGroupCount>
            </AvatarGroup>
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="Emoji, icon and initials"
        description="A workspace, a project or an agent is an EntityAvatar: an emoji, a glyph in its tint, a Phosphor icon, or the first letter of its name. It shares the avatar's square tile and sizes from xs to xl."
      >
        <Example
          previewClassName="flex-col items-start gap-4"
          code={`<EntityAvatar emoji="🚀" label="Launch" size="lg" />
<EntityAvatar glyph={{ name: 'Rocket', color: 'blue' }} label="Launch" size="lg" />
<EntityAvatar icon={CodeIcon} label="Engineering" size="lg" />
<EntityAvatar label="Kortix" size="lg" />`}
        >
          {ENTITY_SIZES.map((s) => (
            <div key={s} className="flex items-center gap-3">
              <span className="text-muted-foreground w-6 font-mono text-xs">{s}</span>
              <EntityAvatar emoji="🚀" label="Launch" size={s} />
              <EntityAvatar emoji="🎨" label="Design" size={s} />
              <EntityAvatar glyph={{ name: 'Rocket', color: 'blue' }} label="Launch" size={s} />
              <EntityAvatar glyph={{ name: 'BrandIcon', color: 'lime' }} label="Brand" size={s} />
              <EntityAvatar icon={CodeIcon} label="Engineering" size={s} />
              <EntityAvatar icon={BriefcaseIcon} label="Sales" size={s} />
              <EntityAvatar icon={RocketLaunchIcon} label="Growth" size={s} />
              <EntityAvatar label="Kortix" size={s} />
            </div>
          ))}
        </Example>
      </DocSection>
    </DocPage>
  );
}
