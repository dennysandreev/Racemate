"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { LiveStore } from "../lib/store";
import type { LiveMessage, LiveSessionState } from "../lib/types";
const Context = createContext<LiveStore | null>(null);
export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => new LiveStore());
  useEffect(() => {
    let disposed = false,
      socket: WebSocket | null = null,
      retryTimer: ReturnType<typeof setTimeout>,
      attempt = 0,
      lastReceived = Date.now();
    const controller = new AbortController();
    const receive = (m: LiveMessage) => {
      lastReceived = Date.now();
      store.accept(m);
      store.setConnection(
        m.health?.sourceConnected === false ? "reconnecting" : "connected",
      );
    };
    const connect = async () => {
      if (disposed) return;
      const ticketResponse = await fetch("/api/live/ticket", { cache: "no-store", signal: controller.signal });
      if (!ticketResponse.ok) throw new Error("LIVE_TICKET_UNAVAILABLE");
      const { ticket } = await ticketResponse.json() as { ticket: string };
      if (disposed) return;
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws/live?ticket=${encodeURIComponent(ticket)}`,
      );
      socket.onmessage = (e) => {
        try {
          receive(JSON.parse(e.data));
          attempt = 0;
        } catch {
          socket?.close();
        }
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        if (disposed) return;
        store.setConnection(attempt > 3 ? "offline" : "reconnecting");
        retryTimer = setTimeout(
          () => void connect().catch(() => socket?.close()),
          Math.min(30000, 1000 * 2 ** attempt++) + Math.random() * 300,
        );
      };
    };
    // Hydration completes before opening the socket; the socket itself sends a
    // fresh snapshot so there is no snapshot/delta race or missed update window.
    void fetch("/api/live/snapshot", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        receive(await r.json());
      })
      .catch(() => {
        if (!disposed) store.setConnection("reconnecting");
      })
      .finally(() => {
        if (!disposed) void connect().catch(() => {
          store.setConnection("reconnecting");
          retryTimer = setTimeout(() => void connect().catch(() => socket?.close()), 1500);
        });
      });
    const watchdog = setInterval(() => {
      if (Date.now() - lastReceived > 12000) {
        store.setConnection("reconnecting");
        socket?.close();
      }
    }, 5000);
    return () => {
      disposed = true;
      controller.abort();
      clearInterval(watchdog);
      clearTimeout(retryTimer);
      socket?.close();
    };
  }, [store]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useLiveStore() {
  const store = useContext(Context);
  if (!store) throw new Error("LiveProvider required");
  return store;
}
export function useLive<K extends keyof LiveSessionState>(key: K) {
  const store = useLiveStore();
  return useSyncExternalStore(
    (fn) => store.subscribe(key, fn),
    () => store.state[key],
    () => store.state[key],
  );
}
export function useConnection() {
  const store = useLiveStore();
  return useSyncExternalStore(
    (fn) => store.subscribe("connection", fn),
    () => store.connection,
    () => store.connection,
  );
}
