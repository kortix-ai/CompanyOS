/**
 * kortix_people: the people of this workspace — who is in it and with which
 * workspace role, invitations, and role changes. A workspace owner, admin or
 * manager may change them; anyone else gets a refusal that names who can.
 * A My Kortix platform tool (`platform.ts`): every action is one
 * `kortix access …` command.
 */
import { capRows, cliJson, cliRun, fail, memberName, membersHref, ok, projectRoster, cliArgProblem, workspaceRole, type PlatformToolContext } from './platform'

const TOOL = 'kortix_people' as const
const ACTIONS = ['list', 'invite', 'set_role', 'remove', 'pending'] as const
const ROLES = ['manager', 'member'] as const

function roleWord(member: Parameters<typeof workspaceRole>[0]): string {
  return workspaceRole(member) ?? 'no access'
}

async function list(context: PlatformToolContext) {
  const roster = await projectRoster(context)
  if (roster === null) {
    const read = await cliJson(['access', 'ls', '--json'], context)
    return fail(TOOL, 'list', 'Could not list the people', 'error' in read ? read.error : { kind: 'failed', message: 'No member list.' }, context)
  }
  const members = roster.filter((member) => workspaceRole(member) !== null)
  return ok(
    TOOL,
    'list',
    {
      title: members.length === 1 ? '1 person' : `${members.length} people`,
      rows: capRows(members.map((member) => ({ title: memberName(member), ...(member.email && member.email !== memberName(member) ? { detail: member.email } : {}), badge: roleWord(member) }))),
      links: [{ label: 'Members', href: membersHref(context.env) }],
    },
    members.map((member) => ({ user_id: member.user_id, name: memberName(member), email: member.email ?? null, role: roleWord(member) })),
  )
}

async function pending(context: PlatformToolContext) {
  // `{ pending: [{ invite_id, email, project_role, invite_expires_at, … }] }`
  const read = await cliJson<{ pending?: Array<{ invite_id?: string; email?: string; project_role?: string; invite_expires_at?: string }> } | unknown[]>(['access', 'pending', '--json'], context)
  if ('error' in read) return fail(TOOL, 'pending', 'Could not list the invitations', read.error, context)
  const invites = (Array.isArray(read.value) ? read.value : (read.value.pending ?? [])) as Array<{ email?: string; project_role?: string }>
  return ok(
    TOOL,
    'pending',
    {
      title: invites.length === 1 ? '1 open invitation' : `${invites.length} open invitations`,
      rows: invites.map((invite) => ({ title: invite.email ?? 'invitation', ...(invite.project_role ? { badge: invite.project_role } : {}) })),
      links: [{ label: 'Members', href: membersHref(context.env) }],
    },
    read.value,
  )
}

/** A member by user id, email or name, from the roster. */
async function resolveMember(who: string, context: PlatformToolContext) {
  const roster = (await projectRoster(context)) ?? []
  const needle = who.toLowerCase()
  return roster.find((m) => m.user_id === who || m.email?.toLowerCase() === needle || memberName(m).toLowerCase() === needle) ?? null
}

async function invite(email: string, role: string, context: PlatformToolContext) {
  // An open invitation is reused, never sent again: the API merges a second one into it
  // silently, so the card said "Invited" for a mail that never went out (evals invite-no-duplicate).
  const open = await cliJson<{ pending?: Array<{ email?: string; project_role?: string; invite_expired?: boolean }> }>(['access', 'pending', '--json'], context)
  const already = 'error' in open ? undefined : (open.value.pending ?? []).find((i) => i.email?.toLowerCase() === email.toLowerCase() && !i.invite_expired)
  if (already) {
    return ok(TOOL, 'invite', {
      title: `${email} already has an open invitation`,
      subtitle: `As ${already.project_role ?? 'member'}. Nothing new was sent.`,
      links: [{ label: 'Members', href: membersHref(context.env) }],
    }, { email, already_invited: true, role: already.project_role ?? null })
  }
  const sent = await cliJson<{ email_sent?: boolean; email_skip_reason?: string; invite_url?: string }>(['access', 'invite', email, '--role', role, '--json'], context)
  if ('error' in sent) return fail(TOOL, 'invite', `Could not invite ${email}`, sent.error, context)
  // No email provider (self-host, a failed send): the invitation exists, and its link is the only way in.
  if (sent.value.email_sent === false) {
    return ok(
      TOOL,
      'invite',
      {
        title: `Invited ${email}, but no email was sent`,
        subtitle: `As ${role}. Send them the invitation link yourself${sent.value.email_skip_reason ? ` (${sent.value.email_skip_reason})` : ''}.`,
        status: 'needs_you',
        links: [...(sent.value.invite_url ? [{ label: 'Invitation link', href: sent.value.invite_url }] : []), { label: 'Members', href: membersHref(context.env) }],
      },
      { email, role, email_sent: false, invite_url: sent.value.invite_url ?? null },
    )
  }
  return ok(TOOL, 'invite', {
    title: `Invited ${email}`,
    subtitle: `As ${role}. The invitation is valid for 14 days.`,
    links: [{ label: 'Members', href: membersHref(context.env) }],
  })
}

/** The open invitation for an email, when the person has not joined yet. */
async function openInvitation(who: string, context: PlatformToolContext) {
  if (!who.includes('@')) return null
  const open = await cliJson<{ pending?: Array<{ invite_id?: string; email?: string; project_role?: string; invite_expired?: boolean }> }>(['access', 'pending', '--json'], context)
  if ('error' in open) return null
  return (open.value.pending ?? []).find((i) => i.email?.toLowerCase() === who.toLowerCase() && !i.invite_expired && i.invite_id) ?? null
}

