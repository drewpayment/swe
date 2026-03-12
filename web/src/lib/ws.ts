"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getWsUrl } from "./config";

export interface StreamEvent {
  type: string;
  agent_id?: string;
  project_id?: string;
  [key: string]: unknown;
}

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(getWsUrl());

      ws.onopen = () => {
        setConnected(true);
        console.log("[WS] Connected");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as StreamEvent;
          setEvents((prev) => [...prev.slice(-100), data]); // Keep last 100 events
        } catch (e) {
          console.error("[WS] Failed to parse message:", e);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        console.log("[WS] Disconnected, reconnecting in 5s...");
        reconnectTimeoutRef.current = setTimeout(connect, 5000);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    } catch {
      console.error("[WS] Failed to connect");
      reconnectTimeoutRef.current = setTimeout(connect, 5000);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [connect]);

  const sendMessage = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { connected, events, sendMessage };
}
