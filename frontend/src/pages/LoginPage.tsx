import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { login } from '../lib/api'
import { setToken } from '../lib/auth'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const data = await login(email, password)
      setToken(data.token)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError((err as Error).message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-title">
          <span className="auth-title-glow" />
          <h1>Login</h1>
        </div>
        <p className="auth-subtitle">Access your ByteMonk dashboard.</p>

        <form className="auth-form" onSubmit={onSubmit}>
          <label className="auth-label">
            <span>Email</span>
            <input
              className="neon-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              required
              placeholder="you@bytemonk.com"
            />
          </label>

          <label className="auth-label">
            <span>Password</span>
            <input
              className="neon-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
              placeholder="Your password"
            />
          </label>

          {error ? <div className="auth-error">{error}</div> : null}

          <button className="neon-btn neon-btn--primary" type="submit" disabled={loading}>
            {loading ? 'Authenticating...' : 'Login'}
          </button>

          <div className="auth-footer">
            <span>New here?</span>
            <Link to="/signup" className="neon-link">
              Create account
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

