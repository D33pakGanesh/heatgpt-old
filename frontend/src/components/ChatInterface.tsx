import { useState, useRef, useEffect } from 'react'

interface HeatStats {
  lgaId: string; lgaName: string; avgLstCelsius: number; avgNdvi: number
  uhiIntensity: number; dataSource: string; dateRangeStart: string
  dateRangeEnd: string; processedAt: string
}
interface ChatInterfaceProps { lgaId: string; heatStats: HeatStats }
interface ChatMessage { role: 'user' | 'assistant'; content: string; timestamp: Date }

const PROMPT_CHIPS = [
  'Why is this area hot?',
  'What does the NDVI indicate?',
  'How can heat be reduced here?',
  'Compare to regional average',
]

export default function ChatInterface({ lgaId, heatStats }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  async function sendQuestion(question: string) {
    if (!question.trim() || loading) return
    const userMsg: ChatMessage = { role: 'user', content: question, timestamp: new Date() }
    const updated = [...messages, userMsg]
    setMessages(updated); setInput(''); setLoading(true); setError(false)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lgaId, question, heatStats, history: messages }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setMessages([...updated, { role: 'assistant', content: data.answer, timestamp: new Date() }])
    } catch { setError(true) }
    finally { setLoading(false) }
  }

  function handleRetry() {
    let idx = -1
    for (let i = messages.length - 1; i >= 0; i--) { if (messages[i].role === 'user') { idx = i; break } }
    if (idx === -1) return
    const q = messages[idx].content
    setMessages(prev => prev.filter((_, i) => i !== idx))
    sendQuestion(q)
  }

  return (
    <>
      <style>{`
        @keyframes dotPulse { 0%,100%{opacity:1} 50%{opacity:0.25} }
        .chat-dot { display:inline-block; width:5px; height:5px; border-radius:50%; background:#94a3b8; animation:dotPulse 1.2s ease-in-out infinite; }
        .chat-dot:nth-child(2){animation-delay:0.2s} .chat-dot:nth-child(3){animation-delay:0.4s}
      `}</style>

      <div style={{ borderTop: '1px solid #f1f5f9', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Section header */}
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Ask HeatGPT
        </div>

        {/* Messages */}
        {messages.length > 0 && (
          <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '2px' }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                padding: '9px 13px', borderRadius: '10px', fontSize: '13px', lineHeight: 1.55,
                maxWidth: '88%', fontWeight: 400,
                ...(msg.role === 'user'
                  ? { backgroundColor: '#2563eb', color: '#fff', alignSelf: 'flex-end', borderBottomRightRadius: '3px' }
                  : { backgroundColor: '#f1f5f9', color: '#0f172a', alignSelf: 'flex-start', borderBottomLeftRadius: '3px' }),
              }}>{msg.content}</div>
            ))}
            {loading && (
              <div style={{ backgroundColor: '#f1f5f9', alignSelf: 'flex-start', padding: '10px 14px', borderRadius: '10px', borderBottomLeftRadius: '3px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                <span className="chat-dot" /><span className="chat-dot" /><span className="chat-dot" />
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
        {loading && messages.length === 0 && (
          <div style={{ backgroundColor: '#f1f5f9', alignSelf: 'flex-start', padding: '10px 14px', borderRadius: '10px', display: 'flex', gap: '4px', alignItems: 'center' }}>
            <span className="chat-dot" /><span className="chat-dot" /><span className="chat-dot" />
          </div>
        )}
        {error && (
          <button onClick={handleRetry} style={{ padding: '6px 14px', backgroundColor: '#fef2f2', color: '#dc2626',
            border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', alignSelf: 'flex-start' }}>
            Retry
          </button>
        )}

        {/* Prompt chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {PROMPT_CHIPS.map(chip => (
            <button key={chip} onClick={() => setInput(chip)} disabled={loading} style={{
              backgroundColor: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0',
              borderRadius: '999px', padding: '4px 11px', fontSize: '12px', fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer', lineHeight: 1.5,
              opacity: loading ? 0.5 : 1,
            }}>{chip}</button>
          ))}
        </div>

        {/* Input row */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <input type="text" placeholder="Ask about this area's heat data..."
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendQuestion(input)}
            disabled={loading}
            style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '7px',
              fontSize: '13px', outline: 'none', backgroundColor: loading ? '#f8fafc' : '#fff',
              color: '#0f172a', fontFamily: 'inherit',
            }} />
          <button onClick={() => sendQuestion(input)} disabled={loading || !input.trim()} style={{
            padding: '8px 16px', backgroundColor: loading || !input.trim() ? '#bfdbfe' : '#2563eb',
            color: '#fff', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 600,
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            letterSpacing: '0.01em',
          }}>Send</button>
        </div>
      </div>
    </>
  )
}
