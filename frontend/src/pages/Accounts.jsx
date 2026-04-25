import { useState, useEffect } from 'react'
import { accountAPI } from '../services/api'
import Layout from '../components/Layout'

const fmt     = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export default function Accounts() {
  const [accounts, setAccounts]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newAcc, setNewAcc]       = useState({ account_type: 'savings', initial_deposit: 0 })
  const [creating, setCreating]   = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')

  const load = async () => {
    try {
      const { data } = await accountAPI.list()
      setAccounts(data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    setCreating(true); setError('')
    try {
      await accountAPI.create({ ...newAcc, initial_deposit: Number(newAcc.initial_deposit) })
      setShowCreate(false)
      setSuccess('Account created successfully!')
      setTimeout(() => setSuccess(''), 4000)
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create account')
    } finally { setCreating(false) }
  }

  const typeColors = { savings: 'badge-blue', checking: 'badge-green', fixed_deposit: 'badge-yellow' }

  return (
    <Layout>
      <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2>My Accounts</h2>
            <p style={{ marginTop: 4 }}>Manage all your bank accounts</p>
          </div>
          <button className="btn btn-primary" onClick={() => { setShowCreate(true); setError('') }}>
            + New Account
          </button>
        </div>

        {success && <div className="alert alert-success">✓ {success}</div>}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3, margin: 'auto', display: 'block' }} />
          </div>
        ) : accounts.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🏦</div>
            <h3>No accounts yet</h3>
            <p style={{ margin: '8px 0 20px' }}>Open your first bank account to start banking</p>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>Create First Account</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
            {accounts.map(acc => (
              <div key={acc.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Card Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span className={`badge ${typeColors[acc.account_type] || 'badge-blue'}`} style={{ textTransform: 'capitalize' }}>
                    {acc.account_type.replace('_', ' ')}
                  </span>
                  <span className="badge badge-green">Active</span>
                </div>

                {/* Balance */}
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginBottom: 4 }}>Current Balance</div>
                  <div style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.02em', fontFamily: 'DM Mono, monospace' }}>
                    {fmt(acc.balance)}
                  </div>
                </div>

                {/* Account Number */}
                <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginBottom: 2 }}>Account Number</div>
                  <div className="mono" style={{ fontSize: '0.95rem', letterSpacing: '0.05em' }}>{acc.account_number}</div>
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-3)', fontSize: '0.8rem' }}>
                  <span>Opened {fmtDate(acc.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Account Modal */}
        {showCreate && (
          <div className="modal-overlay" onClick={() => setShowCreate(false)}>
            <div className="modal-box card" onClick={e => e.stopPropagation()}>
              <h3 style={{ marginBottom: 6 }}>Open New Account</h3>
              <p style={{ fontSize: '0.88rem', marginBottom: 20 }}>Choose an account type and make an optional opening deposit</p>

              {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

              <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label>Account Type</label>
                  <select value={newAcc.account_type} onChange={e => setNewAcc(a => ({ ...a, account_type: e.target.value }))}>
                    <option value="savings">Savings — Earn interest on deposits</option>
                    <option value="checking">Checking — Everyday transactions</option>
                    <option value="fixed_deposit">Fixed Deposit — Higher interest, locked funds</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Opening Deposit ($)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={newAcc.initial_deposit}
                    onChange={e => setNewAcc(a => ({ ...a, initial_deposit: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                  <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowCreate(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={creating}>
                    {creating ? <><span className="spinner" /> Creating…</> : 'Open Account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Reuse modal styles from Dashboard */}
      <style>{`
        .modal-overlay {
          align-items: center; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
          display: flex; inset: 0; justify-content: center; padding: 24px;
          position: fixed; z-index: 200;
        }
        .modal-box { max-width: 440px; width: 100%; }
      `}</style>
    </Layout>
  )
}
