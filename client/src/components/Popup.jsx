import { useEffect } from 'react'
import { Icon } from './Icons'
import './Popup.css'

/**
 * Centered pop-up card. `tone` colours the badge: 'gift' (celebration) or 'warn'.
 * `actions` = [{ label, onClick, primary }]
 */
export default function Popup({ open, tone = 'gift', icon, kicker, title, amount, children, actions, onClose }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="pp-overlay">
      <div className="pp-backdrop" onClick={onClose} />
      <div className={`pp-card pp-${tone}`} role="dialog" aria-modal="true" aria-label={title}>
        <button type="button" className="pp-close" onClick={onClose} aria-label="Close">
          <Icon name="x" size={16} strokeWidth={2.4} />
        </button>
        <div className="pp-top">
          {tone === 'gift' && <div className="pp-rays" aria-hidden="true" />}
          <div className="pp-badge"><Icon name={icon} size={34} strokeWidth={1.8} /></div>
        </div>
        {kicker && <div className="pp-kicker">{kicker}</div>}
        <h2 className="pp-title">{title}</h2>
        {amount != null && <div className="pp-amount">{amount}</div>}
        {children && <div className="pp-text">{children}</div>}
        <div className="pp-actions">
          {actions.map((a) => (
            <button type="button" key={a.label} className={a.primary ? 'pp-btn pp-btn-primary' : 'pp-btn'} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
