import { clearToken, getToken } from './auth'
import type { Course } from './types'

type ApiError = Error & { status?: number }
type UnknownRecord = Record<string, unknown>
const CHATBOT_API_URL = (import.meta.env.VITE_CHATBOT_API_URL as string | undefined)?.trim() || '/api/chatbot'

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
  const payload = await requestJson<unknown>('/api/courses', {
    method: 'GET',
    headers: tokenHeaders()
  })

  return { courses: normalizeCourses(payload) }
}

export async function askChatbot(message: string) {
  return requestJson<{ reply: string; source?: string }>(CHATBOT_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
}

function tokenHeaders(): Record<string, string> {
  const token = getToken()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

function normalizeCourses(payload: unknown): Course[] {
  // Handle plain array, { courses: [...] }, and CJS/ESM interop shapes.
  if (Array.isArray(payload)) return payload as Course[]
  if (!payload || typeof payload !== 'object') return []

  const top = payload as UnknownRecord
  const coursesField = top.courses
  if (Array.isArray(coursesField)) return coursesField as Course[]

  if (coursesField && typeof coursesField === 'object') {
    const maybeDefault = (coursesField as UnknownRecord).default
    if (Array.isArray(maybeDefault)) return maybeDefault as Course[]
  }

  const topDefault = top.default
  if (Array.isArray(topDefault)) return topDefault as Course[]

  return []
}

