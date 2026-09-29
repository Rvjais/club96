import { useEffect } from 'react'
import { Icon } from './Icons'
import './Sheet.css'

/** Mobile bottom sheet. Closes on backdrop click or Escape. */
export default function Sheet({ open, title, onClose, children }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div className={`sheet-overlay ${open ? 'is-open' : ''}`} aria-hidden={!open}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} strokeWidth={2.4} />
          </button>
        </div>
        {open && <div className="sheet-body">{children}</div>}
      </div>
    </div>
  )
}
