// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import VideoGrid from './VideoGrid.jsx';

afterEach(cleanup);

const stream = (kinds = ['audio', 'video']) => ({
  id: Math.random(),
  getVideoTracks: () => kinds.filter((k) => k === 'video'),
  getAudioTracks: () => kinds.filter((k) => k === 'audio'),
});
const view = {
  you: 'b',
  hostSeat: 'a',
  members: [
    { seat: 'a', name: 'Arjun', connected: true, spectator: false },
    { seat: 'b', name: 'Priya', connected: true, spectator: false },
    { seat: 'c', name: 'Karthik', connected: false, spectator: false },
    { seat: 'd', name: 'Watcher', connected: true, spectator: true },
  ],
};
const tiles = () => screen.getAllByTestId('video-tile');
const tile = (name) => tiles().find((t) => t.dataset.name === name);

describe('VideoGrid', () => {
  it('shows own tile first, then the other seated players; hides spectators', () => {
    render(<VideoGrid view={view} local={stream()} remotes={{}} media={{ cam: true, mic: true }} asleep={false} deadSeats={new Set()} />);
    expect(tiles().map((t) => t.dataset.name)).toEqual(['Priya', 'Arjun', 'Karthik']);
    expect(tile('Priya').textContent).toContain('Priya (you)');
  });

  it('a spectator still sees their own tile', () => {
    render(<VideoGrid view={{ ...view, you: 'd' }} local={null} remotes={{}} media={{ cam: true, mic: true }} asleep={false} deadSeats={new Set()} />);
    expect(tiles()[0].dataset.name).toBe('Watcher');
  });

  it('marks tiles live only with a stream and the camera on; attaches the stream to <video>', () => {
    const local = stream();
    const remote = stream();
    render(
      <VideoGrid
        view={view}
        local={local}
        remotes={{ a: { stream: remote, media: { cam: true, mic: true } }, c: { stream: stream(), media: { cam: true, mic: true } } }}
        media={{ cam: true, mic: true }}
        asleep={false}
        deadSeats={new Set()}
      />,
    );
    expect(tile('Priya').dataset.live).toBe('1');
    expect(tile('Arjun').dataset.live).toBe('1');
    expect(tile('Karthik').dataset.live).toBe('0'); // offline
    expect(tile('Arjun').querySelector('video').srcObject).toBe(remote);
    const own = tile('Priya').querySelector('video');
    expect(own.srcObject).toBe(local);
    expect(own.muted).toBe(true); // never play your own mic back
    expect(tile('Arjun').querySelector('video').muted).toBe(false);
  });

  it('camera off (own or remote) shows the initial instead of the picture', () => {
    render(
      <VideoGrid view={view} local={stream(['audio'])} remotes={{ a: { stream: stream(), media: { cam: false, mic: false } } }} media={{ cam: true, mic: true }} asleep={false} deadSeats={new Set()} />,
    );
    expect(tile('Priya').dataset.live).toBe('0'); // no video track
    expect(tile('Arjun').dataset.live).toBe('0');
    expect(tile('Arjun').textContent).toMatch(/^A/);
  });

  it('at night every tile sleeps; dead players get the skull overlay', () => {
    render(
      <VideoGrid view={view} local={stream()} remotes={{ a: { stream: stream(), media: { cam: true, mic: true } } }} media={{ cam: false, mic: false }} asleep deadSeats={new Set(['a'])} />,
    );
    expect(tiles().every((t) => t.dataset.live === '0')).toBe(true);
    expect(tile('Arjun').querySelector('.lucide-skull')).not.toBeNull();
    expect(tile('Priya').querySelector('.lucide-skull')).toBeNull();
    expect(tile('Priya').querySelector('.lucide-moon')).not.toBeNull();
    expect(tile('Karthik').querySelector('.lucide-wifi-off')).not.toBeNull();
    expect(tile('Arjun').querySelector('.lucide-crown')).not.toBeNull();
  });
});
