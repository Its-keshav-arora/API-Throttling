const express = require('express')
const cors = require('cors')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
require('dotenv').config()
const rateLimit = require('express-rate-limit');
const courses = require("./lib/courses.js");

const app = express()
const port = process.env.PORT || 8080;

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  }),
)
app.use(express.json({ limit: '1mb' }))

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me'

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message : { message: 'Too many requests, please try again later.' },
})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message : { message: 'Too many login attempts, please try again later.' },
});

app.use(generalLimiter);

// In-memory "DB" for this demo (no database requested).
let users = []
let nextUserId = 1

function authRequired(req, res, next) {
  const header = req.headers.authorization || ''
  const [type, token] = header.split(' ')
  if (type !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Missing bearer token' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    return next()
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}

app.get('/', (req, res) => {
  res.send('ByteMonk Store API is running.')
})

app.post('/api/signup', authLimiter, async (req, res) => {
  const { email, password, name } = req.body || {}
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ message: 'Email is required' })
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' })
  }
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ message: 'Name is required' })
  }

  const normalizedEmail = email.trim().toLowerCase()
  const existing = users.find((u) => u.email === normalizedEmail)
  if (existing) {
    return res.status(409).json({ message: 'Email already exists' })
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const user = {
    id: nextUserId++,
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
  }
  users.push(user)

  return res.status(201).json({
    message: 'Account created successfully',
    user: { id: user.id, name: user.name, email: user.email },
  })
})

app.post('/api/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    return res.status(400).json({ message: 'Email and password are required' })
  }

  const normalizedEmail = email.trim().toLowerCase()
  const user = users.find((u) => u.email === normalizedEmail)
  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password' })
  }

  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) {
    return res.status(401).json({ message: 'Invalid email or password' })
  }

  const token = jwt.sign(
    { sub: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: '7d' },
  )

  return res.status(200).json({
    token,
    user: { id: user.id, name: user.name, email: user.email },
  })
})

app.get('/api/me', authRequired, (req, res) => {
  // Only echo what we already put in the token.
  return res.status(200).json({ user: req.user })
})

app.get('/api/courses', (req, res) => {
  return res.status(200).json({ courses })
})

app.use((req, res) => {
  return res.status(404).json({ message: 'Not found' })
})

app.listen(port, () => {
  console.log(`ByteMonk API listening on :${port}`)
})