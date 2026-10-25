import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/authContext'
import { money } from '../../lib/format'
import { Icon } from '../../components/Icons'
import './GameShell.css'

const TOAST_ICON = { success: 'circleCheck', error: 'circleAlert', info: 'info' }

/**
 * Shared full-screen casino game frame.
 *
 * - Sticky blurred header: back button (goes to /game lobby), brand tile
 *   with accent glow, live dot, wallet chip with balance + refresh spinner.
 * - `children` scroll inside the page; `footer` renders as a sticky bottom
 *   bet dock (glass blur) so the stake + CTA stay reachable.
 * - `toast` = { kind: 'success'|'error'|'info', text, id } (games own the timer).
 * - `accent` hex drives every glow via the --gs-accent CSS variable.
 */
export default function GameShell({
  icon,
  title,
  tagline,
  accent = '#f7c948',
  live = false,
  toast,
  busy = false,
  onRefresh,
  wide = false,
  children,
  footer,
}) {
  const navigate = useNavigate()
  const { balance, refresh: refreshWallet } = useAuth()
  const [spin, setSpin] = useState(false)

  const doRefresh = () => {
    if (spin) return
    setSpin(true)
    Promise.all([refreshWallet().catch(() => {}), onRefresh ? onRefresh() : null])
      .catch(() => {})
      .finally(() => setTimeout(() => setSpin(false), 450))
  }

  const t = typeof toast === 'string' ? { kind: 'info', text: toast } : toast
  const tKind = t?.kind ?? 'info'

  return (
    <div className={`gs-root ${wide ? 'gs-wide' : ''}`} style={{ '--gs-accent': accent }}>
      <header className="gs-header">
        <div className="gs-header-inner">
          <button type="button" className="gs-back" onClick={() => navigate('/game')} aria-label="Back to lobby">
            <Icon name="arrowLeft" size={18} strokeWidth={2.4} />
          </button>
          <div className="gs-brand">
            <div className="gs-brand-mark">
              <Icon name={icon || 'gamepad'} size={21} strokeWidth={2} />
            </div>
            <div className="gs-brand-copy">
              <h1 className="gs-brand-name">{title}</h1>
              {tagline && <em className="gs-brand-tag">{tagline}</em>}
            </div>
            {(live || busy) && (
              <span className={`gs-live ${busy ? 'gs-live-busy' : ''}`}>
                <i className="gs-live-dot" />
                {busy ? 'IN PLAY' : 'LIVE'}
              </span>
            )}
          </div>
          <div className="gs-wallet">
            <span className="gs-wallet-amt">{money(balance)}</span>
            <button type="button" className={`gs-refresh ${spin ? 'is-spinning' : ''}`} onClick={doRefresh} aria-label="Refresh balance">
              <Icon name="refresh" size={15} strokeWidth={2.2} />
            </button>
          </div>
        </div>
      </header>

      <main className="gs-main">{children}</main>

      {footer && (
        <footer className="gs-dock">
          <div className="gs-dock-inner">{footer}</div>
        </footer>
      )}

      {t && t.text && (
        <div key={t.id ?? t.text} className={`gs-toast gs-toast-${tKind}`} role="status">
          <Icon name={TOAST_ICON[tKind] || 'info'} size={15} strokeWidth={2.2} />
          <span>{t.text}</span>
        </div>
      )}
    </div>
  )
}

/**
 * Standalone floating back button — for pages patched over an older layout
 * that cannot wrap in GameShell wholesale.
 */
export function BackFab() {
  const navigate = useNavigate()
  return (
    <button type="button" className="gs-back gs-backfab" onClick={() => navigate('/game')} aria-label="Back to lobby">
      <Icon name="arrowLeft" size={18} strokeWidth={2.4} />
    </button>
  )
}
