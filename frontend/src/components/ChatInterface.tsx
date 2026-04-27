import { useState, useRef, useEffect } from 'react'

interface HeatStats {
  lgaId: string
  lgaName: string
  avgLstCelsius: number
  avgNdvi: number
  uhiIntensity: number
  dataSource: string
  dateRangeStart: string
  dateRangeEnd: string
  processedAt: string
}

interface ChatInterfaceProps {
  lgaId: string
  heatStats: HeatStats
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const PROMPT_CHIPS = [
  'Why is this area hot?',
  'What does the NDVI mean?',
  'How does this compare to other areas?',
  'What can be done to reduce heat?',
]

export default function ChatInterface({ lgaId, heatStats }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendQuestion(question: string) {
    if (!question.trim() || loading) return

    const userMessage: ChatMessage = { role: 'user', content: question, timestamp: new Date() }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)
    setError(false)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lgaId, question, heatStats, history: messages }),
      })

      if (!res.ok) throw new Error('Request failed')

      const data = await res.json()
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.answer,
        timestamp: new Date(),
      }
      setMessages([...updatedMessages, assistantMessage])
    } catch {
      setError(true)
      // Keep the user message in history but mark error state
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit() {
    sendQuestion(input)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSubmit()
  }

  function handleRetry() {
    // Find the last user message index
    let lastUserIdx = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { lastUserIdx = i; break }
    }
    if (lastUserIdx === -1) return
    const question = messages[lastUserIdx].content
    // Remove the last user message so sendQuestion re-adds it cleanly
    setMessages(prev => prev.filter((_, i) => i !== lastUserIdx))
    sendQuestion(question)
  }

  const containerStyle: React.CSSProperties = {
    width: '100%',
    borderTop: '1px solid #e5e7eb',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    boxSizing: 'border-box',
  }

  const messagesAreaStyle: React.CSSProperties = {
    maxHeight: '300px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  }

  const chipsRowStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  }

  const chipStyle: React.CSSProperties = {
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: '999px',
    padding: '4px 10px',
    fontSize: '12px',
    cursor: 'pointer',
    lineHeight: 1.4,
  }

  const inputRowStyle: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
  }

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    backgroundColor: loading ? '#f9fafb' : '#fff',
  }

  const sendButtonStyle: React.CSSProperties = {
    padding: '8px 16px',
    backgroundColor: loading ? '#93c5fd' : '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    cursor: loading ? 'not-allowed' : 'pointer',
    fontWeight: 500,
  }

  const retryButtonStyle: React.CSSProperties = {
    padding: '6px 14px',
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    border: '1px solid #fca5a5',
    borderRadius: '8px',
    fontSize: '13px',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  }

  return (
    <>
      <style>{`
        @keyframes chatDotPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .chat-dot {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #9ca3af;
          animation: chatDotPulse 1.2s ease-in-out infinite;
        }
        .chat-dot:nth-child(2) { animation-delay: 0.2s; }
        .chat-dot:nth-child(3) { animation-delay: 0.4s; }
      `}</style>

      <div style={containerStyle}>
        {messages.length > 0 && (
          <div style={messagesAreaStyle}>
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  padding: '8px 12px',
                  borderRadius: '12px',
                  fontSize: '14px',
                  lineHeight: 1.5,
                  maxWidth: '85%',
                  ...(msg.role === 'user'
                    ? { backgroundColor: '#3b82f6', color: '#fff', alignSelf: 'flex-end' }
                    : { backgroundColor: '#f3f4f6', color: '#111827', alignSelf: 'flex-start' }),
                }}
              >
                {msg.content}
              </div>
            ))}

            {loading && (
              <div style={{ backgroundColor: '#f3f4f6', color: '#111827', alignSelf: 'flex-start', padding: '10px 14px', borderRadius: '12px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                <span className="chat-dot" />
                <span className="chat-dot" />
                <span className="chat-dot" />
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}

        {loading && messages.length === 0 && (
          <div style={{ backgroundColor: '#f3f4f6', alignSelf: 'flex-start', padding: '10px 14px', borderRadius: '12px', display: 'flex', gap: '4px', alignItems: 'center' }}>
            <span className="chat-dot" />
            <span className="chat-dot" />
            <span className="chat-dot" />
          </div>
        )}

        {error && (
          <button style={retryButtonStyle} onClick={handleRetry}>
            Retry
          </button>
        )}

        <div style={chipsRowStyle}>
          {PROMPT_CHIPS.map(chip => (
            <button
              key={chip}
              style={chipStyle}
              onClick={() => setInput(chip)}
              disabled={loading}
            >
              {chip}
            </button>
          ))}
        </div>

        <div style={inputRowStyle}>
          <input
            style={inputStyle}
            type="text"
            placeholder="Ask about this area's heat..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          <button
            style={sendButtonStyle}
            onClick={handleSubmit}
            disabled={loading || !input.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </>
  )
}
