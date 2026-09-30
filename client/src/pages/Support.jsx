import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icons'
import { api } from '../lib/api'
import './Support.css'

const POLL_MS = 3000
const MAX_LEN = 1000

const timeOf = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

function dayLabel(d) {
  const t = new Date(d).toDateString()
  if (t === new Date().toDateString()) return 'Today'
  if (t === new Date(Date.now() - 86400000).toDateString()) return 'Yesterday'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Append without duplicates (a sent message can also arrive through polling)
const merge = (list, add) => {
  const ids = new Set(list.map((m) => m.id))
  return [...list, ...add.filter((m) => !ids.has(m.id))]
}

export default function Support() {
  const navigate = useNavigate()
  const [messages, setMessages] = useState(null)
  const [seenUpTo, setSeenUpTo] = useState(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const stickRef = useRef(true) // keep the view pinned to the newest message
  const lastIdRef = useRef(null)

  useEffect(() => {
    lastIdRef.current = messages?.length ? messages[messages.length - 1].id : null
  }, [messages])

  const poll = useCallback(async () => {
    const after = lastIdRef.current
    const d = await api.get(`/support/messages${after ? `?after=${after}` : ''}`)
    setMessages((list) => (after && list ? merge(list, d.messages) : d.messages))
    setSeenUpTo(d.seenUpTo)
  }, [])

  useEffect(() => {
    let cancelled = false
    poll().catch((e) => !cancelled && setError(e.message))
    const t = setInterval(() => poll().catch(() => {}), POLL_MS)
    return () => { cancelled = true; clearInterval(t) }
  }, [poll])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const onScroll = () => {
    const el = scrollRef.current
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  // Grow the input with its content, up to ~5 lines
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [text])

  const send = async () => {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setError('')
    try {
      const { message } = await api.post('/support/messages', { text: body })
      stickRef.current = true
      setMessages((list) => merge(list ?? [], [message]))
      setText('')
    } catch (err) {
      setError(err.message)
    }
    setSending(false)
    inputRef.current?.focus()
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }

  let lastDay = null
  return (
    <div className="cs-root">
      <header className="cs-header">
        <button type="button" className="cs-back" onClick={() => navigate(-1)} aria-label="Back">
          <Icon name="chevronLeft" size={22} strokeWidth={2.4} />
        </button>
        <div className="cs-agent">
          <Icon name="headset" size={20} />
          <i className="cs-online" />
        </div>
        <div className="cs-head-text">
          <strong>Customer Service</strong>
          <span>Online · we usually reply within a few minutes</span>
        </div>
      </header>

      <main className="cs-body" ref={scrollRef} onScroll={onScroll}>
        <div className="cs-day"><span>Customer service</span></div>
        <div className="cs-row cs-in">
          <div className="cs-bubble">
            <b className="cs-from">Support team</b>
            <span className="cs-text">Hi! Welcome to 55CLUB support. Tell us how we can help with deposits, withdrawals, games or your account.</span>
          </div>
        </div>

        {messages === null && !error && <div className="cs-loading"><span className="cs-spinner" /></div>}

        {messages?.map((m) => {
          const day = dayLabel(m.time)
          const showDay = day !== lastDay
          lastDay = day
          const mine = m.from === 'user'
          const seen = mine && seenUpTo && m.id <= seenUpTo
          return (
            <div key={m.id}>
              {showDay && <div className="cs-day"><span>{day}</span></div>}
              <div className={`cs-row ${mine ? 'cs-out' : 'cs-in'}`}>
                <div className="cs-bubble">
                  {!mine && <b className="cs-from">Support team</b>}
                  <span className="cs-text">{m.text}</span>
                  <span className="cs-meta">
                    {timeOf(m.time)}
                    {mine && <Icon name={seen ? 'checkCheck' : 'check'} size={14} strokeWidth={2.2} className={seen ? 'cs-seen' : ''} />}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </main>

      <footer className="cs-composer">
        {error && <div className="cs-error" role="alert"><Icon name="circleAlert" size={14} /> {error}</div>}
        <div className="cs-compose-row">
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            maxLength={MAX_LEN}
            placeholder="Type a message"
            aria-label="Message"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button type="button" className="cs-send" onClick={send} disabled={!text.trim() || sending} aria-label="Send">
            {sending ? <span className="cs-spinner cs-spinner-light" /> : <Icon name="send" size={19} strokeWidth={2.1} />}
          </button>
        </div>
      </footer>
    </div>
  )
}
