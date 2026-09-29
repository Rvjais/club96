import { useNavigate, Link } from 'react-router-dom'
import './Home.css'

const tableRows = [
  { label: 'Website Name', value: 'Club 55 Game', link: true },
  { label: 'Year of Launch', value: 'Jan, 2026' },
  { label: 'Games Available', value: 'Wingo, Trx, Color Prediction, Lottery' },
  { label: 'Deposit & Withdrawal', value: 'UPI, Bank Transfer, USDT, E-Wallet' },
  { label: 'Daily Agent Salary', value: 'Up to 10%' },
  { label: 'Minimum Deposit', value: 'Rs. 100' },
  { label: 'Official Website', value: 'club55.com', link: true },
]

const benefits = [
  { title: 'Convenience', text: 'Access games and draws 24/7 from your smartphone or computer.' },
  { title: 'Instant Access', text: 'Users can log in instantly and check their results in real time.' },
  { title: 'Fair Play', text: 'Every draw is automated and verifiable, ensuring transparency.' },
  { title: 'Exclusive Bonuses', text: 'New users receive welcome bonuses and participation rewards.' },
  { title: 'Secure Platform', text: 'All transactions are encrypted for user safety.' },
]

const steps = [
  { title: 'Visit the official website', text: 'Go to club55.com on your browser.' },
  { title: 'Register your account', text: 'Click Register and fill in your details.' },
  { title: 'Add funds', text: 'Deposit using UPI, bank transfer, or e-wallet.' },
  { title: 'Pick a game', text: 'Choose from Wingo, Trx, Color Prediction and more.' },
  { title: 'Withdraw winnings', text: 'Cash out your earnings instantly to your account.' },
]

const faqs = [
  { q: 'Is Club 55 safe to use?', a: 'Yes. The platform ensures fair play with verified results and secure data encryption.' },
  { q: 'How do I check my results?', a: 'Results are available in the "My Results" section within the app or website, updated after every draw.' },
  { q: 'Can I play Club 55 without downloading an app?', a: 'Yes. You can participate through the official web platform without downloading the app.' },
  { q: 'Is mobile access available?', a: 'Yes, users can access the platform through a browser or APK.' },
  { q: 'Is registration free?', a: 'Yes. Creating an account on Club 55 is completely free.' },
]

export default function Home() {
  const navigate = useNavigate()

  return (
    <div className="page">
      {/* Top bar */}
      <div className="topbar">
        <button className="btn-red" onClick={() => navigate('/login')}>Login</button>
        <button className="btn-red" onClick={() => navigate('/signup')}>Register</button>
      </div>

      {/* Sub-nav */}
      <nav className="subnav">
        <span className="subnav-brand">Club 55 Login</span>
        <div className="subnav-links">
          <Link to="/" className="subnav-link">Club 55 Game</Link>
          <Link to="/" className="subnav-link">Blog</Link>
        </div>
      </nav>

      <main className="main">
        <h1 className="page-heading">Club 55 Game</h1>

        {/* Logo block */}
        <div className="logo-block">
          <div className="logo-box">
            <div className="logo-ring">
              <span className="logo-num">55</span>
            </div>
            <span className="logo-text">55CLUB</span>
          </div>
          <button className="btn-red btn-register" onClick={() => navigate('/signup')}>Register On Club 55</button>
          <button className="btn-red btn-register" onClick={() => navigate('/login')}>Login To Club 55</button>
        </div>

        {/* Info table */}
        <div className="section">
          <table className="info-table">
            <tbody>
              {tableRows.map((row) => (
                <tr key={row.label}>
                  <td className="td-label">{row.label}</td>
                  <td className="td-value">
                    {row.link ? <a href="#" className="red-link">{row.value}</a> : row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* About */}
        <div className="section">
          <p className="body-text">
            <a href="#" className="red-link">Club 55</a> is an online colour prediction platform where users
            can choose colours and participate in short prediction-based rounds. The concept is simple and easy
            to understand, making it accessible to people interested in this type of online entertainment.
            Users should carefully check the platform's terms, privacy policy, and applicable local laws before
            using any such service.
          </p>
          <p className="body-text mt">
            Club 55 colour prediction involves risk and outcomes are not guaranteed. It should never be treated
            as a reliable way to earn money or recover losses. Only adults who are legally permitted to
            participate should consider using such platforms. Avoid spending money you cannot afford to lose.
          </p>
        </div>

        {/* Why Choose */}
        <div className="section">
          <h2 className="section-heading">Why Choose Club 55 Game Over Other Platforms?</h2>
          <p className="body-text">
            Club 55 is a modern online gaming application designed for players who enjoy both entertainment
            and rewards. Unlike typical casual games, the Club 55 App allows users to participate in
            interactive games that can be played anytime, anywhere.
          </p>
        </div>

        {/* Key Benefits */}
        <div className="section">
          <h2 className="section-heading">Key Benefits of Playing Club 55 Online</h2>
          <p className="body-text bold">Playing through Club 55 Game offers several advantages:</p>
          <ul className="benefit-list">
            {benefits.map((b) => (
              <li key={b.title}><strong>{b.title}:</strong> {b.text}</li>
            ))}
          </ul>
        </div>

        {/* How to Get Started */}
        <div className="section">
          <h2 className="section-heading">How to Get Started on Club 55?</h2>
          <ol className="steps-list">
            {steps.map((s) => (
              <li key={s.title}><strong>{s.title}:</strong> {s.text}</li>
            ))}
          </ol>
        </div>

        {/* FAQ */}
        <div className="section">
          <h2 className="section-heading">Popular FAQs</h2>
          {faqs.map((f) => (
            <div key={f.q} className="faq-item">
              <h3 className="faq-q">{f.q}</h3>
              <p className="body-text">{f.a}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <span>Copyright &copy; 2026 Club 55 Login</span>
        <div className="footer-links">
          <a href="#" className="footer-link">About Us</a>
          <a href="#" className="footer-link">Disclaimer</a>
          <a href="#" className="footer-link">Privacy Policy</a>
          <a href="#" className="footer-link">Contact Us</a>
        </div>
      </footer>

      <button className="scroll-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>&#8679;</button>
    </div>
  )
}
