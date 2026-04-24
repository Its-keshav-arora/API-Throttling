import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { askChatbot } from '../lib/api'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
}

const initialMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: 'Welcome to Bytemonk — ready to go from "it works on my machine" to "it scales in production"?',
}

function toPlainChatText(value: string): string {
  return value
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`{1,3}/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .trim()
}

function formatChatResponseWithSource(reply: string, source?: string): string {
  const cleanReply = toPlainChatText(reply)
  const normalizedSource = source === 'redis' ? 'redis' : 'LLM'
  return `${cleanReply}\nsource : ${normalizedSource}`
}

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage])
  const [error, setError] = useState<string | null>(null)
  const messagesRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open || !messagesRef.current) return
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight
  }, [messages, loading, open])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text,
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setError(null)
    setLoading(true)

    try {
      const response = await askChatbot(text)
      const botMessage: ChatMessage = {
        id: `b-${Date.now()}`,
        role: 'assistant',
        text: formatChatResponseWithSource(response.reply, response.source),
      }
      setMessages((prev) => [...prev, botMessage])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get chatbot response.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="chatbot-root">
      {open ? (
        <section className="chatbot-panel" aria-label="ByteMonk chatbot">
          <header className="chatbot-header">
            <div className="chatbot-title-wrap">
              <img src="/bytemonk.png" alt="ByteMonk chatbot logo" className="chatbot-logo" />
              <div>
                <h3 className="chatbot-title">ByteMonk Chatbot</h3>
                <p className="chatbot-subtitle">Courses • Himalay • Cloud • System Design</p>
              </div>
            </div>
            <button
              type="button"
              className="chatbot-close"
              onClick={() => setOpen(false)}
              aria-label="Close chatbot"
            >
              x
            </button>
          </header>

          <div className="chatbot-messages" aria-live="polite" ref={messagesRef}>
            {messages.map((message) => (
              <div key={message.id} className={`chatbot-bubble chatbot-bubble--${message.role}`}>
                {message.text}
              </div>
            ))}
            {loading ? <div className="chatbot-typing">ByteMonk bot is thinking...</div> : null}
          </div>

          <form className="chatbot-form" onSubmit={onSubmit}>
            <input
              type="text"
              className="chatbot-input"
              placeholder="Ask about ByteMonk courses..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={1000}
            />
            <button type="submit" className="chatbot-send" disabled={loading || !input.trim()}>
              Send
            </button>
          </form>

          {error ? <p className="chatbot-error">{error}</p> : null}
        </section>
      ) : null}

      <button
        type="button"
        className="chatbot-fab"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? 'Close ByteMonk chatbot' : 'Open ByteMonk chatbot'}
      >
        <img src="/bytemonk.png" alt="" className="chatbot-fab-logo" />
      </button>
    </div>
  )
}
