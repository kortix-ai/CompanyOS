# Motion

Values live in `visual-system.json` (keys `motion.*`, `effects.press.*`). The tokens compile: `duration-fast`, `duration-normal`, `duration-moderate`, `duration-slow` and `duration-slower` are real utilities (`decisions.md` D3, J-8). Before 2026-10-01 they emitted no CSS, and every call site ran at 150ms.

**Rule.** Product motion is 300ms or less, or none. — *Why:* speed is the product. A reviewer must notice the interface, not the animation. — *Where:* app | mobile. — *When silent:* no animation.

Animation exists to make the UI feel faster, or to show where a thing came from.

## Pass 0: the frequency ladder

**Rule.** Count how often a user sees the thing in a working day, before you choose a duration. Frequency sets the budget. Nothing else does: not how it looks in isolation, not how much effort it took. — *Why:* a demo is one viewing. The fiftieth viewing is the design target. — *Where:* app, mobile. Marketing and decks use the last row. — *When silent:* the answer to "should this animate?" is no. Replay the interaction ten times. If you still notice the motion, cut it.

| Seen | Budget | Examples |
| --- | --- | --- |
| **Constantly**, tens of times an hour | **None.** `transition-none` | Keyboard list nav, row hover in a dense list, focus moves, selection in a table, anything an arrow key drives, **every menu, select, popover, tooltip, submenu and the command palette opening or closing** |
| **Often**, several times a session | **100 to 200ms**, opacity and transform only | Hover on a non-dense target (`duration-fast`), tab switch and disclosure (`duration-moderate`) |
| **Occasionally**, once or twice a session | **200 to 300ms** | Modal, sheet, drawer, toast, panel swap, hover card |
| **Rarely**, first run or a moment worth marking | **300ms or less**, blur allowed on a state swap | Empty to first content, a completed deploy, a destructive confirm |
| **Marketing and decks** | **up to 500ms**, one hero moment per viewport | Landing intro, feature illustration, deck build step |

**Rule.** Never animate a keyboard-initiated action. — *Why:* a user drives them hundreds of times a day. Motion makes the interface feel laggy and disconnected from the key just pressed. — *Where:* app, mobile (hardware keyboard), deck engine slide navigation (a build-step opacity fade is not navigation: see the Deck paragraph). — *When silent:* no exceptions.

## Floating panels (D44, supersedes D4a)

**Rule.** Open and close every floating panel with one recipe: from its trigger (`origin-(--transform-origin)`), scale 0.95 to 1 and opacity 0 to 1 in `duration-moderate` (200ms) `ease-in-out`, reversed on close, `motion-reduce:transition-none`. That is `FLOATING_PANEL_MOTION` in `menu-recipe.ts`, on menus, submenus, popovers, the combobox, the hover card and tooltips. The select takes `SELECT_PANEL_MOTION`: the same from 0.97, because its list sits on its trigger. A tooltip adds a 4px nudge from its side and opens instantly once one in its group is open (`data-instant`). Dialogs and the command palette open the same way (0.95 and a fade, 200ms). — *Why:* founder decision, 2026-11-12 (D44): copy the reference design system's open and close (measured: 200ms, `cubic-bezier(0.4, 0, 0.2, 1)`, scale 0.95, 0.97 for the select). The scale shows which trigger a panel belongs to. — *Where:* app. — *When silent:* take the recipe from `menu-recipe.ts`; never write a panel's own keyframes (`audit.sh` flags them).

