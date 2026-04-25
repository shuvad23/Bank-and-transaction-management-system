import { useState, useEffect, useCallback } from 'react'
import { accountAPI } from '../services/api'
import useRealtime from '../hooks/useRealtime'
import Layout from '../components/Layout'
import './Transactions.css'

const fmt     = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
const fmtDate = (d) => new Date(d).toLocaleString('en-US', {
  month: 'short', day: 'numeric', year: 'numeric',
  hour: '2-digit', minute: '2-digit'
})

const TYPE_LABELS = {
  deposit:      { label: 'Deposit',      icon: '↓', cls: 'in' },
  withdrawal:   { label: 'Withdrawal',   icon: '↑', cls: 'out' },
  transfer_in:  { label: 'Transfer In',  icon: '↙', cls: 'in' },
  transfer_out: { label: 'Transfer Out', icon: '↗', cls: 'out' },
}

export default function Transactions() {
  const [accounts, setAccounts] = useState([])
  const [selected, setSelected] = useState('')
  const [txns, setTxns]         = useState([])
  const [filter, setFilter]     = useState('all')
  const [loading, setLoading]   = useState(true)

  const loadTxns = useCallback(async (num) => {
    if (!num) return
    setLoading(true)
    try {
      const { data } = await accountAPI.transactions(num, 100)
      setTxns(data)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    accountAPI.list().then(({ data }) => {
      setAccounts(data)
      if (data.length > 0) {
        setSelected(data[0].account_number)
        loadTxns(data[0].account_number)
      } else {
        setLoading(false)
      }
    })
  }, [loadTxns])

  // Real-time: refresh table when a new txn affects this account
  useRealtime({
    'transaction.new': (data) => {
      if (!selected) return
      if (data.from_account === selected || data.to_account === selected) {
        loadTxns(selected)
      }
    },
  })

  const switchAccount = (num) => {
    setSelected(num)
    loadTxns(num)
  }

  const filtered = filter === 'all' ? txns : txns.filter(t => t.transaction_type === filter)

  const totals = txns.reduce((acc, t) => {
    if (t.transaction_type === 'deposit' || t.transaction_type === 'transfer_in') acc.in += t.amount
    else acc.out += t.amount
    return acc
  }, { in: 0, out: 0 })

  return (
    <Layout>
      <div className="txn-page fade-up">
        <div className="txn-page-header">
          <h2>Transaction History</h2>
          <p>Full record of all your account activity</p>
        </div>

        <div className="acc-selector">
          {accounts.map(a => (
            <button
              key={a.id}
              className={`acc-tab ${selected === a.account_number ? 'acc-tab-active' : ''}`}
              onClick={() => switchAccount(a.account_number)}
            >
              <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>{a.account_type}</span>
              <span className="mono" style={{ fontSize: '0.82rem' }}>{a.account_number}</span>
              <span style={{ fontWeight: 600 }}>{fmt(a.balance)}</span>
            </button>
          ))}
        </div>

        <div className="txn-summary">
          <div className="card summary-card">
            <span className="summary-label">Money In</span>
            <span className="summary-val text-green">{fmt(totals.in)}</span>
          </div>
          <div className="card summary-card">
            <span className="summary-label">Money Out</span>
            <span className="summary-val text-red">{fmt(totals.out)}</span>
          </div>
          <div className="card summary-card">
            <span className="summary-label">Total Transactions</span>
            <span className="summary-val">{txns.length}</span>
          </div>
        </div>

        <div className="filter-bar">
          {['all','deposit','withdrawal','transfer_in','transfer_out'].map(f => (
            <button
              key={f}
              className={`filter-btn ${filter === f ? 'filter-active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </button>
          ))}
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center' }}><span className="spinner" style={{ width: 28, height: 28 }} /></div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>No transactions found</div>
          ) : (
            <table className="txn-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Reference</th>
                  <th>Description</th>
                  <th>Counterparty</th>
                  <th>Amount</th>
                  <th>Balance After</th>
                  <th>Status</th>
                  <th>Date & Time</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const meta = TYPE_LABELS[t.transaction_type] || {}
                  const isIn = meta.cls === 'in'
                  const counterparty = isIn ? t.from_account : t.to_account
                  return (
                    <tr key={t.id}>
                      <td>
                        <span className={`txn-type-chip ${isIn ? 'chip-green' : 'chip-red'}`}>
                          {meta.icon} {meta.label}
                        </span>
                      </td>
                      <td className="mono" style={{ fontSize: '0.78rem' }}>{t.txn_id}</td>
                      <td className="desc-cell">{t.description || '—'}</td>
                      <td className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>
                        {counterparty || '—'}
                      </td>
                      <td className={`mono fw ${isIn ? 'text-green' : 'text-red'}`}>
                        {isIn ? '+' : '-'}{fmt(t.amount)}
                      </td>
                      <td className="mono" style={{ color: 'var(--text-2)' }}>{fmt(t.balance_after)}</td>
                      <td>
                        {t.status === 'flagged'
                          ? <span className="badge badge-yellow" title={t.fraud_reasons?.join('; ')}>flagged</span>
                          : <span className="badge badge-green">{t.status}</span>}
                      </td>
                      <td style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>{fmtDate(t.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  )
}
