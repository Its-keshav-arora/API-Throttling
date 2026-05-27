const express = require('express')
const cors = require('cors')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const Groq = require('groq-sdk')
const { createClient } = require('redis')
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
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379'
const EMBEDDING_SERVICE_URL = process.env.EMBEDDING_SERVICE_URL || 'http://127.0.0.1:5090/api/embed'
const CHATBOT_VECTOR_INDEX = process.env.CHATBOT_VECTOR_INDEX || 'chatbot_semantic_idx'
const CHATBOT_VECTOR_PREFIX = process.env.CHATBOT_VECTOR_PREFIX || 'chatbot:semantic:'
const CHATBOT_VECTOR_FIELD = 'query_vector'
const CHATBOT_VECTOR_DIMS = Number(process.env.CHATBOT_VECTOR_DIMS || 768)
const CHATBOT_SIMILARITY_THRESHOLD = Number(process.env.CHATBOT_SIMILARITY_THRESHOLD || 0.82)
const CHATBOT_HYBRID_ALPHA = Number(process.env.CHATBOT_HYBRID_ALPHA || 0.35)
const CHATBOT_VECTOR_CANDIDATES = Number(process.env.CHATBOT_VECTOR_CANDIDATES || 8)
const CHATBOT_EXACT_PREFIX = process.env.CHATBOT_EXACT_PREFIX || 'chatbot:exact:'
const CHATBOT_EXACT_TTL_SECONDS = Number(process.env.CHATBOT_EXACT_TTL_SECONDS || 86400)

let redisClient = null
let redisAvailable = false

try {
  redisClient = createClient({ url: REDIS_URL })
  redisClient.on('error', (error) => {
    redisAvailable = false
    console.error('Redis client error:', error?.message || error)
  })
  redisClient
    .connect()
    .then(() => {
      redisAvailable = true
      console.log('Redis connected for chatbot cache')
    })
    .catch((error) => {
      redisAvailable = false
      console.error('Redis connection failed, continuing without cache:', error?.message || error)
    })
} catch (error) {
  console.error('Failed to initialize Redis client, continuing without cache:', error?.message || error)
}

let vectorIndexReady = false
let vectorSearchUnsupported = false

function toFloat32Buffer(vector) {
  const float32 = new Float32Array(vector)
  return Buffer.from(float32.buffer)
}

function parseRedisSearchFields(rawFields) {
  const fieldMap = {}
  if (!Array.isArray(rawFields)) return fieldMap

  for (let i = 0; i < rawFields.length; i += 2) {
    const key = rawFields[i]
    const value = rawFields[i + 1]
    if (typeof key === 'string') {
      fieldMap[key] = value
    }
  }

  return fieldMap
}

function tokenizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function lexicalSimilarity(a, b) {
  const tokensA = tokenizeText(a)
  const tokensB = tokenizeText(b)
  if (!tokensA.length || !tokensB.length) return 0

  const setB = new Set(tokensB)
  let overlap = 0
  for (const token of tokensA) {
    if (setB.has(token)) overlap += 1
  }

  return overlap / Math.max(tokensA.length, 1)
}

async function ensureVectorIndex() {
  if (!redisClient || !redisAvailable || vectorIndexReady || vectorSearchUnsupported) return
  try {
    const existingIndexes = await redisClient.sendCommand(['FT._LIST'])
    if (Array.isArray(existingIndexes) && existingIndexes.includes(CHATBOT_VECTOR_INDEX)) {
      vectorIndexReady = true
      return
    }

    await redisClient.sendCommand([
      'FT.CREATE',
      CHATBOT_VECTOR_INDEX,
      'ON',
      'HASH',
      'PREFIX',
      '1',
      CHATBOT_VECTOR_PREFIX,
      'SCHEMA',
      'query_text',
      'TEXT',
      'answer',
      'TEXT',
      'created_at',
      'NUMERIC',
      CHATBOT_VECTOR_FIELD,
      'VECTOR',
      'FLAT',
      '6',
      'TYPE',
      'FLOAT32',
      'DIM',
      String(CHATBOT_VECTOR_DIMS),
      'DISTANCE_METRIC',
      'COSINE',
    ])
    vectorIndexReady = true
    console.log(`Redis vector index ready: ${CHATBOT_VECTOR_INDEX}`)
  } catch (error) {
    const message = error?.message || String(error)
    if (message.includes('unknown command')) {
      vectorSearchUnsupported = true
      console.warn('Redis vector search unavailable (RediSearch missing). Falling back to exact cache.')
      return
    }
    console.error('Failed to initialize vector index:', message)
  }
}

async function fetchQueryEmbedding(message) {
  const res = await fetch(EMBEDDING_SERVICE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })

  const payload = await res.json().catch(() => ({}))
  if (!res.ok || !Array.isArray(payload.embedding)) {
    throw new Error(payload?.detail || payload?.message || 'Embedding service request failed')
  }

  return payload.embedding
}

