// Status aplikasi + run langsung lewat SSE (/api/events).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PublicState, RunEvent, RunRecord, RunRequest } from "~/shared/types";
import { api, withToken } from "./api";

type Live = { runId: string | null; events: RunEvent[] };
type Ctx = {
  state: PublicState | null;
  setState: (s: PublicState) => void;
  live: Live;
  history: RunRecord[];
  reloadHistory: () => Promise<void>;
  run: (req: Omit<RunRequest, "trigger">) => Promise<string>;
  stop: () => Promise<void>;
  connected: boolean;
};

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => useContext(AppCtx)!;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PublicState | null>(null);
  const [live, setLive] = useState<Live>({ runId: null, events: [] });
  const [history, setHistory] = useState<RunRecord[]>([]);
  const [connected, setConnected] = useState(false);

  const reloadHistory = useCallback(async () => { setHistory(await api<RunRecord[]>("/api/history")); }, []);

  useEffect(() => {
    void reloadHistory();
    const es = new EventSource(withToken("/api/events"));
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.addEventListener("state", (m) => {
      setState(JSON.parse((m as MessageEvent).data));
      void reloadHistory();
    });
    es.addEventListener("run", (m) => {
      const { runId, e } = JSON.parse((m as MessageEvent).data) as { runId: string; e: RunEvent };
      setLive((cur) => cur.runId === runId ? { runId, events: [...cur.events, e].slice(-3000) } : { runId, events: [e] });
    });
    return () => es.close();
  }, [reloadHistory]);

  const value = useMemo<Ctx>(() => ({
    state, setState, live, history, reloadHistory, connected,
    run: async (req) => (await api<{ runId: string }>("/api/run", req)).runId,
    stop: async () => { await api("/api/stop", {}); },
  }), [state, live, history, reloadHistory, connected]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
