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
  const [busy, setBusy] = useState(false), [result, setResult] = useState(null), [error, setError] = useState(''), [road, setRoad] = useState([])
  const play = async () => {
    if (busy) return
    setBusy(true); setError(''); setResult(null)
    try { const d = await api.post(`/games/cards/${dragon ? 'dragon-tiger' : 'andar-bahar'}/play`, { bet: { [choice]: Number(amount) } }); setBalance(d.balance); setResult(d); setRoad((old) => [...old.slice(-13), d.result.winning]) }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const cards = result ? (dragon ? [result.result.dragon, result.result.tiger] : [result.result.joker, result.result.matchCard]) : []
  return <main className={`cards-game ${dragon ? 'dragon-table' : 'andar-table'}`}><header className="cards-topbar"><button className="table-back" onClick={() => navigate('/game')}>‹</button><div className="table-wallet">◉ {Number(balance).toLocaleString('en-IN')}</div><div className="table-wallet table-vault">◉ 500</div><button className="table-settings">⚙</button></header>
    <div className="table-stage">
      <div className="dealer"><span className="dealer-avatar">👩🏻</span><strong>{dragon ? 'ROYAL DUEL' : 'ANDAR BAHAR'}</strong><small>GOOD LUCK</small></div>
      {dragon ? <>
        <div className="versus-row"><div className="dragon-panel"><i>🐉</i><span>DRAGON</span><Card card={cards[0]} name=""/></div><div className="tiger-panel"><i>🐅</i><span>TIGER</span><Card card={cards[1]} name=""/></div></div>
        <div className="result-road">{road.length ? road.map((r,i)=><span key={i} className={`road-${r}`}>{r==='dragon'?'D':r==='tiger'?'T':'Tie'}</span> : Array.from({length:10},(_,i)=><span key={i} className="road-empty">{i%2?'T':'D'}</span>)}</div>
        <div className="dt-bet-grid">{['dragon','tie','tiger'].map(k=><button key={k} className={`dt-bet bet-${k} ${choice===k?'chosen':''}`} onClick={()=>setChoice(k)}><b>{labels[k]}</b><small>{k==='tie'?'9:1':'1:1'}</small>{choice===k&&<em>₹{amount}</em>}</button>)}</div>
        <button className="side-bet" onClick={()=>setChoice('suitedTie')}>Suited tie <small>50:1</small>{choice==='suitedTie'&&<em> ₹{amount}</em>}</button>
      </> : <>
        <div className="joker-zone"><span className="zone-label">JOKER CARD</span>{cards.length ? <Card card={cards[0]} name=""/> : <div className="face-down">✦<br/>JOKER</div>}</div>
        <div className="ab-zones"><button className={`ab-zone andar-zone ${choice==='andar'?'chosen':''}`} onClick={()=>setChoice('andar')}><strong>ANDAR</strong>{result?.result.winning==='andar'&&<span className="winner-tag">WINNER</span>}<div className="zone-card">{result?.result.winning==='andar'?<Card card={cards[1]} name=""/>:<span>♠ ♥ ♦ ♣</span>}</div><small>Tap to bet</small>{choice==='andar'&&<em>₹{amount}</em>}</button><button className={`ab-zone bahar-zone ${choice==='bahar'?'chosen':''}`} onClick={()=>setChoice('bahar')}><strong>BAHAR</strong>{result?.result.winning==='bahar'&&<span className="winner-tag">WINNER</span>}<div className="zone-card">{result?.result.winning==='bahar'?<Card card={cards[1]} name=""/>:<span>♠ ♥ ♦ ♣</span>}</div><small>Tap to bet</small>{choice==='bahar'&&<em>₹{amount}</em>}</button></div>
        <div className="ab-road">{road.length?road.map((r,i)=><span className={r} key={i}>{r==='andar'?'A':'B'}</span>:<small>PREVIOUS RESULTS</small>}</div>
      </>}
    </div>
    <footer className="table-controls"><div className="chip-row">{[10,50,100,250,500].map(n=><button key={n} onClick={()=>setAmount(n)} className={Number(amount)===n?'chip-active':''}>₹{n}</button>)}</div><div className="deal-row"><label>Bet ₹<input type="number" min="1" value={amount} onChange={e=>setAmount(e.target.value)}/></label><button className="cards-deal" disabled={busy} onClick={play}>{busy?'Dealing…':'DEAL'}</button></div>{result&&<p className="cards-message">{result.win>0?`YOU WON ₹${result.win.toLocaleString('en-IN')}`:`${labels[result.result.winning].toUpperCase()} WINS`}{result.result.suited?' · SUITED TIE':''}</p>}{error&&<p className="cards-error">{error}</p>}</footer>
  </main>
}
function Card({card,name}) { return <div className={`playing-card ${card?'':'playing-card-back'}`}><small>{name}</small><b className={card&&(card.suit==='♥'||card.suit==='♦')?'red':''}>{card? <>{card.rank}<br/>{card.suit}</>:'✦'}</b></div> }
