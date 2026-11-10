/**
 * RUN-7's own manifest. No repository checkout at boot (#12136): a session's
 * `/workspace` only carries the project when its agent declares the clone
 * (#12262). The host `commit-push` needs it, so this flow's worker adds
 * exactly that; the default seeded worker stays clone-free.
 */
export const RUN7_YAML = [
  'default_agent: worker',
  'agents:',
  '  worker:',
  '    description: General-purpose worker; its session starts with the project at /workspace.',
  '    mode: primary',
  '    prompt: Reply with exactly the marker the user asks for and nothing else. Follow the user instructions exactly.',
  '    tools: "*"',
  '    skills: "*"',
  '    kortix_permissions: all',
  '    workspace:',
  '      repos:',
  '        - path: /workspace',
  '',
].join('\n');
