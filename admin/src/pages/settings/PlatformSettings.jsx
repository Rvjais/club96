import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { money } from '../../api'
import { Icon } from '../../Icons'
import { FormSaveBar, NumberField } from './controls'
import { toNum, useSettingsForm } from './settingsForm'

function Switch({ on, onChange, labels = ['On', 'Off'] }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`live-toggle ${on ? 'is-on' : ''}`} onClick={() => onChange(!on)}>
      <span className="live-toggle-knob" />
      {on ? labels[0] : labels[1]}
    </button>
  )
}

const UPI_RE = /^[\w.-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/

/** The QR players will scan, for checking the UPI ID before saving. */
function QrPreview({ upiId, payeeName }) {
  const [qr, setQr] = useState({ key: '', url: '' })
  const valid = UPI_RE.test(upiId)
  const key = `${upiId}|${payeeName}`

  useEffect(() => {
    if (!valid) return
    let cancelled = false
    const link = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName || '')}&cu=INR`
    QRCode.toDataURL(link, { width: 360, margin: 1 }).then((url) => !cancelled && setQr({ key, url }), () => {})
    return () => { cancelled = true }
  }, [valid, upiId, payeeName, key])

  return (
    <div className="popup-preview">
      <span className="preview-caption">QR players scan (amount is added per deposit)</span>
      {valid && qr.key === key ? (
        <div className="qr-preview">
          <img src={qr.url} alt={`UPI QR for ${upiId}`} />
          <strong>{payeeName}</strong>
          <span className="mono">{upiId}</span>
        </div>
      ) : (
        <div className="popup-off">
          <Icon name="alert" size={22} />
          {upiId ? 'That doesn’t look like a UPI ID (e.g. yourname@okaxis)' : 'Add your UPI ID to turn on deposits'}
        </div>
      )}
    </div>
  )
}

/** Site-wide rules: sign-up bonus + welcome pop-up, minimum balance to play, deposits, withdrawals. */
export default function PlatformSettings({ saved, defaults, onSaved }) {
  const f = useSettingsForm('platform', saved, defaults, onSaved, 'Saved. Applies to new sign-ups and the next bet.')
  const bonus = toNum(f.form.signupBonus)
  const minPlay = toNum(f.form.minPlayBalance)
  const popup = f.form.bonusPopup === true

  return (
    <section className="card game-card">
        <div className="game-card-head">
          <h2 className="card-title"><Icon name="gift" size={16} /> Sign-up bonus</h2>
        </div>
        <div className="platform-grid">
          <div className="platform-fields">
            <NumberField label="Bonus for new accounts" prefix="₹" value={f.form.signupBonus} onChange={f.set('signupBonus')} hint="Credited to the wallet on sign-up. 0 = no bonus." />
            <label className="field">
              <span>Welcome pop-up</span>
              <div><Switch on={popup} onChange={f.set('bonusPopup')} labels={['Shown', 'Hidden']} /></div>
              <small className="field-hint">Shown once, right after the player signs up</small>
            </label>
            <label className="field">
              <span>Pop-up title</span>
              <div className="input">
                <input maxLength={60} value={f.form.bonusTitle} onChange={(e) => f.set('bonusTitle')(e.target.value)} />
              </div>
            </label>
            <label className="field">
              <span>Pop-up message</span>
              <textarea className="textarea" rows={3} maxLength={300} value={f.form.bonusMessage} onChange={(e) => f.set('bonusMessage')(e.target.value)} />
              <small className="field-hint">{String(f.form.bonusMessage ?? '').length}/300</small>
            </label>
          </div>

          <div className="popup-preview" aria-label="Pop-up preview">
            <span className="preview-caption">What new players see</span>
            {bonus > 0 && popup ? (
              <div className="popup-card">
                <div className="popup-top"><span><Icon name="gift" size={26} /></span></div>
                <em>Sign-up bonus</em>
                <strong>{f.form.bonusTitle || defaults.bonusTitle}</strong>
                <b>{money(bonus)}</b>
                <p>{f.form.bonusMessage}</p>
                <i>Claim &amp; start playing</i>
              </div>
            ) : (
              <div className="popup-off">
                <Icon name="eyeOff" size={22} />
                {bonus > 0 ? `No pop-up — the ${money(bonus)} bonus is still credited` : 'No bonus and no pop-up for new players'}
              </div>
            )}
          </div>
        </div>

        <div className="game-card-head platform-divider">
          <h2 className="card-title"><Icon name="wallet" size={16} /> Minimum balance to play</h2>
        </div>
        <div className="settings-grid settings-grid-3">
          <NumberField label="Minimum wallet balance" prefix="₹" value={f.form.minPlayBalance} onChange={f.set('minPlayBalance')} hint="0 = no minimum" />
          <div className="note note-inline">
            <Icon name="info" size={16} />
            <span>
              {minPlay > 0
                ? <>Players need at least <strong>{money(minPlay)}</strong> in their wallet to place a bet in any game. Below that, they are asked to deposit.</>
                : 'Players can bet as long as they can cover the stake.'}
              {bonus > 0 && minPlay > bonus && <> A new player&apos;s {money(bonus)} bonus alone is not enough to play.</>}
            </span>
          </div>
        </div>

        <div className="game-card-head platform-divider">
          <h2 className="card-title"><Icon name="wallet" size={16} /> UPI deposits</h2>
          <Switch on={f.form.depositEnabled === true} onChange={f.set('depositEnabled')} labels={['Open', 'Paused']} />
        </div>
        <div className="platform-grid">
          <div className="platform-fields">
            <label className="field">
              <span>UPI ID players pay</span>
              <div className="input">
                <input placeholder="yourname@okaxis" value={f.form.upiId} onChange={(e) => f.set('upiId')(e.target.value.trim())} autoCapitalize="off" spellCheck={false} />
              </div>
              <small className="field-hint">Every deposit QR pays this UPI ID</small>
            </label>
            <label className="field">
              <span>Payee name</span>
              <div className="input"><input maxLength={50} value={f.form.payeeName} onChange={(e) => f.set('payeeName')(e.target.value)} /></div>
              <small className="field-hint">Shown in the player’s UPI app</small>
            </label>
            <NumberField label="Minimum deposit" prefix="₹" value={f.form.minDeposit} onChange={f.set('minDeposit')} />
            <NumberField label="Maximum deposit" prefix="₹" value={f.form.maxDeposit} onChange={f.set('maxDeposit')} />
            <NumberField label="Deposits in review at once" value={f.form.maxPendingDeposits} onChange={f.set('maxPendingDeposits')} step="1" hint="Per player" />
            <label className="field">
              <span>Instructions shown under the QR</span>
              <textarea className="textarea" rows={3} maxLength={300} value={f.form.depositNote} onChange={(e) => f.set('depositNote')(e.target.value)} />
            </label>
          </div>
          <QrPreview upiId={String(f.form.upiId ?? '')} payeeName={String(f.form.payeeName ?? '')} />
        </div>
        <div className="note">
          <Icon name="info" size={16} />
          <span>
            {f.form.depositEnabled && f.form.upiId
              ? <>Players pick an amount, scan the QR and pay, then enter the 12-digit UTR. Check the payment arrived and approve it under <strong>Deposits</strong>; the amount you enter there is what gets credited.</>
              : 'Deposits are unavailable to players until they are open and a UPI ID is saved.'}
          </span>
        </div>

        <div className="game-card-head platform-divider">
          <h2 className="card-title"><Icon name="banknote" size={16} /> Withdrawals</h2>
          <Switch on={f.form.withdrawEnabled === true} onChange={f.set('withdrawEnabled')} labels={['Open', 'Paused']} />
        </div>
        <div className="settings-grid">
          <NumberField label="Balance needed to withdraw" prefix="₹" value={f.form.minWithdrawBalance} onChange={f.set('minWithdrawBalance')} hint="Wallet must hold at least this to request" />
          <NumberField label="Minimum withdrawal" prefix="₹" value={f.form.minWithdraw} onChange={f.set('minWithdraw')} />
          <NumberField label="Maximum withdrawal" prefix="₹" value={f.form.maxWithdraw} onChange={f.set('maxWithdraw')} hint="Per request" />
          <NumberField label="Requests in review at once" value={f.form.maxPendingWithdrawals} onChange={f.set('maxPendingWithdrawals')} step="1" />
          <label className="field">
            <span>Bank details</span>
            <div><Switch on={f.form.bankLocked === true} onChange={f.set('bankLocked')} labels={['Locked', 'Editable']} /></div>
            <small className="field-hint">{f.form.bankLocked ? 'Players can’t change them once saved; remove them from the user’s profile' : 'Players can change them when nothing is pending'}</small>
          </label>
        </div>
        <div className="note">
          <Icon name="info" size={16} />
          <span>
            {f.form.withdrawEnabled
              ? <>Players add their bank account number and IFSC on their Account page. They can request a withdrawal once their wallet holds <strong>{money(toNum(f.form.minWithdrawBalance) || 0)}</strong>, for {money(toNum(f.form.minWithdraw) || 0)} – {money(toNum(f.form.maxWithdraw) || 0)} at a time. The money is held and appears under Withdrawals for you to pay or reject.</>
              : 'Withdrawals are paused: players can’t submit new requests. Requests already waiting still appear under Withdrawals.'}
          </span>
        </div>
        <FormSaveBar f={f} />
    </section>
  )
}
