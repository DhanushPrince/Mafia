import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import LINES from './lines.json';
import LINES_TA from './lines.ta.json';
import { allClipIds } from '../game/engine';

const AUDIO = path.resolve(__dirname, '../../public/audio');

describe('narrator clip files', () => {
  it('every clip the game can play has a caption line', () => {
    allClipIds().forEach((id) => expect(LINES[id], id).toBeTypeOf('string'));
  });

  it('every English line has a Tamil line (and nothing extra)', () => {
    expect(Object.keys(LINES_TA).sort()).toEqual(Object.keys(LINES).sort());
    Object.entries(LINES_TA).forEach(([id, ta]) => {
      expect(ta, id).toMatch(/[\u0B80-\u0BFF]/); // Tamil script
      expect(ta.trim().length, id).toBeGreaterThan(2);
    });
  });

  it('Tamil name sentences split around the name like the English ones (prefix + name + suffix)', () => {
    expect(LINES_TA.killed_post).toBe('உயிர் பிழைக்கல.');
    expect(LINES_TA.killed_pre).toMatch(/\.$/);
    expect(LINES_TA.voted_out_pre).toMatch(/\.$/);
    expect(LINES_TA.voted_out_post).toMatch(/\.$/);
  });

  for (const voice of ['george', 'heart', 'ta_rasa', 'ta_jaya']) {
    it(`every line has a non-empty mp3 for ${voice}`, () => {
      Object.keys(LINES).forEach((id) => {
        const f = path.join(AUDIO, voice, `${id}.mp3`);
        expect(fs.existsSync(f), f).toBe(true);
        expect(fs.statSync(f).size, f).toBeGreaterThan(1000);
      });
    });
  }
});
