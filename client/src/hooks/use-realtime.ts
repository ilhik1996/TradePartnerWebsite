import { useEffect, useRef, useCallback } from "react";

type MessageHandler = (data: any) => void;

export function useRealtime(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  const connect = useCallback(() => {
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
      // Reconnect after 3s on unexpected close
      setTimeout(() => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) connect();
      }, 3000);
    };
    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);
}
