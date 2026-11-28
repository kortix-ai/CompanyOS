import { describe, expect, test } from 'bun:test';

import { artifactChatLabel, artifactChatPrompt } from '@/lib/artifacts/artifact-chat';
import { newSessionCreateInput } from './new-session-input';
import { promptParts } from './prompt-parts';

const filePart = {
  type: 'file' as const,
  attachment_id: '11111111-1111-1111-1111-111111111111',
  mime: 'image/jpeg',
  filename: 'photo_1.jpg',
};

const picks = { model: { providerID: 'kortix', modelID: 'model-a' }, variant: 'high' };

const base = { text: 'hi', fileParts: [], fileNames: [], model: null, picks: null, agent: null };

describe('newSessionCreateInput', () => {
  test('sends the client session_id when given', () => {
    expect(newSessionCreateInput({ ...base, sessionId: 'ses_1' }).session_id).toBe('ses_1');
    expect('session_id' in newSessionCreateInput(base)).toBe(false);
  });

  test('files go in pending_prompt.parts with attachment_names', () => {
    const input = newSessionCreateInput({ ...base, fileParts: [filePart], fileNames: ['photo_1.jpg'] });
    expect(input.pending_prompt?.parts).toEqual(promptParts('hi', [filePart]));
    expect(input.pending_prompt?.attachment_names).toEqual(['photo_1.jpg']);
    expect(input.pending_prompt?.model).toBeNull();
    expect(input.pending_prompt?.variant).toBeNull();
    expect(input.initial_prompt).toBeUndefined();
  });

  test('files carry the picked model and level', () => {
    const input = newSessionCreateInput({
      ...base,
      fileParts: [filePart],
      fileNames: ['photo_1.jpg'],
      picks,
      agent: 'build',
    });
    expect(input.pending_prompt?.model).toEqual(picks.model);
    expect(input.pending_prompt?.variant).toBe('high');
    expect(input.pending_prompt?.agent).toBe('build');
  });

  test('image only builds parts without a text part', () => {
    const input = newSessionCreateInput({ ...base, text: '', fileParts: [filePart], fileNames: ['photo_1.jpg'] });
    expect(input.pending_prompt?.parts?.length).toBe(1);
    expect(input.pending_prompt?.text).toBe('');
  });

  test('text with picks keeps pending_prompt without parts', () => {
    const input = newSessionCreateInput({ ...base, picks });
    expect(input.pending_prompt).toEqual({ text: 'hi', agent: null, model: picks.model, variant: 'high' });
    expect(input.pending_prompt?.parts).toBeUndefined();
    expect(input.initial_prompt).toBeUndefined();
  });

  test('plain text keeps initial_prompt', () => {
    const input = newSessionCreateInput(base);
    expect(input.initial_prompt).toBe('hi');
    expect(input.pending_prompt).toBeUndefined();
  });

  test('model and agent map to model (plus its pre-W4 name) and agent_name', () => {
    const input = newSessionCreateInput({ ...base, model: 'kortix/model-a', agent: 'build' });
    expect(input.model).toBe('kortix/model-a');
    expect(input.model).toBe('kortix/model-a');
    expect(input.agent_name).toBe('build');
    const bare = newSessionCreateInput(base);
    expect('model' in bare).toBe(false);
    expect('model' in bare).toBe(false);
    expect('agent_name' in bare).toBe(false);
  });

  describe('an artifact chat (Ask AI)', () => {
    const artifact = { artifactId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', path: 'artifacts/q3-plan', title: 'Q3 plan' };
    const prompt = artifactChatPrompt('hi', artifact);

    test('plain text carries the artifact in initial_prompt and the artifact label', () => {
      const input = newSessionCreateInput({ ...base, artifact });
      expect(input.initial_prompt).toBe(prompt);
      expect(input.labels).toEqual([artifactChatLabel(artifact.artifactId)]);
    });

    test('a picked level carries the artifact in pending_prompt.text', () => {
      const input = newSessionCreateInput({ ...base, picks, artifact });
      expect(input.pending_prompt?.text).toBe(prompt);
      expect(input.initial_prompt).toBeUndefined();
    });

    test('files carry the artifact in the text part', () => {
      const input = newSessionCreateInput({ ...base, fileParts: [filePart], fileNames: ['photo_1.jpg'], artifact });
      expect(input.pending_prompt?.parts).toEqual(promptParts(prompt, [filePart]));
    });

    test('no artifact: no label, the text as typed', () => {
      const input = newSessionCreateInput({ ...base, artifact: null });
      expect(input.initial_prompt).toBe('hi');
      expect('labels' in input).toBe(false);
    });
  });
});
