import { describe, expect, test } from 'bun:test';

import { buildFileRefsBlock as webBuildFileRefsBlock } from '../../../../packages/ui/src/internal/lib/project-preamble';
import { parseUserMessageText } from '../session/user-message';
import { artifactChatLabel, artifactChatPrompt, attachedArtifactState } from './artifact-chat';

const ARTIFACT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER = 'ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const detail = { artifact_id: ARTIFACT, path: 'artifacts/q3-plan', title: 'Q3 "plan" <draft>' };

describe('artifactChatPrompt', () => {
  test("is web's Ask AI first prompt: the words, then the artifact as a Referenced files block", () => {
    // apps/web features/artifacts/ask-agent-sheet.tsx `artifactPrompt`.
    expect(artifactChatPrompt('Summarise it', detail)).toBe(
      `Summarise it\n\n${webBuildFileRefsBlock([{ path: detail.path, name: detail.title }])}`,
    );
  });

  test('names the artifact by its Files path, attribute-escaped', () => {
    const prompt = artifactChatPrompt('hi', detail);
    expect(prompt).toContain('<file_ref path="artifacts/q3-plan" name="Q3 &quot;plan&quot; &lt;draft&gt;" />');
  });

  test('the transcript bubble shows only what the person typed', () => {
    expect(parseUserMessageText(artifactChatPrompt('Summarise it', detail)).text).toBe('Summarise it');
  });
});

describe('artifactChatLabel', () => {
  test("is web's label, so web's Ask AI history lists the session", () => {
    expect(artifactChatLabel(ARTIFACT)).toBe(`artifact:${ARTIFACT}`);
  });
});

describe('attachedArtifactState', () => {
  test('a read of the attached artifact is ready, with its current path and title', () => {
    expect(attachedArtifactState(ARTIFACT, { data: detail, isError: false })).toEqual({
      status: 'ready',
      context: { artifactId: ARTIFACT, path: detail.path, title: detail.title },
    });
  });

  test('no read yet is loading', () => {
    expect(attachedArtifactState(ARTIFACT, { data: undefined, isError: false })).toEqual({ status: 'loading' });
  });

  test("another artifact's cached read is not this one", () => {
    expect(attachedArtifactState(ARTIFACT, { data: { ...detail, artifact_id: OTHER }, isError: false })).toEqual({
      status: 'loading',
    });
  });

  test('a failed read is an error, even with an older read cached', () => {
    expect(attachedArtifactState(ARTIFACT, { data: undefined, isError: true })).toEqual({ status: 'error' });
    expect(attachedArtifactState(ARTIFACT, { data: detail, isError: true })).toEqual({ status: 'error' });
  });
});
