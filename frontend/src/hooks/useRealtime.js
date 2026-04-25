import { useEffect, useRef } from 'react'

/**
 * useRealtime — subscribes to the backend's WebSocket and dispatches each
 * server event to a handler. Auto-reconnects with exponential backoff.
 *
 * Usage:
 *   useRealtime({
 *     'transaction.new': (data) => { ... },
 *     'fraud.alert':    (data) => { ... },
 *   })
 */
export default function useRealtime(handlers) {
  // Store handlers in a ref so we don't tear the socket down on every render.
  const handlersRef = useRef(handlers)
  useEffect(() => { handlersRef.current = handlers }, [handlers])

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return

    let ws = null
    let reconnectTimer = null
    let pingInterval = null
    let attempt = 0
    let stopped = false

    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const url = `${proto}//${window.location.host}/api/ws?token=${encodeURIComponent(token)}`

      try {
        ws = new WebSocket(url)
      } catch (e) {
        scheduleReconnect()
        return
      }

      ws.onopen = () => {
        attempt = 0
        // Keep-alive ping every 25s so proxies don't kill the connection.
        pingInterval = setInterval(() => {
          try { ws?.readyState === 1 && ws.send('ping') } catch {}
        }, 25_000)
      }

      ws.onmessage = (ev) => {
        try {
          if (ev.data === 'pong') return
          const msg = JSON.parse(ev.data)
          const fn = handlersRef.current?.[msg.event]
          if (fn) fn(msg.data)
          const wildcard = handlersRef.current?.['*']
          if (wildcard) wildcard(msg)
        } catch { /* ignore non-JSON */ }
      }

      ws.onclose = () => {
        if (pingInterval) clearInterval(pingInterval)
        if (!stopped) scheduleReconnect()
      }
      ws.onerror = () => { try { ws?.close() } catch {} }
    }

    const scheduleReconnect = () => {
      if (stopped) return
      const delay = Math.min(1000 * 2 ** attempt, 15_000)
      attempt += 1
      reconnectTimer = setTimeout(connect, delay)
    }

    connect()

    return () => {
      stopped = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (pingInterval)   clearInterval(pingInterval)
      try { ws?.close() } catch {}
    }
  }, [])
}
