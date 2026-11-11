/**
 * Follow-through: a top-level session never ends a turn with a wait it does
 * not own. A run that settled with an open wait goes back to the model once,
 * with a hidden note, before the person gets control back.
 *
 * A wait is open when either is true:
 *
 * - the reply offers a later check instead of setting one ("Want me to check
 *   the thread in a couple of hours?");
 * - the run acted on the outside world through a connector (sent or replied
 *   to an email, created a transfer, posted a message) and set no wake-up.
 *
 * Either way, the session's own wake-ups decide last: a session with an
 * active loop or wake-up (`GET …/sessions/:id/reminders`) is left alone. The
 * check reads what the run did, not the language it wrote in, except for the
 * offer, which it matches in English and German.
 *
 * pi's `agent_before_settle` with `continue: true` runs one more model
 * request (docs/extensions.md "Guard continuation conditions"). The note goes
 * out at most once per run, so the guard can never loop. Registered by
 * runtime.ts `followThroughExtension` for a top-level session with Loops on.
 */
import type { InlineExtension } from '@earendil-works/pi-coding-agent'

export const FOLLOW_THROUGH_NOTE_TYPE = 'kortix-follow-through'
/** The project flag behind session loops and wake-ups (`reminders`, named Loops). */
export const LOOPS_FLAG = 'reminders'

/** Why the run must not settle yet. */
export type OpenWait = { kind: 'offer'; offer: string } | { kind: 'acted'; actions: string[] }

/** The parts of a pi message the check reads. */
type Block = { type: string; text?: string; name?: string; arguments?: Record<string, unknown> }
type Message = { role: string; content?: string | Block[] }

const ASK = String.raw`(?:want me to|do you want me to|should I|shall I|would you like me to|I can|I could|happy to|soll ich|willst du(?:, dass ich)?|möchtest du(?:, dass ich)?|sollen wir)`
const LATER = String.raw`(?:check|watch|follow[ -]?up|remind|chase|ping|look again|keep an eye|monitor|nudge|circle back|let you know when|tell you when|nachschauen|nachsehen|prüfen|nachhaken|erinnern|im Auge|Bescheid)`
/** "Want me to check the thread for her answer in a couple of hours?": one sentence, ending in a question mark. */
const OFFER = new RegExp(String.raw`[^.!?\n]*\b${ASK}\b[^.!?\n]{0,160}\b${LATER}[^.!?\n]{0,160}\?`, 'i')

/** A connector call the CLI runs: `kortix connectors call <slug> <action> …`. */
const CONNECTOR_CALL = /\bkortix\s+connectors\s+call\s+([\w.-]+)\s+([\w.-]+)/g
/** An action that hands something to someone else, whose answer comes later. */
const OUTWARD = /(?:^|[_.-])(?:send|reply|forward|draft|post|message|mail|invite|transfer|pay|payment|fund|order|book|submit|request|quote|invoice)/i
/** The tools and commands that set a wake-up. */
const WAKE_ACTIONS = new Set(['follow_up', 'wake_on', 'create', 'automate'])
const WAKE_COMMAND = /\bkortix\s+(?:loops?\s+(?!ls\b|list\b|rm\b|delete\b|pause\b)|triggers\s+add\b|goals\s+new\b)/

function blocks(message: Message): Block[] {
  if (typeof message.content === 'string') return [{ type: 'text', text: message.content }]
  return Array.isArray(message.content) ? message.content : []
}

/** The messages of the current run: everything after the last user message. */
export function runMessages(messages: readonly Message[]): Message[] {
  let start = messages.length
  while (start > 0 && messages[start - 1]!.role !== 'user') start--
  return messages.slice(start)
}

/** The text a tool call ran: a shell command, or its arguments. */
function callText(block: Block): string {
  const args = block.arguments ?? {}
  return typeof args.command === 'string' ? args.command : JSON.stringify(args)
}

/** The run set a wake-up itself (the API is asked only when it did not). */
export function setWakeUp(run: readonly Message[]): boolean {
  return run.some((message) =>
    blocks(message).some((block) => {
      if (block.type !== 'toolCall') return false
      if (block.name === 'kortix_schedules') return WAKE_ACTIONS.has(String(block.arguments?.action ?? ''))
      return WAKE_COMMAND.test(callText(block))
    }),
  )
}