async function setRole(who: string, role: string, context: PlatformToolContext) {
  const member = await resolveMember(who, context)
  if (!member?.user_id) {
    // Someone invited but not joined yet: their role is the invitation's, so a new invitation replaces it
    // (Agent Evals on dev: set_role answered "not a member", invite answered "already invited", and the
    // role could not change through the tool at all).
    const pending = await openInvitation(who, context)
    if (pending?.invite_id) {
      const cancelled = await cliRun(['access', 'cancel', pending.invite_id], context)
      if ('error' in cancelled) return fail(TOOL, 'set_role', `Could not change ${who}'s invitation`, cancelled.error, context)
      const sent = await cliJson<{ email_sent?: boolean; invite_url?: string }>(['access', 'invite', who, '--role', role, '--json'], context)
      if ('error' in sent) return fail(TOOL, 'set_role', `Cancelled ${who}'s invitation, but could not send the new one`, sent.error, context)
      return ok(TOOL, 'set_role', {
        title: `${who}'s invitation is now as ${role}`,
        subtitle: sent.value.email_sent === false ? 'The old link no longer works, and no email went out: send them the new invitation link yourself.' : 'The old link no longer works; a new invitation email went out.',
        changes: [{ field: 'role', before: pending.project_role ?? 'member', after: role }],
        ...(sent.value.email_sent === false && sent.value.invite_url ? { status: 'needs_you' as const, links: [{ label: 'Invitation link', href: sent.value.invite_url }] } : { links: [{ label: 'Members', href: membersHref(context.env) }] }),
      }, { email: who, role, replaced_invitation: true })
    }
    return fail(TOOL, 'set_role', `Could not find ${who}`, { kind: 'not_found', message: `${who} is not a member of this workspace and has no open invitation.` }, context)
  }
  const done = await cliRun(['access', 'grant', member.user_id, '--role', role], context)
  if ('error' in done) return fail(TOOL, 'set_role', `Could not change ${memberName(member)}'s role`, done.error, context)
  return ok(TOOL, 'set_role', {
    title: `${memberName(member)} is now ${role}`,
    changes: [{ field: 'role', before: roleWord(member), after: role }],
    links: [{ label: 'Members', href: membersHref(context.env) }],
  })
}

async function remove(who: string, context: PlatformToolContext) {
  const member = await resolveMember(who, context)
  if (!member?.user_id) {
    // Not joined yet: removing them withdraws the open invitation.
    const pending = await openInvitation(who, context)
    if (pending?.invite_id) {
      const cancelled = await cliRun(['access', 'cancel', pending.invite_id], context)
      if ('error' in cancelled) return fail(TOOL, 'remove', `Could not cancel ${who}'s invitation`, cancelled.error, context)
      return ok(TOOL, 'remove', { title: `Cancelled ${who}'s invitation`, subtitle: 'Its link no longer works.', links: [{ label: 'Members', href: membersHref(context.env) }] }, { email: who, cancelled_invitation: true })
    }
    return fail(TOOL, 'remove', `Could not find ${who}`, { kind: 'not_found', message: `${who} is not a member of this workspace and has no open invitation.` }, context)
  }
  const done = await cliRun(['access', 'revoke', member.user_id], context)
  if ('error' in done) return fail(TOOL, 'remove', `Could not remove ${memberName(member)}`, done.error, context)
  return ok(TOOL, 'remove', { title: `Removed ${memberName(member)} from the workspace`, links: [{ label: 'Members', href: membersHref(context.env) }] })
}

export default {
  description:
    'The people of this workspace and their workspace roles (owner > admin > manager > member; owners, admins and managers manage it). ' +
    'Actions: `list`; `pending` (open invitations); `invite` (email, role); `set_role` (who: email, name or user id; role; for someone invited but not joined, it replaces the invitation with one in the new role); `remove` (who; for someone invited but not joined, it cancels the invitation). ' +
    'Inviting, changing a role and removing someone affect another person: say what will happen and ask once before you do it.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: [...ACTIONS], description: 'What to do.' },
      email: { type: 'string', description: 'For invite: their email address.' },
      who: { type: 'string', description: 'For set_role and remove: an email, a name or a user id.' },
      role: { type: 'string', enum: [...ROLES], description: 'For invite and set_role. Default member.' },
    },
    required: ['action'],
  },
  async execute(args: Record<string, any>, context: PlatformToolContext) {
    const action = String(args.action ?? '')
    const role = (ROLES as readonly string[]).includes(args.role) ? String(args.role) : 'member'
    const text = (key: string) => (typeof args[key] === 'string' ? args[key].trim() : '')
    if (action === 'list') return list(context)
    if (action === 'pending') return pending(context)
    const badEmail = action === 'invite' && text('email') ? cliArgProblem('email', text('email')) : null
    if (badEmail) return fail(TOOL, action, 'Who should I invite?', { kind: 'invalid', message: badEmail }, context)
    if (action === 'invite') return text('email') ? invite(text('email'), role, context) : fail(TOOL, action, 'Who should I invite?', { kind: 'invalid', message: 'Pass email.' }, context)
    if (action === 'set_role') return text('who') ? setRole(text('who'), role, context) : fail(TOOL, action, 'Whose role?', { kind: 'invalid', message: 'Pass who.' }, context)
    if (action === 'remove') return text('who') ? remove(text('who'), context) : fail(TOOL, action, 'Who should I remove?', { kind: 'invalid', message: 'Pass who.' }, context)
    return fail(TOOL, action, 'Unknown action', { kind: 'invalid', message: `Use one of: ${ACTIONS.join(', ')}.` }, context)
  },
}
