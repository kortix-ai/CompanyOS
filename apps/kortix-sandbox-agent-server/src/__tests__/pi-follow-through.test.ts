import { describe, expect, test } from 'bun:test'
import { followThrough, followThroughNote, openWait, outwardActions, runMessages } from '@/harness/pi/extensions/follow-through'

const user = (text: string) => ({ role: 'user', content: text })
const reply = (text: string) => ({ role: 'assistant', content: [{ type: 'text', text }] })
const bash = (command: string) => ({ role: 'assistant', content: [{ type: 'toolCall', name: 'bash', arguments: { command } }] })
const schedules = (action: string) => ({ role: 'assistant', content: [{ type: 'toolCall', name: 'kortix_schedules', arguments: { action, text: 'check' } }] })

const noWakeUp = async () => false
const wakeUp = async () => true

// The shape of a real run: pay an invoice, email the vendor to confirm, end with an offer.
const invoiceRun = [
  user('pay this invoice and confirm via email'),
  bash(`kortix connectors call bank recipients_list '{}'`),
  bash(`kortix connectors call bank transfers_create '{"amount":100}'`),
  bash(`kortix connectors call mail reply_to_thread '{"thread_id":"t1"}'`),
  reply('✅ The payment is ready for you to approve.\n\nWant me to check the thread for her answer in a couple of hours and tell you when it arrives?'),
]

describe('openWait', () => {
  test('an offer to check later is an open wait, even when a loop is set', async () => {
    const wait = await openWait(invoiceRun, wakeUp)
    expect(wait).toEqual({ kind: 'offer', offer: 'Want me to check the thread for her answer in a couple of hours and tell you when it arrives?' })
  })

  test('outward connector calls with no wake-up are an open wait', async () => {
    const run = [...invoiceRun.slice(0, -1), reply('✅ Sent the email and drafted the transfer.')]
    expect(await openWait(run, noWakeUp)).toEqual({ kind: 'acted', actions: ['bank.transfers_create', 'mail.reply_to_thread'] })
  })

  test('outward calls with an active wake-up on the session are fine', async () => {
    const run = [...invoiceRun.slice(0, -1), reply('✅ Sent.')]
    expect(await openWait(run, wakeUp)).toBeNull()
  })

  test('a wake-up set in the run closes it without asking the API', async () => {
    let asked = false
    const run = [...invoiceRun.slice(0, -1), schedules('wake_on'), reply('⏳ I\'ll check the thread at 21:30.')]
    expect(await openWait(run, async () => ((asked = true), false))).toBeNull()
    expect(asked).toBe(false)
  })

  test('a loop set through the CLI closes it', async () => {
    const run = [...invoiceRun.slice(0, -1), bash(`kortix loop "check the reply" --in=2h --json`), reply('⏳ Set.')]
    expect(await openWait(run, noWakeUp)).toBeNull()
  })

  test('listing loops sets none', async () => {
    const run = [...invoiceRun.slice(0, -1), bash('kortix loops ls --json'), reply('✅ Sent.')]
    expect((await openWait(run, noWakeUp))?.kind).toBe('acted')
  })

  test('read-only connector calls and a plain answer leave nothing open', async () => {
    const run = [user('what is my balance?'), bash(`kortix connectors call bank balances_list '{}'`), reply('You have 3 accounts. Want me to break it down by currency?')]
    expect(await openWait(run, noWakeUp)).toBeNull()
  })

  test('a German offer counts', async () => {
    const run = [user('zahl das'), reply('Erledigt. Soll ich morgen nachschauen, ob sie geantwortet hat?')]
    expect((await openWait(run, noWakeUp))?.kind).toBe('offer')
  })

  test('only the current run counts', async () => {
    const earlier = [...invoiceRun.slice(0, -1), schedules('follow_up'), reply('⏳ Set.')]
    expect(runMessages([...earlier, user('thanks')])).toEqual([])
    expect(await openWait([...earlier, user('thanks'), reply('You are welcome.')], noWakeUp)).toBeNull()
  })

  test('outwardActions dedupes and keeps order', () => {
    expect(outwardActions([bash('kortix connectors call mail send_email {} && kortix connectors call mail send_email {}')])).toEqual(['mail.send_email'])
  })
})

describe('followThroughNote', () => {
  test('quotes the offer and tells the model to set the wake-up itself', () => {
    const note = followThroughNote({ kind: 'offer', offer: 'Want me to check later?' })
    expect(note).toContain('"Want me to check later?"')
    expect(note).toContain('kortix_schedules')
  })
})

describe('followThrough extension', () => {
  type Handler = (event: unknown) => unknown
  function load(applies = true) {
    const handlers = new Map<string, Handler>()
    const nudges: unknown[] = []
    const extension = followThrough({ applies: () => applies, hasWakeUp: noWakeUp, onNudge: (wait) => nudges.push(wait) })
    const factory = typeof extension === 'function' ? extension : extension.factory
    void factory({ on: (name: string, handler: Handler) => handlers.set(name, handler) } as never)
    const settle = (messages: unknown[]) =>
      handlers.get('agent_before_settle')!({ type: 'agent_before_settle', outcome: 'completed', continue: false, entries: [], context: { contextMessages: messages, canContinue: false } })
    return { handlers, nudges, settle }
  }

  test('continues once with a hidden note, then lets the run settle', async () => {
    const { handlers, nudges, settle } = load()
    const first = (await settle(invoiceRun)) as { continue: boolean; entries: { display: boolean; customType: string }[] }
    expect(first.continue).toBe(true)
    expect(first.entries[0]).toMatchObject({ type: 'custom_message', customType: 'kortix-follow-through', display: false })
    expect(await settle(invoiceRun)).toBeUndefined()
    expect(nudges).toHaveLength(1)
    handlers.get('agent_settled')!({ type: 'agent_settled', aborted: false })
    expect(((await settle(invoiceRun)) as { continue: boolean }).continue).toBe(true)
  })

  test('leaves a turn it does not apply to alone', async () => {
    expect(await load(false).settle(invoiceRun)).toBeUndefined()
  })
})
