import { useEffect, useState } from 'react'
import { api } from './api'

// Admin-set site rules (sign-up bonus, minimum balance to play), fetched once per page load
let cached = null
let pending = null

function load() {
  pending ??= api.get('/auth/config').then(
    (c) => (cached = c),
    () => { pending = null; return null },
  )
  return pending
}

/** { signupBonus, minPlayBalance } in rupees, or null while loading. */
export function useSiteConfig() {
  const [config, setConfig] = useState(cached)
  useEffect(() => {
    if (cached) return
    let cancelled = false
    load().then((c) => !cancelled && c && setConfig(c))
    return () => { cancelled = true }
  }, [])
  return config
}
