import { locale } from './i18n'

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const dayDiff = (d) => Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000)

export function parseJson(text) {
  try { return text ? JSON.parse(text) : {} } catch { return {} }
}

export const toDate = (v) => (v instanceof Date ? v : new Date(v))

export function fmtTime(v, lang) {
  return toDate(v).toLocaleTimeString(locale(lang), { hour: '2-digit', minute: '2-digit' })
}

export function fmtDate(v, lang, opts = { day: 'numeric', month: 'short' }) {
  return toDate(v).toLocaleDateString(locale(lang), opts)
}

export function fmtWeekday(v, lang, style = 'short') {
  return toDate(v).toLocaleDateString(locale(lang), { weekday: style })
}

// «Сьогодні», «Завтра», «пт 7 лист.»
export function fmtDay(v, lang, t) {
  const d = toDate(v)
  const diff = dayDiff(d)
  if (diff === 0) return t('today')
  if (diff === 1) return t('tomorrow')
  if (diff === -1) return t('yesterday')
  return `${fmtWeekday(d, lang)} ${fmtDate(d, lang)}`
}

export function fmtDayTime(v, lang, t) {
  return `${fmtDay(v, lang, t)}, ${fmtTime(v, lang)}`
}

// «5 хв тому», «через 2 год»
export function fmtRelative(v, lang, t) {
  const diffSec = (toDate(v) - Date.now()) / 1000
  const abs = Math.abs(diffSec)
  if (abs < 45) return t('now')
  const rtf = new Intl.RelativeTimeFormat(locale(lang), { numeric: 'auto', style: 'short' })
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour')
  if (abs < 86400 * 7) return rtf.format(Math.round(diffSec / 86400), 'day')
  return fmtDate(v, lang)
}

// Назва дня тижня (1 = понеділок … 7 = неділя); 1 січня 2024 — понеділок
export const weekdayName = (dow, lang) => fmtWeekday(new Date(2024, 0, dow), lang, 'short')

export function fmtCountdown(ms) {
  if (ms <= 0) return '0:00'
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Значення для <input type="datetime-local"> у місцевому часі
export function toLocalInput(v) {
  const d = toDate(v)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function isoDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Дата з "yyyy-MM-dd" як місцевий день (а не UTC)
export function parseLocalDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function nowHm() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
