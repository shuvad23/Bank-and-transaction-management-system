import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { accountAPI, chartsAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import useRealtime from '../hooks/useRealtime'
import Layout from '../components/Layout'
import { DailyFlowChart, TypeBreakdownPie, BalanceBars } from '../components/Charts'
import './Dashboard.css'

const fmt     = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function TxnRow({ txn }) {
  const isIn = txn.transaction_type === 'deposit' || txn.transaction_type === 'transfer_in'
  const icons  = { deposit: '↓', withdrawal: '↑', transfer_in: '↙', transfer_out: '↗' }
  const labels = { deposit: 'Deposit', withdrawal: 'Withdrawal', transfer_in: 'Transfer In', transfer_out: 'Transfer Out' }
  const flagged = txn.status === 'flagged'

  return (
    <div className="txn-row">
      <div className={`txn-icon ${isIn ? 'txn-in' : 'txn-out'}`}>{icons[txn.transaction_type]}</div>
      <div className="txn-info">
        <span className="txn-label">
          {labels[txn.transaction_type]}
          {flagged && <span className="badge badge-yellow" style={{ marginLeft: 8 }}>flagged</span>}
        </span>
        <span className="txn-desc">
          <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{txn.txn_id}</span>
          {txn.description ? <> · {txn.description}</> : null}
        </span>
      </div>
      <div className="txn-right">
        <span className={`txn-amount ${isIn ? 'text-green' : 'text-red'}`}>
          {isIn ? '+' : '-'}{fmt(txn.amount)}
        </span>
        <span className="txn-date">{fmtDate(txn.created_at)}</span>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [accounts, setAccounts]     = useState([])
  const [txns, setTxns]             = useState([])
  const [selected, setSelected]     = useState(null)
  const [loading, setLoading]       = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newAcc, setNewAcc]         = useState({ account_type: 'savings', initial_deposit: 0 })
  const [creating, setCreating]     = useState(false)
  const [createErr, setCreateErr]   = useState('')
  const [chart, setChart]           = useState({ daily_volume: [], txn_breakdown: [], balance_distribution: [] })
  const [liveBadge, setLiveBadge]   = useState(false)

  const refreshChart = useCallback(async () => {
    try {
      const { data } = await chartsAPI.me(7)
      setChart(data)
    } catch (e) { /* silent */ }
  }, [])

  const loadAccounts = useCallback(async (preserveSelected = false) => {
    try {
      const { data } = await accountAPI.list()
      setAccounts(data)
      if (data.length > 0) {
        const next = preserveSelected
          ? (data.find(a => a.account_number === selected?.account_number) || data[0])
          : data[0]
        setSelected(next)
        const txnRes = await accountAPI.transactions(next.account_number, 10)
        setTxns(txnRes.data)
      } else {
        setSelected(null)
        setTxns([])
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.account_number])

  useEffect(() => {
    loadAccounts()
    refreshChart()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Real-time: refresh whenever a transaction arrives for this user
  useRealtime({
    'transaction.new': () => {
      setLiveBadge(true)
      setTimeout(() => setLiveBadge(false), 1500)
      loadAccounts(true)
      refreshChart()
    },
    'account.created': () => loadAccounts(true),
  })

  const switchAccount = async (acc) => {
    setSelected(acc)
    const { data } = await accountAPI.transactions(acc.account_number, 10)
    setTxns(data)
  }

  const createAccount = async (e) => {
    e.preventDefault()
    setCreateErr('')
    setCreating(true)
    try {
      await accountAPI.create({ ...newAcc, initial_deposit: Number(newAcc.initial_deposit) })
      setShowCreate(false)
      setNewAcc({ account_type: 'savings', initial_deposit: 0 })
      loadAccounts()
      refreshChart()
    } catch (err) {
      const detail = err.response?.data?.detail
      setCreateErr(Array.isArray(detail) ? detail.map(d => d.msg).join('. ') : (detail || 'Failed to create account'))
    } finally { setCreating(false) }
  }

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0)

  if (loading) return (
    <Layout>
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
      </div>
    </Layout>
  )

  return (
    <Layout>
      <div className="dashboard fade-up">
        <div className="dash-header">
          <div>
            <h2>
              Welcome back, {user?.full_name?.split(' ')[0]} 👋
              {liveBadge && <span className="live-dot" title="Live update received">● live</span>}
            </h2>
            <p>Here's your financial overview</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ New Account</button>
        </div>

        <div className="balance-hero card">
          <div className="bh-label">Total Portfolio Balance</div>
          <div className="bh-amount">{fmt(totalBalance)}</div>
          <div className="bh-accounts">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</div>
          <div className="bh-actions">
            <Link to="/transfer" className="btn btn-outline btn-sm">↗ Transfer</Link>
            <Link to="/transactions" className="btn btn-outline btn-sm">📋 All History</Link>
          </div>
        </div>

        {accounts.length === 0 ? (
          <div className="empty-state card">
            <div className="empty-icon">🏦</div>
            <h3>No accounts yet</h3>
            <p>Create your first bank account to get started</p>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>Create Account</button>
          </div>
        ) : (
          <div className="accounts-grid">
            {accounts.map(acc => (
              <div
                key={acc.id}
                className={`acc-card card ${selected?.id === acc.id ? 'acc-active' : ''}`}
                onClick={() => switchAccount(acc)}
              >
                <div className="acc-top">
                  <span className="acc-type-badge badge badge-blue">{acc.account_type}</span>
                  <span className="acc-num mono">{acc.account_number}</span>
                </div>
                <div className="acc-balance">{fmt(acc.balance)}</div>
                <div className="acc-since">Since {fmtDate(acc.created_at)}</div>
              </div>
            ))}
          </div>
        )}

        {/* Charts */}
        {accounts.length > 0 && (
          <div className="dash-charts">
            <div className="card chart-card chart-wide">
              <div className="section-header">
                <h3>📈 Last 7 days · Money flow</h3>
              </div>
              <DailyFlowChart data={chart.daily_volume} />
            </div>
            <div className="card chart-card">
              <div className="section-header"><h3>💼 By transaction type</h3></div>
              <TypeBreakdownPie data={chart.txn_breakdown} />
            </div>
            <div className="card chart-card">
              <div className="section-header"><h3>🏦 Balance per account</h3></div>
              <BalanceBars data={chart.balance_distribution} />
            </div>
          </div>
        )}

        {selected && (
          <div className="card">
            <div className="section-header">
              <h3>Recent Transactions</h3>
              <span className="mono text-2" style={{ fontSize: '0.8rem' }}>{selected.account_number}</span>
              <Link to="/transactions" className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }}>View All</Link>
            </div>
            {txns.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3)' }}>No transactions yet</p>
            ) : (
              <div className="txn-list">
                {txns.map(t => <TxnRow key={t.id} txn={t} />)}
              </div>
            )}
          </div>
        )}

        {showCreate && (
          <div className="modal-overlay" onClick={() => setShowCreate(false)}>
            <div className="modal-box card" onClick={e => e.stopPropagation()}>
              <h3>Create New Account</h3>
              {createErr && <div className="alert alert-error">{createErr}</div>}
              <form onSubmit={createAccount} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
                <div className="form-group">
                  <label>Account Type</label>
                  <select value={newAcc.account_type} onChange={e => setNewAcc(a => ({ ...a, account_type: e.target.value }))}>
                    <option value="savings">Savings</option>
                    <option value="checking">Checking</option>
                    <option value="fixed_deposit">Fixed Deposit</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Initial Deposit ($)</label>
                  <input type="number" min="0" step="0.01" value={newAcc.initial_deposit}
                    onChange={e => setNewAcc(a => ({ ...a, initial_deposit: e.target.value }))} />
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button className="btn btn-outline" type="button" style={{ flex: 1 }} onClick={() => setShowCreate(false)}>Cancel</button>
                  <button className="btn btn-primary" type="submit" style={{ flex: 1 }} disabled={creating}>
                    {creating ? <><span className="spinner" /> Creating…</> : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