**Rule.** Pin the command palette 17vh from the top at 600px wide. — *Why:* the input stays still while the list height changes (#7675). — *Where:* app. — *When silent:* copy `features/workspace/command-palette.tsx`.

**Rule.** Scale a hover card from its trigger: `transform-origin: var(--radix-hover-card-content-transform-origin)`. The `center` default reads as a floating box. — *Why:* the hover card is the one panel that animates, so it must come from somewhere. — *Where:* app. — *When silent:* `hover-card.tsx`.

**Rule.** Show the first tooltip after a delay (150ms, `TooltipProvider`), then no delay and no animation for the next ones while the group is active. — *Why:* the delay prevents accidental activation. Repeating it makes the UI feel slow. The delay moved from 300ms to 150ms (#7301). — *Where:* app. — *When silent:* inherit the provider.

**Rule.** Drive pointer hover highlights from CSS `:hover`, never from React state. Keyboard mode uses `data-selected`. — *Why:* a re-render on every pointer move is lag. The palette writes `data-nav="pointer" | "keyboard"` to the DOM with no re-render (#7301). — *Where:* app. — *When silent:* CSS first.

**Rule.** The combobox opens with `FLOATING_PANEL_MOTION`, like every floating panel (D44).

**Rule.** Slide the tab indicator, not the tab: the segmented chip or the underline bar moves to the new tab in 200ms `ease-out`. Arrow keys move focus at once; only the indicator travels. — *Why:* the indicator shows where the selection went, which is the one thing a tab switch must make visible (D43). — *Where:* app. — *When silent:* the segmented `TabsList` slides by default. An underline list slides only with `animate="fluid"`, because the indicator measures one row: a list that wraps or scrolls keeps the static rule.

## Easing

| Curve | Use it for | Notes |
| --- | --- | --- |
| **`ease-out`** | **Enter and exit.** Anything appearing or leaving. | The default. Fast at the start feels responsive. Reach here first. |
| `ease-in-out` | Elements already on screen that move, resize or morph | Accelerate, then decelerate. |
| `ease-default` | The Kortix house curve (`motion.easing.default`), where a named curve is wanted | A real utility, from `--ease-default`. |
| `linear` | Marquee, progress, hold-to-delete, continuous rotation | Only where a constant rate is the meaning. |
| **`ease-in`** | **Nothing.** | Starts slow, so the UI feels sluggish. Add none. |

**Rule.** Use `ease-out` for enter and for exit. Never use `ease-in` or `linear` on a UI transition. Never write bare `ease` as a class: it is not a Tailwind utility and emits no CSS. — *Why:* easing changes perceived speed independently of time. `ease-in` and `linear` are the two ways a surface starts to feel slow. — *Where:* app, marketing, mobile, deck. — *When silent:* `ease-out`. For a color or background hover, use `transition-colors` with the default easing.

## Duration

**Product motion stays at 300ms or less.** Over 300ms is a marketing budget, or a bug.

| Token | Value | Use |
| --- | --- | --- |
| `duration-fast` | 100ms | Hover color and opacity |
| `duration-normal` | 150ms | **The default UI transition** |
| `duration-moderate` | 200ms | Disclosure, accordion, tab |
| `duration-slow` | 300ms | Modal, drawer, sheet. The ceiling. |
| `duration-slower` | 500ms | Marketing and decks only |

**Rule.** Write the token, not the number. Write `duration-normal`, not `duration-150` and not `duration-[150ms]`. — *Why:* raw values outnumber tokens in the codebase because the tokens used to be dead. They are real now, and a raw value is debt. `duration-80` (in `card.tsx` and `switch.tsx`) is off the ladder: pick `duration-fast`. — *Where:* app, marketing. — *When silent:* nearest token. The audit maps 100, 150, 200 and 300 to their token names.

**Rule.** Go longer than 300ms only for a large element (bigger reads as heavier, so it moves slower) or a steep custom curve, and write a comment that names which. — *Why:* "it looks nicer" is not a reason. — *Where:* app. — *When silent:* 300ms.

## Properties

**Rule.** Animate `opacity`, `transform`, `filter`, `color` and `background-color`, and nothing else. — *Why:* these are compositor-friendly. The rest cause layout and drop frames. — *Where:* app, marketing, mobile. — *When silent:* for a height, use a grid-rows or `motion/react` height animation, not a CSS height transition. Never animate `height`, `width`, `top`, `left` or `margin` with a CSS transition.

**Rule.** Never write `transition-all` or bare `transition`. Name the property: `transition-colors`, `transition-transform`, `transition-opacity`. Explicit lists like `transition-[max-width,opacity]` are fine. — *Why:* an unnamed transition animates every property that changes, on every state change. The ban is on unnamed transitions, not on the bracket syntax. — *Where:* app, marketing. — *When silent:* name it.

## Fixed values

| Thing | Value | Why |
| --- | --- | --- |
| Button press | `active:scale-[0.96]` (`effects.press.button`) | The house press. It makes the UI feel like it is listening. |
| Full-width row press | `active:scale-[0.998]` (`effects.press.row`) | A larger element gets a smaller scale (D4k). A 0.96 scale on a wide row moves its edges visibly. |
| Form field press | none | An input never scales, and a select beside it behaves the same (#8286). The borderless toolbar trigger keeps 0.98 in `trigger-variants.ts`. |
| Enter scale floor | 0.9 to 0.97 (`motion.enter_scale_floor`) | **Never `scale(0)`.** Things do not come from nothing. The sanctioned icon-swap morph from 0.25 is in `kortix-design-system`. |
| Spring | `{ type: 'spring', duration: 0.3, bounce: 0 }` (`motion.spring`) | `bounce: 0` is the brand: the spring settles with no overshoot. |
| Bounce above 0 | drag-release gestures only | A drag applied force, so a settle reads as physical. A click did not. `packages/ui/src/lib/springs.ts` (`bounce: 0.12`) and the onboarding seal (`bounce: 0.28`) pre-date this rule and are debt. |
| Blur bridge | `filter: blur(4px)` to `blur(0)` | Only to bridge a state swap where two objects would blink. Never on text the user is reading. |

**Rule.** A filled primary button or link-button hovers to its own fill at 90%: `hover:bg-foreground/90` (the `default` variant in `button.tsx`). In portable HTML write `color-mix(in oklab, var(--foreground) 90%, transparent)`. Set no hover `opacity` on the element. — *Why:* the shipped `Button` default does this, and an element opacity would fade the label with the fill (Q52). — *Where:* app, marketing. — *When silent:* that value.

**Rule.** Make a hover effect change color, background, opacity or `transform`, never position in flow. — *Why:* a hover that shifts layout moves the element from under the cursor and flickers between states. — *Where:* app, marketing. — *When silent:* color only.

**Rule.** Enter with opacity, or opacity plus a scale from the enter floor. Never use opacity with a large `y` translate. — *Why:* a large translate moves the text the user wants to read, and every item in a list pays the delay. — *Where:* app | marketing. — *When silent:* opacity only.

**Rule.** Write hover as `hover:`. Tailwind v4 already gates it to hover-capable devices. Do not hand-roll a hover effect that fires on touch. — *Why:* touch has no hover. — *Where:* app, marketing. — *When silent:* `hover:`.

## Reduced motion

**Rule.** An enter animation that changes opacity only needs no reduced-motion variant. Any `transform`, translate or scale needs `motion-reduce:` handling. — *Why:* reduce keeps opacity and color, so an opacity fade already is the reduced variant (Q4). — *Where:* app, marketing, mobile. — *When silent:* if the animation moves anything, add `motion-reduce:animate-none`.

**Rule.** A static row has no transition class. Add `transition-colors` only when the row has a hover or selected state, and not in a dense list a key can drive (frequency ladder). — *Why:* a transition with no change to animate is dead code, and dense-list hover is `transition-none` (Q12). — *Where:* app. — *When silent:* no transition.

**Rule.** Ship two variants of every animation that moves. `prefers-reduced-motion: reduce` means remove the movement, not the feedback. Keep opacity and color. Drop `transform` and anything that translates or scales. An opacity-only change (a deck build fade) needs no variant: with no transition class, no variant is needed either. — *Why:* accessibility is priority 1. The two rules read as unconditional until Q28 stated the exception. — *Where:* app, marketing, mobile, deck. — *When silent:* ship both variants in the same change when anything moves.

**Rule.** A disclosure fold uses the `Disclosure` default transition. Do not pass `duration` 0. — *Why:* disclosure is an "often" case at 100 to 200ms (`duration-moderate`). A run switched it off without reading this file (Q24). — *Where:* app. — *When silent:* the default.

```tsx
// Tailwind
className="motion-safe:transition-transform motion-reduce:transition-opacity"
```

```tsx
// motion/react
const reduce = useReducedMotion();
<motion.div animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }} />
```

## Orchestration

**Rule.** Move one thing at a time. A stagger is a marketing device. — *Why:* in product UI a staggered list is strictly slower to read and to click than the same list appearing at once. The delay is charged to the user every time. — *Where:* app, mobile: never. Marketing: once, on the intro. — *When silent:* everything appears at once.

Waiting-screen rules (one channel, progress follows the backend) live in [layout.md](layout.md), section States.

## Busy and loading marks

**Rule.** Use `Loading` as the spinner everywhere on web. Never spin an icon (`animate-spin` on a refresh glyph). — *Why:* one spinner reads as one product. — *Where:* app, marketing. Mobile: `KortixLoader` or `Skeleton` (`apps/mobile/AGENTS.md`, Loading). — *When silent:* `Loading`. Swap the icon for `Loading` while it loads and back after; inside a plain muted icon button add `in-[button]:text-muted-foreground`, because the base class paints `text-background` there. `sandbox-url-detector.tsx` and `infrastructure-preview.tsx` already do this.

**Rule.** When code that spins an icon has a test that pins the spin class, change the test in the same change. A test that asserts `animate-spinner-spin` or `animate-spin` on an icon is wrong. — *Why:* two tests keep the banned pattern alive and make the fix look like a regression (Q40). — *Where:* app. — *When silent:* assert `Loading` renders while `loading` is true. Remaining debt on 2026-10-01: `packages/ui/src/session/tool/shared/tool-action-bar.tsx` (lines 61 and 81, pinned by `tool-action-bar.test.tsx`), `packages/ui/src/browser/sandbox-browser-chrome.tsx` (line 184, pinned by `sandbox-browser-chrome.test.tsx`), `packages/ui/src/files/tree/components/file-tree-item.tsx` (line 351), and an `animate-spin` class laid on a `Loading` in `demo-qualifier-modal.tsx`, `apply-modal.tsx` and `marketplace-paged-grid.tsx`.

**Rule.** Use `SessionDotMatrix` as the busy mark for session-scoped work (D4f), for example an approve or deny button while a decision saves (#8421). — *Why:* it marks "this session is doing something" and is stable per `session_id`. — *Where:* app. — *When silent:* if the work is not tied to one session, use `Loading`.

**Rule.** The page-level loading mark is `ProjectPendingScreen`: the pulsing Kortix mark, opacity only, behind `motion-safe`. It never spins. — *Why:* signing in paints this mark once and holds it across three navigations (#7179, #7263, D4h). — *Where:* app. — *When silent:* layout in `layout.md`.

## Per surface

| | app | marketing | mobile | deck | image | email | CLI |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Ceiling | 300ms, one thing | 500ms, one hero moment | native defaults | build steps; 500ms | none | none | none |
| Floating panels | instant; hover card animated | instant menus | native sheets | n/a | n/a | n/a | n/a |
| Stagger | never | once, intro | never | build steps are the stagger | n/a | n/a | n/a |
| Reduced motion | required | required | required (`useReducedMotion`) | required | n/a | n/a | n/a |
| Tokens | `duration-*` | `duration-*` | `MOTION` in `apps/mobile/lib/utils/theme.ts` (numbers, pinned by `theme.test.ts`) | same as marketing | n/a | n/a | n/a |

**Mobile.** Every stack uses expo-router's native `Stack` with the platform push and pop. Write no custom screen animation. The root `index` redirect has `animation: 'none'`. Feedback is a toast (`useToast()`), never `Alert.alert`.

**Deck.** Never mount or unmount on a build step. Every element is in the DOM from the first frame, ghosted, and a step raises its opacity (`transition-opacity duration-slower`, ghost at the low-opacity step). The ghost opacity is the engine's value. Never write a local opacity class for a ghost: import the engine helper, and if the engine does not export it, flag it under Guesses and do not copy the value (Q28). Connector rails never fully fade. Only ghosted nodes drop further. A travelling packet (`Link fire`) is the one element that mounts for its step. Caption carries the sentence that changes per step. About 20 seconds of narration per build step. Films run at 60fps on a 120 BPM bar grid, one bar = 120 frames, and every frame is a pure function of the frame number (`kortix-presentation/references/films.md`).

**Marketing.** An intro animation plays once per visit and must not replay on back-navigation. One hero moment per viewport.

**Email, image, CLI.** No motion. A CLI prints plain lines.

## Rationalization table

| Thought | Reality |
| --- | --- |
| "A little animation would delight the user" | The user has a goal, not a wish to be delighted. Delight that repeats becomes friction. |
| "It is only 400ms, that is still quick" | Product ceiling is 300ms. 400ms is a marketing budget in a product surface. |
| "The stagger makes the list feel considered" | It makes the list slower to read and click, every time. |
| "`transition` is shorter to type than `transition-colors`" | It animates properties you did not choose. Name the property. |
| "This dropdown animation looked great in the demo" | A demo is one viewing. Estimate the fiftieth. |
| "I will add `prefers-reduced-motion` later" | It is the second half of the animation. Ship both. |
| "`ease-in` looks smoother on the way out" | It starts slow, so the UI reads as sluggish. `ease-out` for enter and exit. |
| "The popover should scale from its trigger" | Menus, selects and popovers are instant now. Only the hover card scales. |
| "I will use `duration-150`, it is the same" | Write `duration-normal`. The token is real. |
| "Fade up from 24px looks polished" | A large translate delays reading. Use opacity only. |

