import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CourseCard from '../components/CourseCard'
import type { Course } from '../lib/types'
import { clearToken, getToken } from '../lib/auth'
import { getCourses, getMe } from '../lib/api'

type MeResponse = { user: { sub: number; email: string; name: string } }

export default function DashboardPage() {
  const navigate = useNavigate()
  const [courses, setCourses] = useState<Course[]>([])
  const [userName, setUserName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const token = getToken()

  const courseCount = useMemo(() => courses.length, [courses.length])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const mePromise = token
          ? getMe()
              .then((me) => me as MeResponse)
              .catch(() => null)
          : Promise.resolve(null)

        const [me, courseResp] = await Promise.all([mePromise, getCourses()])

        if (cancelled) return
        if (me) setUserName(me.user.name)
        setCourses(courseResp.courses)
      } catch (err) {
        setError(
          err instanceof Error ? err.message || 'Failed to load dashboard' : 'Failed to load dashboard'
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [navigate, token])

  function onLogout() {
    clearToken()
    navigate('/login', { replace: true })
  }

  return (
    <section className="dash">
      <div className="dash-hero">
        <div className="dash-hero-left">
          <h1 className="dash-title">Dashboard</h1>
          <div className="dash-stats">
            <div className="dash-stat">
              <div className="dash-stat-label">Courses loaded</div>
              <div className="dash-stat-value">{courseCount}</div>
            </div>
          </div>
        </div>

        <div className="dash-hero-right">
          {token ? (
            <button
              className="neon-btn neon-btn--ghost"
              type="button"
              onClick={onLogout}
            >
              Logout
            </button>
          ) : null}
        </div>
      </div>

      {loading ? <div className="dash-loading">Syncing the neon feed...</div> : null}
      {error ? <div className="dash-error">{error}</div> : null}

      {!loading && !error ? (
        <div className="course-grid" aria-live="polite">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      ) : null}
    </section>
  )
}

