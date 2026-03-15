"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getWsUrl } from "./config";

export interface StreamEvent {
  type: string;
  agent_id?: string;
  project_id?: string;
  [key: string]: unknown;
}

const WS_INITIAL_DELAY = 1000;
const WS_MAX_DELAY = 30000;
const WS_MAX_RETRIES = 20;

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const retryDelayRef = useRef(WS_INITIAL_DELAY);

  useEffect(() => {
    function connect() {
      if (retryCountRef.current >= WS_MAX_RETRIES) {
        console.error("[WS] Max retries reached, giving up");
        return;
      }

      try {
        const ws = new WebSocket(getWsUrl());

        ws.onopen = () => {
          setConnected(true);
          retryCountRef.current = 0;
          retryDelayRef.current = WS_INITIAL_DELAY;
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as StreamEvent;
            setEvents((prev) => [...prev.slice(-100), data]);
          } catch (e) {
            console.error("[WS] Failed to parse message:", e);
          }
        };

        ws.onclose = () => {
          setConnected(false);
          retryCountRef.current += 1;
          const delay = retryDelayRef.current;
          retryDelayRef.current = Math.min(delay * 2, WS_MAX_DELAY);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        };

        ws.onerror = () => {
          ws.close();
        };

        wsRef.current = ws;
      } catch {
        console.error("[WS] Failed to connect");
        retryCountRef.current += 1;
        const delay = retryDelayRef.current;
        retryDelayRef.current = Math.min(delay * 2, WS_MAX_DELAY);
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      }
    }

    connect();
    return () => {
      wsRef.current?.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, []);

  const sendMessage = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { connected, events, sendMessage };
}
