import { useEffect, useRef, useCallback } from "react";

type MessageHandler = (data: any) => void;

export function useRealtime(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  const connect = useCallback((activeRef: { current: boolean }) => {
    if (!activeRef.current) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(url);

    ws.onopen = () => {};
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        handlerRef.current(data);
      } catch {}
    };
    ws.onclose = () => {
      if (!activeRef.current) return;
      setTimeout(() => connect(activeRef), 3000);
    };
    wsRef.current = ws;
  }, []);

  useEffect(() => {
    const activeRef = { current: true };
    connect(activeRef);
    return () => {
      activeRef.current = false;
      wsRef.current?.close();
    };
  }, [connect]);
}