/** `gmail.reply_to_thread`: each outward connector call of the run, in order, once. */
export function outwardActions(run: readonly Message[]): string[] {
  const found = new Set<string>()
  for (const message of run) {
    for (const block of blocks(message)) {
      if (block.type !== 'toolCall') continue
      for (const [, slug, action] of callText(block).matchAll(CONNECTOR_CALL)) if (OUTWARD.test(action!)) found.add(`${slug}.${action}`)
    }
  }
  return [...found]
}

/** The run's last reply text. */
function finalText(run: readonly Message[]): string {
  for (let index = run.length - 1; index >= 0; index--) {
    const message = run[index]!
    if (message.role !== 'assistant') continue
    const text = blocks(message)
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('\n')
      .trim()
    if (text) return text
  }
  return ''
}

/** The wait this run leaves open, or null. `hasWakeUp` is asked only when the run looks open. */
export async function openWait(messages: readonly Message[], hasWakeUp: () => Promise<boolean>): Promise<OpenWait | null> {
  const run = runMessages(messages)
  if (setWakeUp(run)) return null
  const offer = finalText(run).match(OFFER)?.[0]?.trim()
  const actions = outwardActions(run)
  const wait: OpenWait | null = offer ? { kind: 'offer', offer } : actions.length ? { kind: 'acted', actions } : null
  if (!wait) return null
  // An offer still breaks the rule with a loop set: the person must not be asked for what is already running.
  if (wait.kind === 'acted' && (await hasWakeUp())) return null
  return wait
}

/** The hidden note the model reads before it may end the turn. */
export function followThroughNote(wait: OpenWait): string {
  const why =
    wait.kind === 'offer'
      ? `Your reply offers a later check instead of setting it: "${wait.offer}"`
      : `This turn acted on the outside world (${wait.actions.join(', ')}) and no loop or wake-up is set for what comes back.`
  return [
    `[follow-through] ${why}`,
    'Never ask the person whether to follow up. Own the wait: set it now with `kortix_schedules` (`wake_on` when an event can wake you, else `follow_up`), with a `text` for the turn that wakes up: what is pending, what to check, what to do for each outcome, when to stop.',
    'Then tell the person in one line what you set: "⏳ I\'ll check the thread for her reply at 21:30 and tell you." Do not repeat the rest of your reply.',
    'If nothing really comes back (the work is complete and verified), set nothing and reply with nothing.',
  ].join('\n')
}

/** A session entry that is a follow-through note: the session log writes no message for it. */
export function isFollowThroughNote(entry: { type?: string; customType?: string }): boolean {
  return entry.type === 'custom_message' && entry.customType === FOLLOW_THROUGH_NOTE_TYPE
}

export interface FollowThroughOptions {
  /** True when the session has an active loop or wake-up. A failed read counts as true: never nudge on a guess. */
  hasWakeUp: () => Promise<boolean>
  /** False for a turn the guard leaves alone (a peer message, a trigger-started session). */
  applies: () => boolean
  /** Called with each note sent, for the log. */
  onNudge?: (wait: OpenWait) => void
}

export function followThrough(options: FollowThroughOptions): InlineExtension {
  return {
    name: FOLLOW_THROUGH_NOTE_TYPE,
    hidden: true,
    factory: (pi) => {
      let nudged = false
      pi.on('agent_settled', () => {
        nudged = false
      })
      pi.on('agent_before_settle', async (event) => {
        // Not `context.canContinue`: it is false after a final reply, and the note is what the next request continues from.
        if (nudged || event.outcome !== 'completed' || !options.applies()) return undefined
        const wait = await openWait(event.context.contextMessages as Message[], options.hasWakeUp)
        if (!wait) return undefined
        nudged = true
        options.onNudge?.(wait)
        // The model reads the note; the session log leaves it out (`isFollowThroughNote`), so the person never sees it.
        return { entries: [{ type: 'custom_message' as const, customType: FOLLOW_THROUGH_NOTE_TYPE, content: followThroughNote(wait), display: false }], continue: true }
      })
    },
  }
}
