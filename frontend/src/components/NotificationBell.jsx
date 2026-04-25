import { useEffect, useRef, useState } from 'react'
import { notificationsAPI } from '../services/api'
import useRealtime from '../hooks/useRealtime'
import './NotificationBell.css'

const fmtDate = (d) => new Date(d).toLocaleString('en-US', {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
})

const CATEGORY_ICON = {
  info:    '🔔',
  success: '✅',
  warning: '⚠️',
  danger:  '⛔',
}

export default function NotificationBell() {
  const [items, setItems]   = useState([])
  const [open, setOpen]     = useState(false)
  const popRef = useRef(null)

  const load = async () => {
    try {
      const { data } = await notificationsAPI.list(30)
      setItems(data)
    } catch (e) { /* silent */ }
  }

  useEffect(() => { load() }, [])

  // Close when clicking outside
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Real-time push: a new notification arrives → prepend to list
  useRealtime({
    'notification': (data) => {
      setItems((prev) => [{
        id: data.id,
        subject: data.subject,
        body: data.body,
        category: data.category || 'info',
        is_read: false,
        email_sent: false,
        created_at: data.created_at,
      }, ...prev].slice(0, 50))
    },
  })

  const unread = items.filter(n => !n.is_read).length

  const handleOpen = async () => {
    const next = !open
    setOpen(next)
    if (next && unread > 0) {
      try {
        await notificationsAPI.markRead()
        setItems((prev) => prev.map(n => ({ ...n, is_read: true })))
      } catch {}
    }
  }

  return (
    <div className="bell-wrap" ref={popRef}>
      <button
        className="bell-btn"
        onClick={handleOpen}
        aria-label="Notifications"
        title="Notifications"
      >
        🔔
        {unread > 0 && <span className="bell-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="bell-pop card">
          <div className="bell-head">
            <h4>Notifications</h4>
            <span className="text-2" style={{ fontSize: '0.78rem' }}>{items.length} total</span>
          </div>
          <div className="bell-list">
            {items.length === 0 ? (
              <div className="bell-empty">You're all caught up.</div>
            ) : items.map(n => (
              <div key={n.id} className={`bell-item bell-cat-${n.category || 'info'}`}>
                <div className="bell-icon">{CATEGORY_ICON[n.category] || '🔔'}</div>
                <div className="bell-body">
                  <div className="bell-subject">{n.subject}</div>
                  <div className="bell-text">{n.body.split('\n').slice(0, 2).join(' ')}</div>
                  <div className="bell-meta">
                    <span>{fmtDate(n.created_at)}</span>
                    {n.email_sent && <span className="bell-tag">📧 emailed</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
