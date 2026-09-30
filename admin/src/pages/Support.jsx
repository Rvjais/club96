import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, money } from '../api'
import { Icon } from '../Icons'
import './Support.css'

const THREADS_POLL_MS = 5000
const CHAT_POLL_MS = 3000
const MAX_LEN = 1000
const AVATAR_COLORS = ['#e57373', '#f06292', '#ba68c8', '#7986cb', '#4fc3f7', '#4db6ac', '#81c784', '#ffb74d', '#a1887f', '#90a4ae']

const avatarColor = (id) => AVATAR_COLORS[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATAR_COLORS.length]
const initials = (name) => name.replace(/[^\p{L}\p{N} ]/gu, '').split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?'
const timeOf = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

function isToday(d) { return new Date(d).toDateString() === new Date().toDateString() }
function isYesterday(d) { return new Date(d).toDateString() === new Date(Date.now() - 86400000).toDateString() }

/** Chat-list timestamp: 4:05 pm · Yesterday · 12/09/26 */
function listTime(d) {
  if (isToday(d)) return timeOf(d)
  if (isYesterday(d)) return 'Yesterday'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function dayLabel(d) {
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

const merge = (list, add) => {
  const ids = new Set(list.map((m) => m.id))
  return [...list, ...add.filter((m) => !ids.has(m.id))]
}

function Avatar({ user, size = 46 }) {
  return (
    <span className="wa-avatar" style={{ width: size, height: size, background: avatarColor(user.id), fontSize: size * 0.36 }}>
      {initials(user.name)}
    </span>
  )
}

function Ticks({ seen }) {
  return <span className={`wa-ticks ${seen ? 'is-seen' : ''}`}><Icon name="check2" size={16} strokeWidth={2.2} /></span>
}

// ── Chat list ────────────────────────────────────────────────
function ThreadList({ threads, activeId, q, setQ }) {
  const navigate = useNavigate()
  const unreadChats = threads?.filter((t) => t.unread > 0).length ?? 0

  return (
    <aside className="wa-list">
      <div className="wa-list-head">
        <h1>Chats</h1>
        {unreadChats > 0 && <span className="wa-list-count">{unreadChats} unread</span>}
      </div>
      <div className="wa-search">
        <Icon name="search" size={16} />
        <input placeholder="Search name, phone or UID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search chats" />
        {q && <button type="button" onClick={() => setQ('')} aria-label="Clear search"><Icon name="x" size={14} /></button>}
      </div>

      <div className="wa-threads">
        {threads === null && <div className="wa-list-empty"><span className="spinner" /></div>}
        {threads?.length === 0 && (
          <div className="wa-list-empty">
            <Icon name="message" size={30} strokeWidth={1.5} />
            <p>{q ? 'No chats match your search' : 'No conversations yet. Messages players send from Customer Service appear here.'}</p>
          </div>
        )}
        {threads?.map((t) => {
          const mine = t.last.from === 'admin'
          return (
            <button
              type="button"
              key={t.user.id}
              className={`wa-thread ${t.user.id === activeId ? 'is-active' : ''} ${t.unread > 0 ? 'is-unread' : ''}`}
              onClick={() => navigate(`/support/${t.user.id}`)}
            >
              <Avatar user={t.user} />
              <div className="wa-thread-main">
                <div className="wa-thread-top">
                  <strong>{t.user.name}</strong>
                  <time>{listTime(t.last.time)}</time>
                </div>
                <div className="wa-thread-bottom">
                  <span className="wa-preview">
                    {mine && <Ticks seen={Boolean(t.last.readAt)} />}
                    {t.last.text}
                  </span>
                  {t.unread > 0 && <em className="wa-unread">{t.unread}</em>}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

// ── Open conversation ────────────────────────────────────────
function Conversation({ userId, onSent }) {
  const navigate = useNavigate()
  const [data, setData] = useState(null) // { user, messages, seenUpTo }
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const stickRef = useRef(true)
  const lastIdRef = useRef(null)

  const messages = data?.messages
  useEffect(() => {
    lastIdRef.current = messages?.length ? messages[messages.length - 1].id : null
  }, [messages])

  const poll = useCallback(async () => {
    const after = lastIdRef.current
    const d = await api.get(`/support/threads/${userId}${after ? `?after=${after}` : ''}`)
    setData((prev) => (after && prev ? { ...d, messages: merge(prev.messages, d.messages) } : d))
  }, [userId])

  useEffect(() => {
    let cancelled = false
    lastIdRef.current = null
    stickRef.current = true
    poll().catch((e) => !cancelled && setError(e.message))
    const t = setInterval(() => poll().catch(() => {}), CHAT_POLL_MS)
    inputRef.current?.focus()
    return () => { cancelled = true; clearInterval(t) }
  }, [poll])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [messages])

  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [text])

  const onScroll = () => {
    const el = scrollRef.current
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const send = async () => {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setError('')
    try {
      const { message } = await api.post(`/support/threads/${userId}`, { text: body })
      stickRef.current = true
      setData((d) => ({ ...d, messages: merge(d?.messages ?? [], [message]) }))
      setText('')
      onSent()
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

  const u = data?.user
  let lastDay = null
  return (
    <section className="wa-chat">
      <header className="wa-chat-head">
        <button type="button" className="wa-back" onClick={() => navigate('/support')} aria-label="Back to chats">
          <Icon name="arrowLeft" size={20} />
        </button>
        {u ? (
          <>
            <Avatar user={u} size={40} />
            <div className="wa-chat-who">
              <strong>{u.name} {u.status === 'blocked' && <span className="badge badge-blocked">Blocked</span>}</strong>
              <span>{u.uid ? `UID ${u.uid} · ` : ''}{u.phone} · Balance {money(u.balance)}</span>
            </div>
            <Link to={`/users/${u.id}`} className="btn btn-ghost wa-profile"><Icon name="user" size={16} /> Profile</Link>
          </>
        ) : (
          <div className="wa-chat-who"><strong>{error ? 'Conversation' : 'Loading…'}</strong></div>
        )}
      </header>

      <div className="wa-messages" ref={scrollRef} onScroll={onScroll}>
        {!data && !error && <div className="wa-list-empty"><span className="spinner" /></div>}
        {data?.messages.length === 0 && (
          <div className="wa-day"><span>No messages yet — say hello to start the conversation</span></div>
        )}
        {data?.messages.map((m) => {
          const day = dayLabel(m.time)
          const showDay = day !== lastDay
          lastDay = day
          const mine = m.from === 'admin'
          return (
            <div key={m.id}>
              {showDay && <div className="wa-day"><span>{day}</span></div>}
              <div className={`wa-row ${mine ? 'wa-out' : 'wa-in'}`}>
                <div className="wa-bubble">
                  <span className="wa-text">{m.text}</span>
                  <span className="wa-meta">
                    {timeOf(m.time)}
                    {mine && <Ticks seen={Boolean(data.seenUpTo && m.id <= data.seenUpTo)} />}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <footer className="wa-composer">
        {error && <div className="alert alert-error"><Icon name="alert" size={15} /> {error}</div>}
        <div className="wa-compose-row">
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
          <button type="button" className="wa-send" onClick={send} disabled={!text.trim() || sending} aria-label="Send">
            {sending ? <span className="spinner spinner-sm spinner-light" /> : <Icon name="send" size={20} strokeWidth={2} />}
          </button>
        </div>
      </footer>
    </section>
  )
}

// ── Page ─────────────────────────────────────────────────────
export default function Support({ onUnreadChange }) {
  const { id } = useParams()
  const [threads, setThreads] = useState(null)
  const [q, setQ] = useState('')

  const loadThreads = useCallback(async () => {
    const d = await api.get(`/support/threads${q ? `?q=${encodeURIComponent(q)}` : ''}`)
    // The open chat is being read right now
    const list = d.threads.map((t) => (t.user.id === id ? { ...t, unread: 0 } : t))
    setThreads(list)
    if (!q) onUnreadChange?.(list.reduce((n, t) => n + t.unread, 0))
  }, [q, id, onUnreadChange])

  useEffect(() => {
    let cancelled = false
    const run = () => loadThreads().catch(() => {})
    const debounce = setTimeout(() => !cancelled && run(), q ? 250 : 0)
    const t = setInterval(run, THREADS_POLL_MS)
    return () => { cancelled = true; clearTimeout(debounce); clearInterval(t) }
  }, [loadThreads, q])

  return (
    <div className={`wa ${id ? 'has-chat' : ''}`}>
      <ThreadList threads={threads} activeId={id} q={q} setQ={setQ} />
      {id ? (
        <Conversation key={id} userId={id} onSent={() => loadThreads().catch(() => {})} />
      ) : (
        <section className="wa-chat wa-idle">
          <div className="wa-idle-inner">
            <span className="wa-idle-icon"><Icon name="message" size={34} strokeWidth={1.6} /></span>
            <h2>Customer service</h2>
            <p>Pick a chat on the left to read and reply. Players write to you from <strong>Account → Customer Service</strong> on the site.</p>
          </div>
        </section>
      )}
    </div>
  )
}
