import { useLocation, useNavigate } from 'react-router-dom'
import { Icon } from './Icons'
import './BottomNav.css'

const ITEMS = [
  { icon: 'home', label: 'Home', to: '/game' },
  { icon: 'gift', label: 'Activity', dot: true },
  { cta: true },
  { icon: 'megaphone', label: 'Promotion' },
  { icon: 'user', label: 'Account', to: '/account' },
]

/** App-style bottom navigation shared by the lobby and account pages. */
export default function BottomNav({ onSoon }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <nav className="bn">
      {ITEMS.map((item) =>
        item.cta ? (
          <button type="button" key="cta" className="bn-cta" onClick={() => onSoon?.('Promotions are coming soon')}>
            <span className="bn-cta-orb">
              <Icon name="gift" size={24} strokeWidth={2} />
            </span>
            <span className="bn-cta-label">Get ₹500</span>
          </button>
        ) : (
          <button
            type="button"
            key={item.label}
            className={`bn-item ${item.to && pathname.startsWith(item.to) ? 'is-active' : ''}`}
            onClick={() => (item.to ? navigate(item.to) : onSoon?.(`${item.label} is coming soon`))}
          >
            <span className="bn-icon">
              <Icon name={item.icon} size={22} strokeWidth={item.to && pathname.startsWith(item.to) ? 2.2 : 1.8} />
              {item.dot && <span className="bn-dot" />}
            </span>
            <span className="bn-label">{item.label}</span>
          </button>
        ),
      )}
    </nav>
  )
}
