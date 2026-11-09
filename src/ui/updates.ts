/**
 * Keeping an installed app up to date.
 *
 * A fixed service-worker cache name used to make deployments invisible; that
 * is fixed. But a changed worker only ever arrives if the browser goes looking
 * for it, and Chrome does not reliably check when a home-screen app is merely
 * brought back to the foreground — which is why updates appeared to require
 * uninstalling and reinstalling the app. So we ask explicitly, on load and
 * every time the app becomes visible again.
 *
 * The worker calls `skipWaiting` on install, so a new one takes over straight
 * away and `controllerchange` fires. At that point the page is still running
 * the *old* code: only a reload picks up the new modules. Deciding when to
 * reload is the caller's business — never while a drone is connected.
 */

export type UpdateWatcher = {
  /** Called once a newly installed worker has taken over this page. */
  onReady(listener: () => void): void;
  /** True once an update is waiting for a reload. */
  readonly ready: boolean;
  /** Reloads so the new modules actually run. */
  apply(): void;
  /** Build id of the worker serving this page, or null if unknown. */
  version(): Promise<string | null>;
};

const VERSION_TIMEOUT_MS = 1000;

export function watchForUpdates(): UpdateWatcher {
  const listeners: (() => void)[] = [];
  let ready = false;
  let applying = false;

  if (!('serviceWorker' in navigator)) {
    return {
      onReady: () => {},
      get ready() {
        return false;
      },
      apply: () => {},
      version: async () => null,
    };
  }

  // A page with no controller is on its first install: the worker taking over
  // then replaces nothing, and reloading would be pointless churn.
  const hadController = navigator.serviceWorker.controller !== null;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || ready) return;
    ready = true;
    for (const listener of listeners) listener();
  });

  void navigator.serviceWorker.ready.then((registration) => {
    const check = (): void => {
      void registration.update().catch(() => undefined);
    };

    check();
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) check();
    });
  });

  return {
    onReady(listener) {
      listeners.push(listener);
      if (ready) listener();
    },

    get ready() {
      return ready;
    },

    apply() {
      if (applying) return;
      applying = true;
      window.location.reload();
    },

    async version() {
      // On a first load the worker has not claimed the page yet, so asking
      // immediately would always answer "unknown".
      if (!navigator.serviceWorker.controller) {
        await navigator.serviceWorker.ready.catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      const controller = navigator.serviceWorker.controller;
      if (!controller) return null;

      return new Promise<string | null>((resolve) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => resolve(null), VERSION_TIMEOUT_MS);

        channel.port1.onmessage = (event: MessageEvent) => {
          clearTimeout(timer);
          const data = event.data as { version?: unknown } | null;
          resolve(typeof data?.version === 'string' ? data.version : null);
        };

        controller.postMessage({ type: 'version' }, [channel.port2]);
      });
    },
  };
}
