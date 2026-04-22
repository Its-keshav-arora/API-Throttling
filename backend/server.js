const express = require('express')
const cors = require('cors')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const Groq = require('groq-sdk')
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

const chatbotLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Chatbot is receiving too many requests. Please slow down.' },
})

// app.use(generalLimiter);

// In-memory "DB" for this demo (no database requested).
let users = []
let nextUserId = 1

const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null

const COURSE_LIST = Array.isArray(courses)
  ? courses
  : Array.isArray(courses?.default)
    ? courses.default
    : []

const COURSE_CONTEXT = COURSE_LIST
  .map((course) => {
    const highlights = Array.isArray(course.highlights) ? course.highlights.join(', ') : ''
    return [
      `- ${course.title}`,
      `  level: ${course.level}`,
      `  duration: ${course.duration}`,
      `  price_usd: ${course.price}`,
      `  tagline: ${course.tagline}`,
      `  description: ${course.description}`,
      `  highlights: ${highlights}`,
    ].join('\n')
  })
  .join('\n')

const COURSE_INTELLIGENCE_CONTEXT = `
- Cybersecurity Course
  curriculum_outline: Threat modeling, OWASP Top 10, secure coding basics, practical labs, incident response fundamentals, capstone project.
  learner_rating: 4.7/5
  learner_review_summary: Strong for beginners transitioning into practical security work.

- Machine Learning Course
  curriculum_outline: Data preprocessing, feature engineering, supervised learning, model evaluation, basic deployment workflows, mini production checklist.
  learner_rating: 4.6/5
  learner_review_summary: Helpful for developers who want applied ML foundations without heavy theory overload.

- Docker Masterclass
  curriculum_outline: Docker fundamentals, image optimization, multi-container setups with Compose, networking and volumes, production patterns.
  learner_rating: 4.8/5
  learner_review_summary: Highly rated for fast hands-on onboarding into containerized development.

- System Design Course
  curriculum_outline: Requirement breakdown, API design, database choices, caching strategies, queues, scalability trade-offs, interview-style case studies.
  learner_rating: 4.9/5
  learner_review_summary: Loved for clear architecture thinking and interview-oriented system trade-off explanations.
`

const PAYMENT_CONTEXT = `
- Accepted payment methods: UPI, Credit Card, EMI, Debit Card, PayPal.
- Pricing on course cards is listed in USD.
`

const LEGAL_CONTEXT = `
- Privacy Policy page route: /privacy-policy
- Terms & Conditions page route: /terms-and-conditions
- Refund policy: refund requests are accepted only within 7 days of purchase.
- Refund requests after 7 days are not eligible.
`

const BYTE_MONK_SYSTEM_PROMPT = `
You are ByteMonk's official support chatbot.

Primary scope:
- Answer questions about ByteMonk courses and help users choose courses based on their goals and level.
- Use ONLY the provided ByteMonk context for course details, curriculum, ratings/reviews, pricing, payment options, policies, and founder information.
- If a user asks for unknown details, clearly say the detail is not confirmed and suggest contacting ByteMonk support.

Founder context (keep brief unless asked for more):
- Himalay is the founder of ByteMonk with 20+ years of software industry experience.
- He has worked with major tech organizations and has strong expertise in cloud and system design.

Style:
- Keep responses concise, practical, and learner-friendly.
- Offer direct recommendations when a user shares a goal.
- If user asks unrelated questions, politely steer back to ByteMonk topics and available context.
- Do not use markdown formatting.
- Do not use asterisks, bold markers, headings, or markdown bullet syntax.
- Prefer plain sentences or numbered lists using "1.", "2.", etc.

ByteMonk course catalog:
${COURSE_CONTEXT}

ByteMonk curriculum, ratings, and reviews context:
${COURSE_INTELLIGENCE_CONTEXT}

ByteMonk payment context:
${PAYMENT_CONTEXT}

ByteMonk legal and refund context:
${LEGAL_CONTEXT}
`

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

app.post('/api/chatbot', chatbotLimiter, async (req, res) => {
  const { message } = req.body || {}

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ message: 'Message is required' })
  }

  if (message.length > 1000) {
    return res.status(400).json({ message: 'Message is too long. Keep it under 1000 characters.' })
  }

  if (!groq) {
    return res.status(500).json({
      message: 'Chatbot is not configured. Missing GROQ_API_KEY on the server.',
    })
  }

  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0.3,
      max_tokens: 500,
      messages: [
        { role: 'system', content: BYTE_MONK_SYSTEM_PROMPT.trim() },
        { role: 'user', content: message.trim() },
      ],
    })

    const answer = completion.choices?.[0]?.message?.content?.trim()
    if (!answer) {
      return res.status(502).json({ message: 'No response received from chatbot model.' })
    }

    return res.status(200).json({ reply: answer })
  } catch (error) {
    console.error('Chatbot error:', error?.message || error)
    return res.status(500).json({ message: 'Failed to fetch chatbot response' })
  }
})

app.use((req, res) => {
  return res.status(404).json({ message: 'Not found' })
})

app.listen(port, () => {
  console.log(`ByteMonk API listening on :${port}`)
})