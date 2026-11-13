'use client';

import { DesignSystemShell } from './_docs/shell';
import AccordionSection from './_docs/sections/accordion';
import AlertSection from './_docs/sections/alert';
import AvatarSection from './_docs/sections/avatar';
import BadgeSection from './_docs/sections/badge';
import BrandSection from './_docs/sections/brand';
import BreadcrumbSection from './_docs/sections/breadcrumb';
import ButtonSection from './_docs/sections/button';
import ButtonGroupSection from './_docs/sections/button-group';
import CalendarSection from './_docs/sections/calendar';
import CaptionSection from './_docs/sections/caption';
import CardSection from './_docs/sections/card';
import CheckboxSection from './_docs/sections/checkbox';
import CodeSection from './_docs/sections/code';
import CodeCardSection from './_docs/sections/code-card';
import CollapsibleSection from './_docs/sections/collapsible';
import ColorsSection from './_docs/sections/colors';
import ComboboxSection from './_docs/sections/combobox';
import CommandSection from './_docs/sections/command';
import ConfettiSection from './_docs/sections/confetti';
import ContextMenuSection from './_docs/sections/context-menu';
import DialogSection from './_docs/sections/dialog';
import DropdownMenuSection from './_docs/sections/dropdown-menu';
import EmptyStateSection from './_docs/sections/empty-state';
import FontsSection from './_docs/sections/fonts';
import GuidelinesSection from './_docs/sections/guidelines';
import HeadingsSection from './_docs/sections/headings';
import HoverCardSection from './_docs/sections/hover-card';
import IconsSection from './_docs/sections/icons';
import InputSection from './_docs/sections/input';
import InteractionSection from './_docs/sections/interaction';
import IntroductionSection from './_docs/sections/introduction';
import KbdSection from './_docs/sections/kbd';
import LabelSection from './_docs/sections/label';
import LoadingSection from './_docs/sections/loading';
import MotionSection from './_docs/sections/motion';
import PatternsSection from './_docs/sections/patterns';
import PopoverSection from './_docs/sections/popover';
import ProgressSection from './_docs/sections/progress';
import RadioGroupSection from './_docs/sections/radio-group';
import RadiusSection from './_docs/sections/radius';
import ScrollAreaSection from './_docs/sections/scroll-area';
import SelectSection from './_docs/sections/select';
import SeparatorSection from './_docs/sections/separator';
import ShadowsSection from './_docs/sections/shadows';
import SheetSection from './_docs/sections/sheet';
import SplitSheetSection from './_docs/sections/split-sheet';
import SkeletonSection from './_docs/sections/skeleton';
import SliderSection from './_docs/sections/slider';
import SpacingSection from './_docs/sections/spacing';
import StatesSection from './_docs/sections/states';
import SwitchSection from './_docs/sections/switch';
import TableSection from './_docs/sections/table';
import TabsSection from './_docs/sections/tabs';
import TextSection from './_docs/sections/text';
import TextareaSection from './_docs/sections/textarea';
import ToastSection from './_docs/sections/toast';
import ToggleSection from './_docs/sections/toggle';
import TokensSection from './_docs/sections/tokens';
import TooltipSection from './_docs/sections/tooltip';
import WallpapersSection from './_docs/sections/wallpapers';

/** One route. Each topic is a tab; its slug is the key in _docs/nav.ts. */
const SECTIONS = {
  introduction: IntroductionSection,
  guidelines: GuidelinesSection,
  brand: BrandSection,
  wallpapers: WallpapersSection,
  colors: ColorsSection,
  tokens: TokensSection,
  spacing: SpacingSection,
  radius: RadiusSection,
  shadows: ShadowsSection,
  motion: MotionSection,
  states: StatesSection,
  interaction: InteractionSection,
  icons: IconsSection,
  fonts: FontsSection,
  headings: HeadingsSection,
  text: TextSection,
  caption: CaptionSection,
  code: CodeSection,
  button: ButtonSection,
  'button-group': ButtonGroupSection,
  toggle: ToggleSection,
  'dropdown-menu': DropdownMenuSection,
  'context-menu': ContextMenuSection,
  command: CommandSection,
  input: InputSection,
  textarea: TextareaSection,
  label: LabelSection,
  select: SelectSection,
  combobox: ComboboxSection,
  checkbox: CheckboxSection,
  'radio-group': RadioGroupSection,
  switch: SwitchSection,
  slider: SliderSection,
  calendar: CalendarSection,
  tabs: TabsSection,
  breadcrumb: BreadcrumbSection,
  kbd: KbdSection,
  avatar: AvatarSection,
  badge: BadgeSection,
  card: CardSection,
  table: TableSection,
  'code-card': CodeCardSection,
  accordion: AccordionSection,
  collapsible: CollapsibleSection,
  separator: SeparatorSection,
  'scroll-area': ScrollAreaSection,
  patterns: PatternsSection,
  loading: LoadingSection,
  skeleton: SkeletonSection,
  progress: ProgressSection,
  toast: ToastSection,
  alert: AlertSection,
  'empty-state': EmptyStateSection,
  confetti: ConfettiSection,
  tooltip: TooltipSection,
  popover: PopoverSection,
  'hover-card': HoverCardSection,
  dialog: DialogSection,
  sheet: SheetSection,
  'split-sheet': SplitSheetSection,
};

export default function DesignSystemPage() {
  return <DesignSystemShell sections={SECTIONS} />;
}
