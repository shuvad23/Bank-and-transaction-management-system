import axios from 'axios'

// Empty baseURL means requests use the same origin (Vite proxies /api to the backend)
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api

// ── Typed API helpers ─────────────────────────────────────────────────────────

export const authAPI = {
  register: (data) => api.post('/api/auth/register', data),
  login:    (data) => api.post('/api/auth/login', data),
  me:       ()     => api.get('/api/auth/me'),
}

export const accountAPI = {
  create:       (data)                       => api.post('/api/accounts/', data),
  list:         ()                           => api.get('/api/accounts/'),
  get:          (num)                        => api.get(`/api/accounts/${num}`),
  deposit:      (num, data)                  => api.post(`/api/accounts/${num}/deposit`, data),
  withdraw:     (num, data)                  => api.post(`/api/accounts/${num}/withdraw`, data),
  transfer:     (num, data)                  => api.post(`/api/accounts/${num}/transfer`, data),
  transactions: (num, limit=50, skip=0)      => api.get(`/api/accounts/${num}/transactions?limit=${limit}&skip=${skip}`),
}

export const adminAPI = {
  stats:        () => api.get('/api/admin/stats'),
  charts:       (days=7) => api.get(`/api/admin/charts?days=${days}`),
  transactions: (limit=100) => api.get(`/api/admin/transactions?limit=${limit}`),
  users:        (limit=100) => api.get(`/api/admin/users?limit=${limit}`),
  auditLogs:    (limit=100, severity) => api.get(
                  `/api/admin/audit-logs?limit=${limit}${severity ? `&severity=${severity}` : ''}`),
  connections:  () => api.get('/api/admin/connections'),
}

export const notificationsAPI = {
  list:     (limit=30) => api.get(`/api/notifications/?limit=${limit}`),
  markRead: () => api.post('/api/notifications/mark-read'),
}

export const chartsAPI = {
  me: (days=7) => api.get(`/api/charts/me?days=${days}`),
}
