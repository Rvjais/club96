import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/authContext'
import './table.css'

const labels = { andar: 'Andar', bahar: 'Bahar', dragon: 'Dragon', tiger: 'Tiger', tie: 'Tie', suitedTie: 'Suited tie' }
export default function CardTable({ game }) {
  const navigate = useNavigate(), { balance, setBalance } = useAuth()
  const dragon = game === 'dragon-tiger'
  const [amount, setAmount] = useState(10), [choice, setChoice] = useState(dragon ? 'dragon' : 'andar')
  const [busy, setBusy] = useState(false), [result, setResult] = useState(null), [error, setError] = useState('')
  const play = async () => {
    if (busy) return
    setBusy(true); setError(''); setResult(null)
    try { const d = await api.post(`/games/cards/${dragon ? 'dragon-tiger' : 'andar-bahar'}/play`, { bet: { [choice]: Number(amount) } }); setBalance(d.balance); setResult(d) }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const cards = result ? (dragon ? [result.result.dragon, result.result.tiger] : [result.result.joker]) : []
  return <main className="cards-game"><header><button onClick={() => navigate('/game')}>‹ Lobby</button><strong>{dragon ? 'Dragon Tiger' : 'Andar Bahar'}</strong><span>₹{Number(balance).toLocaleString('en-IN')}</span></header>
    <section className="cards-felt"><p className="cards-kicker">ROYAL TABLE</p><h1>{dragon ? 'Dragon vs Tiger' : 'Andar Bahar'}</h1><p>{dragon ? 'The higher card wins. Equal ranks make a tie.' : 'A shared rank is dealt first. Pick which side finds its match.'}</p>
      {cards.length > 0 ? <div className="cards-result">{dragon ? <><Card card={cards[0]} name="Dragon"/><Card card={cards[1]} name="Tiger"/></> : <><Card card={cards[0]} name="Joker"/><b className="cards-outcome">{labels[result.result.winning]} wins</b></>}</div> : <div className="cards-placeholder">♠　♥　♦　♣</div>}
      {result && <div className="cards-message">{result.win > 0 ? `You won ₹${result.win.toLocaleString('en-IN')}` : `${labels[result.result.winning]} wins this round`}{result.result.suited ? ' · Suited tie' : ''}</div>}
    </section><section className="cards-controls"><div className="cards-choices">{(dragon ? ['dragon','tiger','tie','suitedTie'] : ['andar','bahar']).map(k=><button key={k} className={choice===k?'selected':''} onClick={()=>setChoice(k)}>{labels[k]}</button>)}</div><label>Bet amount<input type="number" min="1" value={amount} onChange={e=>setAmount(e.target.value)}/></label><button className="cards-deal" disabled={busy} onClick={play}>{busy?'Dealing…':'Deal cards'}</button>{error&&<p className="cards-error">{error}</p>}</section>
  </main>
}
function Card({card,name}) { return <div className="playing-card"><small>{name}</small><b className={card.suit==='♥'||card.suit==='♦'?'red':''}>{card.rank}<br/>{card.suit}</b></div> }
