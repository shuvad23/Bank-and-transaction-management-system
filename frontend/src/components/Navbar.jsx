import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import NotificationBell from './NotificationBell'
import './Navbar.css'

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const isActive = (path) => location.pathname === path ? 'active' : ''

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/dashboard" className="navbar-brand">
          <span className="brand-icon">⬡</span>
          <span className="brand-name">NexBank</span>
        </Link>

        <div className="navbar-links">
          <Link to="/dashboard"    className={`nav-link ${isActive('/dashboard')}`}>Dashboard</Link>
          <Link to="/accounts"     className={`nav-link ${isActive('/accounts')}`}>Accounts</Link>
          <Link to="/transfer"     className={`nav-link ${isActive('/transfer')}`}>Transfer</Link>
          <Link to="/transactions" className={`nav-link ${isActive('/transactions')}`}>History</Link>
          {isAdmin && (
            <Link to="/admin" className={`nav-link ${isActive('/admin')} admin-link`}>Admin</Link>
          )}
        </div>

        <div className="navbar-user">
          <NotificationBell />
          <div className="user-pill">
            <span className="user-avatar">{user?.full_name?.[0]?.toUpperCase()}</span>
            <span className="user-name">{user?.full_name?.split(' ')[0]}</span>
            {isAdmin && <span className="badge badge-yellow">Admin</span>}
          </div>
          <button className="btn btn-outline btn-sm" onClick={handleLogout}>Logout</button>
        </div>
      </div>
    </nav>
  )
}
