import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Wraps a route and redirects to /login if the user is not authenticated.
 * If adminOnly=true, redirects to /dashboard if the user is not an admin.
 */
export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth()

  // Show nothing while we restore the session from localStorage
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <span className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && user.role !== 'admin') return <Navigate to="/dashboard" replace />

  return children
}
