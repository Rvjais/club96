import { money } from '../../api'
import { Icon } from '../../Icons'
import { CardHead, FormSaveBar, NumberField } from './controls'
import { pct, toNum, useSettingsForm } from './settingsForm'

const MAX_LEVELS = 10 // server/src/settings.js → REFERRAL_MAX_LEVELS
const MODES = [
  { key: 'first', label: 'First deposit only', hint: "Commission on each invitee's first deposit" },
  { key: 'all', label: 'Every deposit', hint: 'Commission on every deposit the team makes' },
]

/** Agency programme: commission per level, deposit mode, claim minimum and partner reward tiers. */
export default function ReferralSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('referral', saved, defaults, onSaved, 'Saved. New rates apply to bets and deposits from now on.')

  const levels = f.form.levels
  const tiers = f.form.tiers
  const nums = levels.map((l) => ({ bet: toNum(l.bet), deposit: toNum(l.deposit) }))
  const betTotal = Math.round(nums.reduce((t, l) => t + (l.bet || 0), 0) * 1000) / 1000
  const depTotal = Math.round(nums.reduce((t, l) => t + (l.deposit || 0), 0) * 1000) / 1000
  const levelsOk = nums.every((l) => l.bet >= 0 && l.bet <= 10 && l.deposit >= 0 && l.deposit <= 100) && betTotal <= 10 && depTotal <= 100
  const tiersOk = tiers.every((t) => toNum(t.invites) >= 1 && toNum(t.deposit) >= 0 && toNum(t.reward) > 0)
  const mode = MODES.find((m) => m.key === f.form.depositMode) ?? MODES[0]

  const updateList = (key, fn) => f.setForm((form) => ({ ...form, [key]: fn(form[key]) }))
  const setLevel = (i, key, v) => updateList('levels', (list) => list.map((l, j) => (j === i ? { ...l, [key]: v } : l)))
  const setTier = (i, key, v) => updateList('tiers', (list) => list.map((t, j) => (j === i ? { ...t, [key]: v } : t)))

  return (
    <section className="card game-card">
      <CardHead icon="users" title="Referral / agency programme" f={f} />
      <p className="muted">
        Every player gets an invitation code on the Promotion tab. Players who sign up with it join the inviter&apos;s team
        (level 1), their invitees become level 2, and so on. The upline earns the commission below on the team&apos;s bets and
        deposits, collects it in an agency wallet and claims it into their balance. Pausing stops new commission; tracking
        continues.
      </p>

      <div className="sub-head">
        <strong>Commission per level</strong>
        <span className="muted">% of each bet / deposit made by a member at that depth</span>
      </div>
      <div className="table-wrap">
        <table className="table odds-table">
          <thead><tr><th>Level</th><th>Bet commission</th><th>Deposit commission</th><th className="num">On a ₹1,000 bet</th><th /></tr></thead>
          <tbody>
            {levels.map((l, i) => (
              <tr key={i}>
                <td><strong>Level {i + 1}</strong> {i === 0 && <span className="muted small">(direct)</span>}</td>
                <td>
                  <div className="input input-sm">
                    <input type="number" step="any" min="0" value={l.bet} onChange={(e) => setLevel(i, 'bet', e.target.value)} aria-label={`Level ${i + 1} bet commission`} />
                    <span className="input-suffix">%</span>
                  </div>
                </td>
                <td>
                  <div className="input input-sm">
                    <input type="number" step="any" min="0" value={l.deposit} onChange={(e) => setLevel(i, 'deposit', e.target.value)} aria-label={`Level ${i + 1} deposit commission`} />
                    <span className="input-suffix">%</span>
                  </div>
                </td>
                <td className="num strong">{Number.isFinite(nums[i].bet) ? money((1000 * nums[i].bet) / 100) : '—'}</td>
                <td className="num">
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" disabled={levels.length <= 1 || i !== levels.length - 1} onClick={() => updateList('levels', (list) => list.slice(0, -1))} aria-label="Remove level">
                    <Icon name="x" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="wheel-foot">
          <button type="button" className="btn btn-ghost btn-sm" disabled={levels.length >= MAX_LEVELS} onClick={() => updateList('levels', (list) => [...list, { bet: '0', deposit: '0' }])}>
            <Icon name="plus" size={14} /> Add level
          </button>
          <span className={`total-line ${levelsOk ? 'is-ok' : 'is-bad'}`}>
            <Icon name={levelsOk ? 'checkCircle' : 'alert'} size={15} />
            All levels together: {pct(betTotal)} of bets{betTotal > 10 ? ' (max 10%)' : ''} · {pct(depTotal)} of deposits{depTotal > 100 ? ' (max 100%)' : ''}
          </span>
        </div>
      </div>

      <div className="settings-grid settings-grid-3">
        <div>
          <div className="sub-head">
            <strong>Deposit commission on</strong>
            <span className="muted">{mode.hint}</span>
          </div>
          <div className="chip-row">
            {MODES.map((m) => (
              <button type="button" key={m.key} className={`chip ${f.form.depositMode === m.key ? 'is-active' : ''}`} onClick={() => f.set('depositMode')(m.key)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <NumberField label="Minimum to claim" prefix="₹" value={f.form.minClaim} onChange={f.set('minClaim')} hint="Commission needed before it can be moved to the wallet" />
      </div>

      <div className="sub-head">
        <strong>Partner rewards</strong>
        <span className="muted">One-off bonus once enough direct invitees have each deposited the amount. Paid once per player per tier.</span>
      </div>
      <div className="table-wrap">
        <table className="table odds-table">
          <thead><tr><th>Tier</th><th>Direct invitees</th><th>Each deposited at least</th><th>Reward</th><th /></tr></thead>
          <tbody>
            {tiers.length === 0 && <tr><td colSpan={5} className="muted">No partner rewards. Players won&apos;t see any milestones.</td></tr>}
            {tiers.map((t, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  <div className="input input-sm">
                    <input type="number" step="1" min="1" value={t.invites} onChange={(e) => setTier(i, 'invites', e.target.value)} aria-label={`Tier ${i + 1} invitees`} />
                  </div>
                </td>
                <td>
                  <div className="input input-sm">
                    <span className="input-prefix">₹</span>
                    <input type="number" step="any" min="0" value={t.deposit} onChange={(e) => setTier(i, 'deposit', e.target.value)} aria-label={`Tier ${i + 1} deposit`} />
                  </div>
                </td>
                <td>
                  <div className="input input-sm">
                    <span className="input-prefix">₹</span>
                    <input type="number" step="any" min="0" value={t.reward} onChange={(e) => setTier(i, 'reward', e.target.value)} aria-label={`Tier ${i + 1} reward`} />
                  </div>
                </td>
                <td className="num">
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => updateList('tiers', (list) => list.filter((_, j) => j !== i))} aria-label="Remove tier">
                    <Icon name="x" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="wheel-foot">
          <button type="button" className="btn btn-ghost btn-sm" disabled={tiers.length >= 20} onClick={() => updateList('tiers', (list) => [...list, { invites: '1', deposit: '300', reward: '50' }])}>
            <Icon name="plus" size={14} /> Add tier
          </button>
          <span className="muted small">Changing a tier&apos;s invitees or deposit makes it a new tier, and players who claimed the old one can claim it again.</span>
        </div>
      </div>

      <FormSaveBar f={f} invalid={!levelsOk || !tiersOk} />
    </section>
  )
}
