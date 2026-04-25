import { useState, useEffect, useCallback } from 'react'
import { adminAPI } from '../services/api'
import useRealtime from '../hooks/useRealtime'
import Layout from '../components/Layout'
import { DailyVolumeStack, TypeBreakdownPie, CountLine } from '../components/Charts'
import './Admin.css'

const fmt     = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
const fmtDate = (d) => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const SEVERITY_CLS = { info: 'badge-blue', warning: 'badge-yellow', critical: 'badge-red' }

export default function Admin() {
  const [stats, setStats]     = useState(null)
  const [users, setUsers]     = useState([])
  const [txns, setTxns]       = useState([])
  const [chart, setChart]     = useState({ daily_volume: [], txn_breakdown: [] })
  const [logs, setLogs]       = useState([])
  const [logSeverity, setLogSeverity] = useState('')
  const [conn, setConn]       = useState(null)
  const [tab, setTab]         = useState('overview')
  const [loading, setLoading] = useState(true)
  const [liveBadge, setLiveBadge] = useState(false)
  const [fraudAlerts, setFraudAlerts] = useState([])  // running list of recent fraud events

  const refresh = useCallback(async () => {
    try {
      const [s, u, t, c, conn] = await Promise.all([
        adminAPI.stats(),
        adminAPI.users(),
        adminAPI.transactions(),
        adminAPI.charts(7),
        adminAPI.connections(),
      ])
      setStats(s.data); setUsers(u.data); setTxns(t.data); setChart(c.data); setConn(conn.data)
    } catch (e) { console.error(e) }
  }, [])

  const loadLogs = useCallback(async (severity = logSeverity) => {
    try {
      const { data } = await adminAPI.auditLogs(150, severity || undefined)
      setLogs(data)
    } catch (e) { console.error(e) }
  }, [logSeverity])

  useEffect(() => {
    refresh().then(loadLogs).finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { loadLogs() }, [loadLogs])

  // Real-time: every txn / fraud / audit pushes a refresh.
  useRealtime({
    'transaction.new': () => {
      setLiveBadge(true); setTimeout(() => setLiveBadge(false), 1500)
      refresh()
    },
    'fraud.alert': (data) => {
      setFraudAlerts(prev => [{ ...data, ts: new Date().toISOString() }, ...prev].slice(0, 20))
      refresh()
    },
    'audit': () => loadLogs(),
    'account.created': () => refresh(),
  })

  if (loading) return (
    <Layout>
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
      </div>
    </Layout>
  )

  return (
    <Layout>
      <div className="admin-page fade-up">
        <div className="admin-header">
          <div>
            <h2>
              ⚡ Admin Dashboard
              {liveBadge && <span className="live-dot" title="Live">● live</span>}
            </h2>
            <p>System-wide overview, monitoring &amp; controls</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {conn && (
              <span className="badge badge-blue" title="Live WebSocket connections">
                {conn.total_connections} live · {conn.connected_admins} admins
              </span>
            )}
            <span className="badge badge-yellow" style={{ fontSize: '0.85rem', padding: '6px 14px' }}>Admin Panel</span>
          </div>
        </div>

        {/* Stats Grid */}
        {stats && (
          <div className="stats-grid">
            <div className="card stat-card">
              <span className="stat-icon">👤</span>
              <span className="stat-val">{stats.total_users}</span>
              <span className="stat-label">Total Users</span>
            </div>
            <div className="card stat-card">
              <span className="stat-icon">🏦</span>
              <span className="stat-val">{stats.total_accounts}</span>
              <span className="stat-label">Total Accounts</span>
            </div>
            <div className="card stat-card">
              <span className="stat-icon">📋</span>
              <span className="stat-val">{stats.total_transactions}</span>
              <span className="stat-label">Total Transactions</span>
            </div>
            <div className="card stat-card stat-highlight">
              <span className="stat-icon">💰</span>
              <span className="stat-val">{fmt(stats.total_balance_in_system)}</span>
              <span className="stat-label">Total Balance in System</span>
            </div>
            <div className="card stat-card" title={`Cache backend: ${stats.cache_backend}`}>
              <span className="stat-icon">⚠️</span>
              <span className="stat-val">{stats.flagged_transactions}</span>
              <span className="stat-label">Flagged Transactions</span>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="admin-tabs">
          <button className={`admin-tab ${tab === 'overview' ? 'admin-tab-active' : ''}`} onClick={() => setTab('overview')}>📈 Charts</button>
          <button className={`admin-tab ${tab === 'transactions' ? 'admin-tab-active' : ''}`} onClick={() => setTab('transactions')}>🧾 Transactions</button>
          <button className={`admin-tab ${tab === 'users' ? 'admin-tab-active' : ''}`} onClick={() => setTab('users')}>👥 Users</button>
          <button className={`admin-tab ${tab === 'audit' ? 'admin-tab-active' : ''}`} onClick={() => setTab('audit')}>📜 Audit Logs</button>
          <button className={`admin-tab ${tab === 'fraud' ? 'admin-tab-active' : ''}`} onClick={() => setTab('fraud')}>🛡️ Fraud {fraudAlerts.length > 0 && <span className="bell-dot" style={{ position: 'static', marginLeft: 6 }}>{fraudAlerts.length}</span>}</button>
        </div>

        {/* Charts Tab */}
        {tab === 'overview' && (
          <div className="dash-charts">
            <div className="card chart-card chart-wide">
              <div className="section-header"><h3>📊 Daily volume — last 7 days</h3></div>
              <DailyVolumeStack data={chart.daily_volume} />
            </div>
            <div className="card chart-card">
              <div className="section-header"><h3>💼 By transaction type</h3></div>
              <TypeBreakdownPie data={chart.txn_breakdown} />
            </div>
            <div className="card chart-card">
              <div className="section-header"><h3>📈 Transaction counts</h3></div>
              <CountLine data={chart.txn_breakdown} />
            </div>
          </div>
        )}

        {/* Transactions Tab */}
        {tab === 'transactions' && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h3>Recent Transactions ({txns.length})</h3>
            </div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Type</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Risk</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {txns.map(t => {
                  const isIn = t.transaction_type === 'deposit' || t.transaction_type === 'transfer_in'
                  return (
                    <tr key={t.id}>
                      <td className="mono cell-sm">{t.txn_id}</td>
                      <td>
                        <span className={`chip ${isIn ? 'chip-green' : 'chip-red'}`}>
                          {t.transaction_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="mono cell-sm">{t.from_account || '—'}</td>
                      <td className="mono cell-sm">{t.to_account || '—'}</td>
                      <td className={`mono fw ${isIn ? 'text-green' : 'text-red'}`}>{fmt(t.amount)}</td>
                      <td>
                        {t.status === 'flagged'
                          ? <span className="badge badge-yellow">flagged</span>
                          : <span className="badge badge-green">{t.status}</span>}
                      </td>
                      <td title={t.fraud_reasons?.join('; ') || ''}>
                        {t.fraud_score > 0
                          ? <span className={`badge ${t.fraud_score >= 80 ? 'badge-red' : 'badge-yellow'}`}>{t.fraud_score}</span>
                          : <span className="text-2 cell-sm">—</span>}
                      </td>
                      <td className="cell-sm">{fmtDate(t.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Users Tab */}
        {tab === 'users' && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h3>Registered Users ({users.length})</h3>
            </div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 500 }}>{u.full_name}</td>
                    <td className="mono cell-sm">@{u.username}</td>
                    <td className="cell-sm" style={{ color: 'var(--text-2)' }}>{u.email}</td>
                    <td><span className={`badge ${u.role === 'admin' ? 'badge-yellow' : 'badge-blue'}`}>{u.role}</span></td>
                    <td><span className={`badge ${u.is_active ? 'badge-green' : 'badge-red'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td className="cell-sm">{fmtDate(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Audit Logs Tab */}
        {tab === 'audit' && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <h3 style={{ marginRight: 'auto' }}>Audit Trail ({logs.length})</h3>
              {['', 'info', 'warning', 'critical'].map(s => (
                <button
                  key={s || 'all'}
                  className={`filter-btn ${logSeverity === s ? 'filter-active' : ''}`}
                  onClick={() => setLogSeverity(s)}
                >{s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}</button>
              ))}
            </div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Severity</th>
                  <th>Actor</th>
                  <th>Target</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && (
                  <tr><td colSpan="6" style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>No audit entries yet</td></tr>
                )}
                {logs.map(l => (
                  <tr key={l.id}>
                    <td className="cell-sm">{fmtDate(l.created_at)}</td>
                    <td className="mono cell-sm">{l.action}</td>
                    <td><span className={`badge ${SEVERITY_CLS[l.severity] || 'badge-blue'}`}>{l.severity}</span></td>
                    <td className="cell-sm" style={{ color: 'var(--text-2)' }}>{l.actor_email || '—'}</td>
                    <td className="mono cell-sm">{l.target || '—'}</td>
                    <td className="cell-desc" style={{ color: 'var(--text-2)' }}>
                      {Object.keys(l.details || {}).length === 0 ? '—' :
                        Object.entries(l.details).map(([k, v]) =>
                          `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Fraud Tab */}
        {tab === 'fraud' && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <h3 style={{ marginRight: 'auto' }}>🛡️ Fraud Detection</h3>
              <span className="text-2 cell-sm">Flagged in DB: <strong>{stats?.flagged_transactions ?? 0}</strong></span>
            </div>

            <div style={{ padding: 20 }}>
              <h4 style={{ marginBottom: 12 }}>Live alerts (this session)</h4>
              {fraudAlerts.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>
                  No fraud alerts yet. Try a withdrawal &gt; $10,000 to trigger one.
                </div>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Account</th>
                      <th>Amount</th>
                      <th>Score</th>
                      <th>Decision</th>
                      <th>Reasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fraudAlerts.map((a, i) => (
                      <tr key={i}>
                        <td className="cell-sm">{fmtDate(a.ts)}</td>
                        <td className="mono cell-sm">{a.account_number}</td>
                        <td className="mono fw text-red">{fmt(a.amount)}</td>
                        <td><span className={`badge ${a.score >= 80 ? 'badge-red' : 'badge-yellow'}`}>{a.score}</span></td>
                        <td><span className={`badge ${a.decision === 'block' ? 'badge-red' : 'badge-yellow'}`}>{a.decision}</span></td>
                        <td className="cell-desc">{a.reasons?.join('; ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ padding: 20, borderTop: '1px solid var(--border)' }}>
              <h4 style={{ marginBottom: 12 }}>Recent flagged transactions</h4>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Account</th>
                    <th>Amount</th>
                    <th>Score</th>
                    <th>Reasons</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.filter(t => t.status === 'flagged' || (t.fraud_score || 0) > 0).slice(0, 30).map(t => (
                    <tr key={t.id}>
                      <td className="mono cell-sm">{t.txn_id}</td>
                      <td className="mono cell-sm">{t.from_account || t.to_account}</td>
                      <td className="mono fw text-red">{fmt(t.amount)}</td>
                      <td><span className={`badge ${t.fraud_score >= 80 ? 'badge-red' : 'badge-yellow'}`}>{t.fraud_score}</span></td>
                      <td className="cell-desc">{(t.fraud_reasons || []).join('; ') || '—'}</td>
                      <td className="cell-sm">{fmtDate(t.created_at)}</td>
                    </tr>
                  ))}
                  {txns.filter(t => t.status === 'flagged' || (t.fraud_score || 0) > 0).length === 0 && (
                    <tr><td colSpan="6" style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>No flagged transactions</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
