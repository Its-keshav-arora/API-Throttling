import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signup } from '../lib/api'

export default function SignupPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)
    try {
      await signup(name, email, password)
      setMessage('Account created! Redirecting to login...')
      setTimeout(() => navigate('/login', { replace: true }), 1200)
    } catch (err) {
      setError((err as Error).message || 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-title">
          <span className="auth-title-glow" />
          <h1>Signup</h1>
        </div>
        <p className="auth-subtitle">Create your account for JWT-protected access.</p>

        <form className="auth-form" onSubmit={onSubmit}>
          <label className="auth-label">
            <span>Name</span>
            <input
              className="neon-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              type="text"
              autoComplete="name"
              required
              placeholder="Your ByteMonk name"
            />
          </label>

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
              autoComplete="new-password"
              required
              placeholder="Min 6 characters"
            />
          </label>

          {error ? <div className="auth-error">{error}</div> : null}
          {message ? <div className="auth-success">{message}</div> : null}

          <button className="neon-btn neon-btn--primary" type="submit" disabled={loading}>
            {loading ? 'Creating...' : 'Create account'}
          </button>

          <div className="auth-footer">
            <span>Already have an account?</span>
            <Link to="/login" className="neon-link">
              Go to login
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

