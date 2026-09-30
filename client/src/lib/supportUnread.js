import { useEffect, useState } from 'react'
import { api } from './api'

/** Number of unread customer-service replies, refreshed every 30s. */
export function useSupportUnread() {
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    let cancelled = false
    const poll = () => api.get('/support/unread').then((d) => !cancelled && setUnread(d.unread), () => {})
    poll()
    const t = setInterval(poll, 30000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])
  return unread
}
