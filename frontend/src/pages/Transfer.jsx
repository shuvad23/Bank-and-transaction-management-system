import { useState, useEffect } from 'react'
import { accountAPI } from '../services/api'
import Layout from '../components/Layout'
import './Transfer.css'

const fmt = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`

export default function Transfer() {
  const [accounts, setAccounts] = useState([])
  const [tab, setTab]           = useState('transfer')
  const [form, setForm]         = useState({ from_account: '', to_account_number: '', amount: '', description: '' })
  const [loading, setLoading]   = useState(false)
  const [success, setSuccess]   = useState('')
  const [error, setError]       = useState('')

  useEffect(() => {
    accountAPI.list().then(({ data }) => {
      setAccounts(data)
      if (data.length > 0) setForm(f => ({ ...f, from_account: data[0].account_number }))
    })
  }, [])

  const selectedAcc = accounts.find(a => a.account_number === form.from_account)

  const handleChange = (e) => {
    setSuccess(''); setError('')
    let value = e.target.value
    if (e.target.name === 'to_account_number') value = value.toUpperCase()
    setForm(f => ({ ...f, [e.target.name]: value }))
  }

  const validate = () => {
    const amt = parseFloat(form.amount)
    if (!form.from_account) return 'Please choose a source account'
    if (!Number.isFinite(amt) || amt <= 0) return 'Enter an amount greater than 0'
    if (amt > 1_000_000) return 'Maximum amount per transaction is $1,000,000'
    if (tab === 'transfer') {
      if (!/^BNK\d{9}$/.test(form.to_account_number)) {
        return 'Recipient must be in the format BNK followed by 9 digits (e.g. BNK123456789)'
      }
      if (form.to_account_number === form.from_account) return 'Cannot transfer to the same account'
    }
    if ((tab === 'withdraw' || tab === 'transfer') && selectedAcc && amt > selectedAcc.balance) {
      return `Insufficient funds. Available: ${fmt(selectedAcc.balance)}`
    }
    return ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setSuccess('')
    const v = validate()
    if (v) { setError(v); return }
    setLoading(true)
    try {
      const amt = parseFloat(form.amount)
      const desc = form.description.trim() || undefined
      if (tab === 'transfer') {
        await accountAPI.transfer(form.from_account, {
          to_account_number: form.to_account_number,
          amount: amt,
          description: desc,
        })
        setSuccess(`Successfully transferred ${fmt(amt)} to ${form.to_account_number}`)
      } else if (tab === 'deposit') {
        await accountAPI.deposit(form.from_account, { amount: amt, description: desc })
        setSuccess(`Successfully deposited ${fmt(amt)}`)
      } else {
        await accountAPI.withdraw(form.from_account, { amount: amt, description: desc })
        setSuccess(`Successfully withdrew ${fmt(amt)}`)
      }
      const { data } = await accountAPI.list()
      setAccounts(data)
      setForm(f => ({ ...f, amount: '', to_account_number: '', description: '' }))
    } catch (err) {
      const detail = err.response?.data?.detail
      if (Array.isArray(detail)) setError(detail.map(d => d.msg).join('. '))
      else setError(detail || 'Transaction failed')
    } finally { setLoading(false) }
  }

  return (
    <Layout>
      <div className="transfer-page fade-up">
        <div className="transfer-header">
          <h2>Money Operations</h2>
          <p>Transfer, deposit, or withdraw funds — protected by automated fraud detection</p>
        </div>

        <div className="transfer-layout">
          <div className="transfer-form-wrap card">
            <div className="tab-bar">
              {['transfer','deposit','withdraw'].map(t => (
                <button
                  key={t}
                  className={`tab-btn ${tab === t ? 'tab-active' : ''}`}
                  onClick={() => { setTab(t); setError(''); setSuccess('') }}
                  type="button"
                >
                  {t === 'transfer' ? '↗ Transfer' : t === 'deposit' ? '↓ Deposit' : '↑ Withdraw'}
                </button>
              ))}
            </div>

            {success && <div className="alert alert-success">✓ {success}</div>}
            {error   && <div className="alert alert-error">✕ {error}</div>}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div className="form-group">
                <label>From Account</label>
                <select name="from_account" value={form.from_account} onChange={handleChange} required>
                  {accounts.map(a => (
                    <option key={a.id} value={a.account_number}>
                      {a.account_number} — {a.account_type} ({fmt(a.balance)})
                    </option>
                  ))}
                </select>
              </div>

              {tab === 'transfer' && (
                <div className="form-group">
                  <label>Recipient Account Number</label>
                  <input
                    name="to_account_number"
                    placeholder="e.g. BNK123456789"
                    value={form.to_account_number}
                    onChange={handleChange}
                    required
                    className="mono"
                    maxLength={12}
                  />
                  <small style={{ color: 'var(--text-3)', fontSize: '0.75rem' }}>
                    Format: BNK followed by 9 digits
                  </small>
                </div>
              )}

              <div className="form-group">
                <label>Amount (USD)</label>
                <div className="amount-wrap">
                  <span className="amount-prefix">$</span>
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    max="1000000"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={handleChange}
                    required
                    style={{ paddingLeft: 28 }}
                    className="mono"
                  />
                </div>
                {selectedAcc && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>
                    Available: {fmt(selectedAcc.balance)} · Max per txn: $1,000,000
                  </span>
                )}
              </div>

              <div className="form-group">
                <label>Description (optional)</label>
                <input name="description" placeholder="What's this for?" value={form.description} onChange={handleChange} maxLength={200} />
              </div>

              <button className="btn btn-primary btn-block" type="submit" disabled={loading || accounts.length === 0}>
                {loading
                  ? <><span className="spinner" /> Processing…</>
                  : tab === 'transfer' ? '↗ Send Transfer'
                  : tab === 'deposit'  ? '↓ Deposit Funds'
                  : '↑ Withdraw Funds'
                }
              </button>
            </form>
          </div>

          <div className="transfer-side">
            <h3 style={{ marginBottom: 12 }}>Your Accounts</h3>
            {accounts.map(acc => (
              <div key={acc.id} className={`side-acc card ${form.from_account === acc.account_number ? 'side-acc-active' : ''}`}>
                <div className="side-acc-top">
                  <span className="badge badge-blue">{acc.account_type}</span>
                </div>
                <div className="side-acc-num mono">{acc.account_number}</div>
                <div className="side-acc-bal">{fmt(acc.balance)}</div>
              </div>
            ))}
            {accounts.length === 0 && <p>No accounts. Create one on the Dashboard.</p>}
          </div>
        </div>
      </div>
    </Layout>
  )
}
