import { clearToken, getToken } from './auth'
import type { Course } from './types'

type ApiError = Error & { status?: number }

async function requestJson<T>(path: string, options: RequestInit): Promise<T> {
  const res = await fetch(path, options)

  // If the token is invalid/expired, backend returns 401.
  if (res.status === 401) clearToken()

  type ErrorPayload = { message?: string; error?: string }
  const data: unknown = await res
    .json()
    .catch(() => undefined as unknown as ErrorPayload)

  if (!res.ok) {
    const payload = data as ErrorPayload
    const message =
      typeof payload.message === 'string'
        ? payload.message
        : typeof payload.error === 'string'
          ? payload.error
          : `Request failed (${res.status})`

    const err = new Error(message) as ApiError
    err.status = res.status
    throw err
  }

  return data as T
}

export async function login(email: string, password: string) {
  return requestJson<{ token: string }>('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
}

export async function signup(name: string, email: string, password: string) {
  return requestJson<{ user: { id: number; name: string; email: string } }>('/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password })
  })
}

export async function getMe() {
  return requestJson<{ user: { sub: number; email: string; name: string } }>('/api/me', {
    method: 'GET',
    headers: tokenHeaders()
  })
}

export async function getCourses() {
  return requestJson<{ courses: Course[] }>('/api/courses', {
    method: 'GET',
    headers: tokenHeaders()
  })
}

function tokenHeaders(): Record<string, string> {
  const token = getToken()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

