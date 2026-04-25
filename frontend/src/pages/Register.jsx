import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authAPI } from '../services/api'
import './Auth.css'

const PASSWORD_RX = /^(?=.*[A-Za-z])(?=.*\d).{8,100}$/
const USERNAME_RX = /^[a-zA-Z0-9_]{3,30}$/

export default function Register() {
  const navigate = useNavigate()
  const [form, setForm]       = useState({ full_name: '', username: '', email: '', password: '', role: 'user' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const validate = () => {
    if (form.full_name.trim().length < 2) return 'Please enter your full name (at least 2 characters)'
    if (!USERNAME_RX.test(form.username)) return 'Username must be 3–30 characters: letters, numbers, underscore only'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Please enter a valid email address'
    if (!PASSWORD_RX.test(form.password)) return 'Password must be at least 8 characters and include both letters and numbers'
    return ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const v = validate()
    if (v) { setError(v); return }
    setError('')
    setLoading(true)
    try {
      await authAPI.register(form)
      navigate('/login', { state: { message: 'Account created! Please log in.' } })
    } catch (err) {
      const detail = err.response?.data?.detail
      // FastAPI validation errors come back as an array of {msg, loc, ...}
      if (Array.isArray(detail)) {
        setError(detail.map(d => d.msg).join('. '))
      } else {
        setError(detail || 'Registration failed. Try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card fade-up">
        <div className="auth-logo">
          <span className="brand-icon-lg">⬡</span>
          <h1>NexBank</h1>
          <p>Create your account</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>Full Name</label>
            <input name="full_name" placeholder="John Doe" value={form.full_name} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>Username</label>
            <input name="username" placeholder="johndoe (3–30 chars)" value={form.username} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input name="email" type="email" placeholder="john@example.com" value={form.email} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input name="password" type="password"
                   placeholder="Min. 8 chars · letters + numbers"
                   value={form.password} onChange={handleChange} required minLength={8} />
            <small style={{ color: 'var(--text-3)', fontSize: '0.75rem' }}>
              At least 8 characters, must include letters and numbers
            </small>
          </div>
          <div className="form-group">
            <label>Account Role</label>
            <select name="role" value={form.role} onChange={handleChange}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
            {loading ? <><span className="spinner" /> Creating account…</> : 'Create Account'}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
