const express = require('express')
const cors = require('cors')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
require('dotenv').config()

const app = express()
const port = process.env.PORT || 8080

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  }),
)
app.use(express.json({ limit: '1mb' }))

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me'

// In-memory "DB" for this demo (no database requested).
let users = []
let nextUserId = 1

const courses = [
  {
    id: 'tshirt',
    title: 'ByteMonk Tshirt',
    tagline: 'Neon comfort, cyber-ready.',
    description: 'A limited ByteMonk merch drop designed to glow in your late-night lab sessions.',
    level: 'Merch Drop',
    duration: 'Limited',
    price: 19,
    image: '/courses/tshirt.png',
    highlights: ['Soft cotton', 'Neon print', 'ByteMonk edition'],
  },
  {
    id: 'cybersecurity',
    title: 'Cybersecurity Course',
    tagline: 'Learn ethical hacking fundamentals and real-world defense.',
    description:
      'From threat modeling to hands-on labs: build a practical security mindset.',
    level: 'Beginner to Intermediate',
    duration: '6 weeks',
    price: 89,
    image: '/courses/cybersecurity.png',
    highlights: ['OWASP Top 10', 'Hands-on labs', 'Capstone project'],
  },
  {
    id: 'machine-learning',
    title: 'Machine Learning Course',
    tagline: 'Neural intuition with engineering-grade fundamentals.',
    description:
      'Train, evaluate, and deploy models with confidence. Great for builders.',
    level: 'Intermediate',
    duration: '8 weeks',
    price: 119,
    image: '/courses/machine-learning.png',
    highlights: ['Feature pipelines', 'Model evaluation', 'Deployment basics'],
  },
  {
    id: 'docker-masterclass',
    title: 'Docker Masterclass',
    tagline: 'Ship apps faster with clean container workflows.',
    description:
      'Learn images, networking, volumes, and production-ready Docker practices.',
    level: 'Beginner to Intermediate',
    duration: '4 weeks',
    price: 49,
    image: '/courses/docker.png',
    highlights: ['Dockerfiles', 'Compose stacks', 'Production patterns'],
  },
  {
    id: 'system-design',
    title: 'System Design Course',
    tagline: 'Design scalable services with clarity and trade-offs.',
    description:
      'From APIs to databases and caching: practice design interviews the right way.',
    level: 'Intermediate to Advanced',
    duration: '7 weeks',
    price: 89,
    image: '/courses/system-design.png',
    highlights: ['Scalability', 'Databases', 'Caching & queues'],
  },
]

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

app.post('/api/signup', async (req, res) => {
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

app.post('/api/login', async (req, res) => {
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