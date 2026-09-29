import { useState } from 'react'
import { api } from '../../api'

export const pct = (n) => `${(Math.round(n * 100) / 100).toLocaleString('en-IN')}%`

// Form values are kept as strings while typing; convert for previews / saving
export const toForm = (obj) => JSON.parse(JSON.stringify(obj, (k, v) => (typeof v === 'number' ? String(v) : v)))
export const toNum = (v) => (v === '' || v == null ? NaN : Number(v))

/** Deep-convert a form (strings) back to numbers for the API. */
export const fromForm = (obj) => JSON.parse(JSON.stringify(obj), (k, v) => (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v))

/**
 * Editable copy of one game's saved settings with dirty tracking and save.
 * `successText` is shown after a successful save.
 */
export function useSettingsForm(game, saved, defaults, onSaved, successText) {
  const [form, setFormState] = useState(() => toForm(saved))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(saved))

  const setForm = (updater) => {
    setFormState(updater)
    setMsg(null)
  }
  const set = (key) => (v) => setForm((f) => ({ ...f, [key]: v }))

  const save = async () => {
    setBusy(true)
    try {
      const res = await api.post(`/settings/${game}`, fromForm(form))
      onSaved(game, res)
      setMsg({ kind: 'success', text: successText })
    } catch (err) {
      setMsg({ kind: 'error', text: err.message })
    }
    setBusy(false)
  }

  return {
    form,
    setForm,
    set,
    dirty,
    busy,
    msg,
    save,
    reset: () => { setFormState(toForm(saved)); setMsg(null) },
    loadDefaults: () => { setFormState(toForm(defaults)); setMsg(null) },
  }
}
