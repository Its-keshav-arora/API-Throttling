import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import NeonLayout from './components/NeonLayout'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import { getToken } from './lib/auth'

function LandingRedirect() {
  // Products are public; landing page always shows the dashboard feed.
  return <Navigate to="/dashboard" replace />
}

function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const token = getToken()
  if (token) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export default function App() {
  const token = getToken()
  return (
    <BrowserRouter>
      <NeonLayout production={!token}>
        <Routes>
          <Route path="/" element={<LandingRedirect />} />
          <Route
            path="/login"
            element={
              <RedirectIfAuthed>
                <LoginPage />
              </RedirectIfAuthed>
            }
          />
          <Route
            path="/signup"
            element={
              <RedirectIfAuthed>
                <SignupPage />
              </RedirectIfAuthed>
            }
          />
          <Route
            path="/dashboard"
            element={<DashboardPage />}
          />
          <Route path="*" element={<LandingRedirect />} />
        </Routes>
      </NeonLayout>
    </BrowserRouter>
  )
}
