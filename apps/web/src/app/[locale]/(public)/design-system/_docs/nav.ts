import {
  BellSimpleIcon,
  BookOpenTextIcon,
  CompassIcon,
  CursorClickIcon,
  StackSimpleIcon,
  SwatchesIcon,
  TableIcon,
  TextAaIcon,
  TextboxIcon,
  type Icon,
} from '@phosphor-icons/react';

/**
 * The /design-system topics. One entry per tab, in reading order. The sidebar
 * tab list, the ⌘K search and the Previous/Next links all read this list, so a
 * topic added here is discoverable everywhere at once. The page is one route:
 * a topic is a tab, deep-linked as /design-system#<slug>.
 *
 * `source` names the file that owns a topic, for readers of this list.
 */
export interface DocEntry {
  slug: string;
  title: string;
  /** One line for the search results. */
  summary: string;
  source?: string;
}

export interface DocGroup {
  title: string;
  entries: DocEntry[];
}

/** One icon per group: the ⌘K rows and the landing index draw it. */
export const GROUP_ICON: Record<string, Icon> = {
  Overview: BookOpenTextIcon,
  Foundations: SwatchesIcon,
  Typography: TextAaIcon,
  Actions: CursorClickIcon,
  Forms: TextboxIcon,
  Navigation: CompassIcon,
  'Data display': TableIcon,
  Feedback: BellSimpleIcon,
  Overlays: StackSimpleIcon,
};

const UI = 'packages/ui/src/primitives';
const BRAND = '.agents/skills/kortix-brand/references/visual';