async function readSemanticCache(queryText, embeddingBuffer) {
  if (!redisClient || !redisAvailable || vectorSearchUnsupported) return null

  await ensureVectorIndex()
  if (!vectorIndexReady) return null

  const result = await redisClient.sendCommand([
    'FT.SEARCH',
    CHATBOT_VECTOR_INDEX,
    `*=>[KNN ${String(CHATBOT_VECTOR_CANDIDATES)} @${CHATBOT_VECTOR_FIELD} $BLOB AS __distance]`,
    'PARAMS',
    '2',
    'BLOB',
    embeddingBuffer,
    'SORTBY',
    '__distance',
    'ASC',
    'RETURN',
    '3',
    'answer',
    'query_text',
    '__distance',
    'DIALECT',
    '2',
  ])

  if (!Array.isArray(result) || result[0] < 1) return null

  let bestHit = null
  for (let i = 1; i < result.length; i += 2) {
    const fields = parseRedisSearchFields(result[i + 1])
    const answer = typeof fields.answer === 'string' ? fields.answer : null
    const cachedQuery = typeof fields.query_text === 'string' ? fields.query_text : ''
    if (!answer) continue

    const distance = Number(fields.__distance)
    if (Number.isNaN(distance)) continue
    const semanticSimilarity = 1 - distance
    const keywordSimilarity = lexicalSimilarity(queryText, cachedQuery)
    const hybridScore =
      (CHATBOT_HYBRID_ALPHA * keywordSimilarity) +
      ((1 - CHATBOT_HYBRID_ALPHA) * semanticSimilarity)

    if (!bestHit || hybridScore > bestHit.hybridScore) {
      bestHit = { answer, semanticSimilarity, hybridScore }
    }
  }

  if (!bestHit) return null
  if (bestHit.semanticSimilarity < CHATBOT_SIMILARITY_THRESHOLD) return null
  return bestHit.answer
}

async function readExactCache(queryText) {
  if (!redisClient || !redisAvailable) return null
  const key = `${CHATBOT_EXACT_PREFIX}${queryText}`
  return redisClient.get(key)
}

async function writeExactCache(queryText, answer) {
  if (!redisClient || !redisAvailable) return
  const key = `${CHATBOT_EXACT_PREFIX}${queryText}`
  await redisClient.set(key, answer, { EX: CHATBOT_EXACT_TTL_SECONDS })
}

async function writeSemanticCache(queryText, answer, embeddingBuffer) {
  if (!redisClient || !redisAvailable) return

  await ensureVectorIndex()
  if (!vectorIndexReady) return

  const key = `${CHATBOT_VECTOR_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  await redisClient.hSet(key, {
    query_text: queryText,
    answer,
    created_at: String(Date.now()),
    [CHATBOT_VECTOR_FIELD]: embeddingBuffer,
  })
}

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

- LLM CrashCourse
  curriculum_outline: Prompt engineering fundamentals, LLM app architecture, RAG basics, evaluation mindset, lightweight deployment patterns.
  learner_rating: 4.8/5
  learner_review_summary: Ideal for developers who want to ship LLM-powered features quickly.

- Masterclasses Bundle
  curriculum_outline: Includes Docker Masterclass, Cursor Masterclass, and additional focused sessions for practical productivity.
  learner_rating: 4.8/5
  learner_review_summary: Loved for concise, high-impact modules that are easy to finish.

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
  setTimeout(() => {
    return res.status(200).json({ courses });
  }, 5000); // intentionally slow API
});

app.post('/api/chatbot', chatbotLimiter, async (req, res) => {
  const { message } = req.body || {}

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ message: 'Message is required' })
  }

  if (message.length > 1000) {
    return res.status(400).json({ message: 'Message is too long. Keep it under 1000 characters.' })
  }

  const normalizedMessage = message.trim()

  if (!groq) {
    return res.status(500).json({
      message: 'Chatbot is not configured. Missing GROQ_API_KEY on the server.',
    })
  }

  try {
    try {
      const exactReply = await readExactCache(normalizedMessage)
      if (exactReply) {
        return res.status(200).json({ reply: exactReply, source: 'redis' })
      }
    } catch (cacheError) {
      console.error('Redis exact read failed, continuing:', cacheError?.message || cacheError)
    }

    const queryEmbedding = await fetchQueryEmbedding(normalizedMessage)
    const embeddingBuffer = toFloat32Buffer(queryEmbedding)

    try {
      const cachedReply = await readSemanticCache(normalizedMessage, embeddingBuffer)
      if (cachedReply) {
        return res.status(200).json({ reply: cachedReply, source: 'redis' })
      }
    } catch (cacheError) {
      console.error('Redis semantic read failed, continuing with LLM call:', cacheError?.message || cacheError)
    }

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0.3,
      max_tokens: 500,
      messages: [
        { role: 'system', content: BYTE_MONK_SYSTEM_PROMPT.trim() },
        { role: 'user', content: normalizedMessage },
      ],
    })

    const answer = completion.choices?.[0]?.message?.content?.trim()
    if (!answer) {
      return res.status(502).json({ message: 'No response received from chatbot model.' })
    }

    try {
      if (vectorSearchUnsupported) {
        await writeExactCache(normalizedMessage, answer)
      } else {
        await writeSemanticCache(normalizedMessage, answer, embeddingBuffer)
      }
    } catch (cacheError) {
      console.error('Redis cache write failed, returning uncached response:', cacheError?.message || cacheError)
    }

    return res.status(200).json({ reply: answer, source: 'LLM' })
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