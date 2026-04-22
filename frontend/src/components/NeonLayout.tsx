import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'

export default function NeonLayout({
  children,
  production = false,
}: {
  children: ReactNode
  production?: boolean
}) {
  return (
    <div className="neon-app">
      <header className="neon-header">
        <div className="neon-brand">
          <img className="neon-logo" src="/bytemonk.png" alt="ByteMonk" />
          <div className="neon-brand-text">
            <div className="neon-brand-title">ByteMonk Store</div>
            <div className="neon-brand-subtitle">
              Where Every Byte Sparks Insight!
            </div>
          </div>
        </div>
        {production ? (
          <Link to="/dashboard" className="neon-btn neon-btn--ghost neon-btn--header no-underline" aria-label="Go to dashboard">
            Go to Dashboard
          </Link>
        ) : (
          <div className="neon-badge">JWT • Auth • Dashboards</div>
        )}
      </header>

      <main className="neon-main">{children}</main>

      <footer className="neon-footer">
        <span className="neon-footer-dot" />
        <span>ByteMonk - Where Every Byte Sparks Insight!</span>
      </footer>
    </div>
  )
}

