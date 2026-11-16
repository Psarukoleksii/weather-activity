import { SchedulerRegistry } from '@nestjs/schedule';
import { RefreshPoller } from './refresh.poller';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('RefreshPoller shutdown', () => {
  const config = { getOrThrow: () => 60 };
  let poller: RefreshPoller;
  let refreshOne: jest.SpyInstance;
  let selectDuePlaces: jest.SpyInstance;

  beforeEach(() => {
    poller = new RefreshPoller({} as never, new SchedulerRegistry(), config as never);
    selectDuePlaces = jest.spyOn(poller as never, 'selectDuePlaces').mockResolvedValue([
      { id: '1', lastFetchedAt: null },
      { id: '2', lastFetchedAt: null },
      { id: '3', lastFetchedAt: null },
    ] as never);
    refreshOne = jest.spyOn(poller as never, 'refreshOne');
  });

  it('waits for the place being refreshed and leaves the rest of the batch', async () => {
    const first = deferred();
    refreshOne.mockImplementationOnce(() => first.promise).mockResolvedValue(undefined);

    const tick = poller.tick();
    await new Promise((r) => setImmediate(r)); // let the tick reach the first refresh

    let shutdownDone = false;
    const shutdown = poller.beforeApplicationShutdown().then(() => (shutdownDone = true));
    await new Promise((r) => setImmediate(r));
    expect(shutdownDone).toBe(false); // still waiting for place 1

    first.resolve();
    await shutdown;
    await tick;
    expect(refreshOne).toHaveBeenCalledTimes(1);
    expect(refreshOne).toHaveBeenCalledWith('1', null);
  });

  it('does not start new ticks after shutdown began', async () => {
    await poller.beforeApplicationShutdown();
    await poller.tick();
    expect(selectDuePlaces).not.toHaveBeenCalled();
  });

  it('does not run two ticks at once', async () => {
    const first = deferred();
    refreshOne.mockImplementationOnce(() => first.promise).mockResolvedValue(undefined);
    const a = poller.tick();
    const b = poller.tick();
    first.resolve();
    await Promise.all([a, b]);
    expect(selectDuePlaces).toHaveBeenCalledTimes(1);
    expect(refreshOne).toHaveBeenCalledTimes(3);
  });

  it('removes the interval on shutdown', async () => {
    const scheduler = new SchedulerRegistry();
    const p = new RefreshPoller({} as never, scheduler, config as never);
    jest.spyOn(p as never, 'tick').mockResolvedValue(undefined as never);
    p.onApplicationBootstrap();
    expect(scheduler.doesExist('interval', 'refresh-poller')).toBe(true);
    await p.beforeApplicationShutdown();
    expect(scheduler.doesExist('interval', 'refresh-poller')).toBe(false);
  });
});
