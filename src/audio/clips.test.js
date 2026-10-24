import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import LINES from './lines.json';
import { allClipIds } from '../game/engine';

const AUDIO = path.resolve(__dirname, '../../public/audio');

describe('narrator clip files', () => {
  it('every clip the game can play has a caption line', () => {
    allClipIds().forEach((id) => expect(LINES[id], id).toBeTypeOf('string'));
  });

  for (const voice of ['george', 'heart']) {
    it(`every line has a non-empty mp3 for ${voice}`, () => {
      Object.keys(LINES).forEach((id) => {
        const f = path.join(AUDIO, voice, `${id}.mp3`);
        expect(fs.existsSync(f), f).toBe(true);
        expect(fs.statSync(f).size, f).toBeGreaterThan(1000);
      });
    });
  }
});