export const DOC_GROUPS: DocGroup[] = [
  {
    title: 'Overview',
    entries: [
      { slug: 'introduction', title: 'Introduction', summary: 'What the Kortix design system is and how to read it' },
      { slug: 'guidelines', title: 'Usage', summary: 'Do and do not, and the anti-patterns', source: '.agents/skills/kortix-design-system/SKILL.md' },
    ],
  },
  {
    title: 'Foundations',
    entries: [
      { slug: 'brand', title: 'Brand', summary: 'Wordmark and icon, SVG and PNG, black and white', source: `${BRAND}/brandmark.md` },
      { slug: 'wallpapers', title: 'Wallpapers', summary: 'Mark and product wallpapers, social assets', source: 'apps/web/src/lib/wallpaper-downloads.ts' },
      { slug: 'colors', title: 'Colors', summary: 'Semantic surfaces, text, accents and status', source: `${BRAND}/visual-system.json` },
      { slug: 'tokens', title: 'Token map', summary: 'Every job mapped to its class and token', source: '.agents/skills/kortix-design-system/references/token-map.md' },
      { slug: 'spacing', title: 'Spacing', summary: 'The spacing scale and the canonical rhythm', source: `${BRAND}/layout.md` },
      { slug: 'radius', title: 'Radius', summary: 'The corner ladder and the control radii', source: `${BRAND}/visual-system.json` },
      { slug: 'shadows', title: 'Shadows', summary: 'Smooth stacked shadows and the ring edge', source: `${BRAND}/effects.md` },
      { slug: 'motion', title: 'Motion', summary: 'Durations, easing, the frequency ladder', source: `${BRAND}/motion.md` },
      { slug: 'states', title: 'States', summary: 'Loading, empty, error and success', source: `${BRAND}/layout.md` },
      { slug: 'interaction', title: 'Interaction', summary: 'Hover, focus, press and selection', source: `${BRAND}/motion.md` },
      { slug: 'icons', title: 'Icons', summary: 'The icon set, emoji and project icon pickers', source: `${UI}/kortix-icons.ts` },
    ],
  },
  {
    title: 'Typography',
    entries: [
      { slug: 'fonts', title: 'Font Families', summary: 'Roobert and Roobert Mono', source: `${BRAND}/typography.md` },
      { slug: 'headings', title: 'Headings', summary: 'Six heading sizes and three weights', source: `${BRAND}/typography.md` },
      { slug: 'text', title: 'Text', summary: 'Large, base and small body text', source: `${BRAND}/typography.md` },
      { slug: 'caption', title: 'Caption', summary: 'Two caption sizes, normal and uppercase', source: `${BRAND}/typography.md` }, // audit:allow names the casing, not a style
      { slug: 'code', title: 'Code', summary: 'Mono sizes and colors for inline code', source: `${BRAND}/typography.md` },
    ],
  },
  {
    title: 'Actions',
    entries: [
      { slug: 'button', title: 'Button', summary: 'Variants, sm to xl, icons, shapes, pending, disabled', source: `${UI}/button.tsx` },
      { slug: 'button-group', title: 'Button Group', summary: 'Joined buttons, icon groups, split buttons', source: `${UI}/button-group.tsx` },
      { slug: 'toggle', title: 'Toggle', summary: 'Pressed and unpressed toggles, toggle groups', source: `${UI}/toggle.tsx` },
      { slug: 'dropdown-menu', title: 'Dropdown Menu', summary: 'Menus with icons, shortcuts and submenus', source: `${UI}/dropdown-menu.tsx` },
      { slug: 'context-menu', title: 'Context Menu', summary: 'The right-click menu', source: `${UI}/context-menu.tsx` },
      { slug: 'command', title: 'Command', summary: 'Searchable command list and palette', source: `${UI}/command.tsx` },
    ],
  },
  {
    title: 'Forms',
    entries: [
      { slug: 'input', title: 'Input', summary: 'Text fields on the control ladder', source: `${UI}/input.tsx` },
      { slug: 'textarea', title: 'Textarea', summary: 'Multi-line text, autosize', source: `${UI}/textarea.tsx` },
      { slug: 'label', title: 'Label', summary: 'Labels, descriptions and field errors', source: `${UI}/label.tsx` },
      { slug: 'select', title: 'Select', summary: 'sm to xl triggers, groups, descriptions', source: `${UI}/select.tsx` },
      { slug: 'combobox', title: 'Combobox', summary: 'A searchable select with an animated popup', source: `${UI}/combobox.tsx` },
      { slug: 'checkbox', title: 'Checkbox', summary: 'Checked, indeterminate, disabled', source: `${UI}/checkbox.tsx` },
      { slug: 'radio-group', title: 'Radio Group', summary: 'One choice from a short list', source: `${UI}/radio-group.tsx` },
      { slug: 'switch', title: 'Switch', summary: 'On and off settings', source: `${UI}/switch.tsx` },
      { slug: 'slider', title: 'Slider', summary: 'A value or a range on a track', source: `${UI}/slider.tsx` },
      { slug: 'calendar', title: 'Calendar', summary: 'Date and date-range pickers', source: `${UI}/calendar.tsx` },
    ],
  },
  {
    title: 'Navigation',
    entries: [
      { slug: 'tabs', title: 'Tabs', summary: 'Default and underline, sm to 2xl', source: `${UI}/tabs.tsx` },
      { slug: 'breadcrumb', title: 'Breadcrumb', summary: 'Where you are in a hierarchy', source: `${UI}/breadcrumb.tsx` },
      { slug: 'kbd', title: 'Kbd', summary: 'Keys and shortcuts', source: `${UI}/kbd.tsx` },
    ],
  },
  {
    title: 'Data display',
    entries: [
      { slug: 'avatar', title: 'Avatar', summary: 'Sizes, fallbacks, badges and groups', source: `${UI}/avatar.tsx` },
      { slug: 'badge', title: 'Badge', summary: 'Status and count labels', source: `${UI}/badge.tsx` },
      { slug: 'card', title: 'Card', summary: 'Surfaces, radius, elevation, divided', source: `${UI}/card-surface.tsx` },
      { slug: 'table', title: 'Table', summary: 'Rows, headers and footers', source: `${UI}/table.tsx` },
      { slug: 'code-card', title: 'Code Card', summary: 'A titled, highlighted code sample', source: 'packages/ui/src/markdown/code/code-block.tsx' },
      { slug: 'accordion', title: 'Accordion', summary: 'Stacked sections that expand', source: `${UI}/accordion.tsx` },
      { slug: 'collapsible', title: 'Collapsible', summary: 'One section that shows and hides', source: `${UI}/collapsible.tsx` },
      { slug: 'separator', title: 'Separator', summary: 'Horizontal and vertical rules', source: `${UI}/separator.tsx` },
      { slug: 'scroll-area', title: 'Scroll Area', summary: 'A scrolling region with a quiet bar', source: `${UI}/scroll-area.tsx` },
      { slug: 'patterns', title: 'Patterns', summary: 'Section headers, lists, meta and status', source: '.agents/skills/kortix-design-system/references/patterns.md' },
    ],
  },
  {
    title: 'Feedback',
    entries: [
      { slug: 'loading', title: 'Loading', summary: 'Spinners: orbit, spokes and ring', source: `${UI}/loading.tsx` },
      { slug: 'skeleton', title: 'Skeleton', summary: 'Placeholders while content loads', source: `${UI}/skeleton.tsx` },
      { slug: 'progress', title: 'Progress', summary: 'Bars and rings for known progress', source: `${UI}/progress.tsx` },
      { slug: 'toast', title: 'Toast', summary: 'Success, error and info notices', source: `${UI}/toast.tsx` },
      { slug: 'alert', title: 'Alert', summary: 'Inline notices with actions', source: `${UI}/alert.tsx` },
      { slug: 'empty-state', title: 'Empty State', summary: 'What an empty or failed view shows', source: `${UI}/empty-state.tsx` },
      { slug: 'confetti', title: 'Confetti', summary: 'The one celebration moment', source: 'apps/web/src/app/[locale]/(public)/design-system/confetti-section.tsx' },
    ],
  },
  {
    title: 'Overlays',
    entries: [
      { slug: 'tooltip', title: 'Tooltip', summary: 'Hints on hover and focus', source: `${UI}/tooltip.tsx` },
      { slug: 'popover', title: 'Popover', summary: 'A small panel anchored to a trigger', source: `${UI}/popover.tsx` },
      { slug: 'hover-card', title: 'Hover Card', summary: 'A preview on hover', source: `${UI}/hover-card.tsx` },
      { slug: 'dialog', title: 'Dialog', summary: 'Dialogs, alert dialogs and modals', source: `${UI}/dialog.tsx` },
      { slug: 'sheet', title: 'Sheet', summary: 'Side and bottom sheets', source: `${UI}/sheet.tsx` },
      { slug: 'split-sheet', title: 'Split Sheet', summary: 'A sheet that takes a column instead of floating', source: `${UI}/split-sheet.tsx` },
    ],
  },
];

export const DOC_ENTRIES: DocEntry[] = DOC_GROUPS.flatMap((g) => g.entries);

/** "View on GitHub" opens the CompanyOS repository. */
export const REPO_URL = 'https://github.com/kortix-ai/CompanyOS/';

/** The entry for a tab value; unknown values fall back to the introduction. */
export function entryForSlug(slug: string): DocEntry {
  return DOC_ENTRIES.find((e) => e.slug === slug) ?? DOC_ENTRIES[0]!;
}
