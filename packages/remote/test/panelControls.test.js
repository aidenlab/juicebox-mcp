import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { attachRemote } from '../src/attachRemote.js';
import { FakeSocket, fakeHic } from './fakeJuicebox.js';

// The Juicebox Panel Controls (juicebox.js's navbar): one switch for the whole page,
// set by the model's command and by hand, kept the same on every page in the room (ADR-0009).

const container = {};
const syncEventsOf = (socket) => socket.sent.filter((m) => m.type === 'syncEvent');
const ackOf = (socket, requestId) => socket.sent.find((m) => m.type === 'ack' && m.requestId === requestId);

async function joined(hic) {
  attachRemote({ hic, container, url: 'wss://jbmcp.example/ws', room: 'r', createSocket: (u) => new FakeSocket(u) });
  await Promise.resolve(); // the first connect is deferred to a microtask
  const socket = FakeSocket.instances.at(-1);
  socket.open();
  socket.receive({ type: 'joined', room: 'r' });
  return socket;
}

/** Let queued applies finish. */
async function settle() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}

beforeEach(() => {
  FakeSocket.instances = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('panel controls: the setPanelControlsVisible command', () => {
  it('{show: false} hides them on the whole page and says so; no sync event goes out', async () => {
    const hic = fakeHic({ panels: 3 });
    const socket = await joined(hic);

    socket.receive({ type: 'setPanelControlsVisible', requestId: 'c1', show: false });
    await settle();

    expect(hic.isNavbarVisible()).toBe(false);
    expect(ackOf(socket, 'c1')).toEqual({ type: 'ack', requestId: 'c1', ok: true, result: 'Juicebox Panel Controls hidden on 3 panels' });
    expect(syncEventsOf(socket)).toEqual([]);
  });

  it('{show: true} restores them, and repeating a call changes nothing', async () => {
    const hic = fakeHic();
    const socket = await joined(hic);

    socket.receive({ type: 'setPanelControlsVisible', requestId: 'c1', show: false });
    socket.receive({ type: 'setPanelControlsVisible', requestId: 'c2', show: false });
    await settle();
    expect(hic.isNavbarVisible()).toBe(false);
    expect(ackOf(socket, 'c2').result).toBe('Juicebox Panel Controls hidden on 1 panel');

    socket.receive({ type: 'setPanelControlsVisible', requestId: 'c3', show: true });
    await settle();
    expect(hic.isNavbarVisible()).toBe(true);
    expect(ackOf(socket, 'c3').result).toBe('Juicebox Panel Controls shown on 1 panel');
    expect(syncEventsOf(socket)).toEqual([]);
  });

  it('a page whose juicebox.js has no setNavbarVisible (before 4.12.0) fails the command', async () => {
    const socket = await joined(fakeHic({ navbar: false }));

    socket.receive({ type: 'setPanelControlsVisible', requestId: 'c1', show: false });
    await settle();

    expect(ackOf(socket, 'c1')).toMatchObject({ ok: false, error: expect.stringContaining('4.12.0') });
  });
});

describe('panel controls: getPanelList', () => {
  it('says whether they are shown, beside the panels', async () => {
    const hic = fakeHic({ panels: 2 });
    const socket = await joined(hic);
    hic.setNavbarVisible(false);

    socket.receive({ type: 'getPanelList', requestId: 'c1' });
    await settle();

    const { result } = ackOf(socket, 'c1');
    expect(result.panelControlsVisible).toBe(false);
    expect(result.panels.map((p) => p.panel)).toEqual([1, 2]);
  });
});

describe('panel controls: pages in a room agree (a page-wide sync event)', () => {
  const relay = (from, to) => syncEventsOf(from).forEach((event) => to.receive(event));

  it('hiding them by hand sends panelControlsChange {visible}, which names no panel', async () => {
    const hic = fakeHic({ panels: 2 });
    const socket = await joined(hic);

    hic.setNavbarVisible(false); // the Header button

    expect(syncEventsOf(socket)).toEqual([{ type: 'syncEvent', syncType: 'panelControlsChange', visible: false }]);
  });

  it('a peer hides and shows them on its whole page, and echoes nothing back', async () => {
    const a = fakeHic({ panels: 2 });
    const b = fakeHic({ panels: 3 });
    const socketA = await joined(a);
    const socketB = await joined(b);

    a.setNavbarVisible(false);
    relay(socketA, socketB);
    await settle();
    expect(b.isNavbarVisible()).toBe(false);

    socketA.sent.length = 0;
    a.setNavbarVisible(true);
    relay(socketA, socketB);
    await settle();
    expect(b.isNavbarVisible()).toBe(true);
    expect(syncEventsOf(socketB)).toEqual([]);
    expect(b.browsers.map((browser) => browser.setNormalization.mock.calls.length)).toEqual([0, 0, 0]); // no panel touched
  });

  it('a page whose juicebox.js has no setNavbarVisible drops it, and later sync events still apply', async () => {
    const hic = fakeHic({ navbar: false });
    const socket = await joined(hic);

    socket.receive({ type: 'syncEvent', syncType: 'panelControlsChange', visible: false });
    socket.receive({ type: 'syncEvent', syncType: 'normalizationChange', panel: 1, normalization: 'VC' });
    await settle();

    expect(hic.current.setNormalization).toHaveBeenCalledWith('VC');
  });

  it('a page joining a room whose controls are hidden opens with them hidden, and sends nothing for it', async () => {
    const hic = fakeHic();
    const socket = await joined(hic);

    socket.receive({ type: 'peerSessionData', session: { browsers: [{ url: 'https://maps.example/room.hic' }], navbarVisible: false } });
    await settle();

    expect(hic.isNavbarVisible()).toBe(false);
    expect(syncEventsOf(socket)).toEqual([]);
  });

  it('a page that hid them, joining a room whose session shows them, shows them', async () => {
    const hic = fakeHic();
    hic.setNavbarVisible(false);
    const socket = await joined(hic);
    socket.sent.length = 0;

    socket.receive({ type: 'peerSessionData', session: { browsers: [{ url: 'https://maps.example/room.hic' }], navbarVisible: true } });
    await settle();

    expect(hic.isNavbarVisible()).toBe(true);
    expect(syncEventsOf(socket)).toEqual([]);
  });

  it('the session the page saves to the room records them hidden', async () => {
    const hic = fakeHic();
    const socket = await joined(hic);
    socket.receive({ type: 'setPanelControlsVisible', requestId: 'c1', show: false });
    await settle();

    socket.receive({ type: 'getSession', requestId: 'c2' });
    await settle();

    expect(ackOf(socket, 'c2').result).toMatchObject({ navbarVisible: false });
  });
});
