// Посилання в QR: schoolbuddy.cz/u/{token} — сканер витягує з нього токен
export const profileQrValue = (token) => `${window.location.origin}/u/${token}`

export const extractToken = (raw) => {
  const text = (raw || '').trim()
  const m = text.match(/\/u\/([^/?#\s]+)/)
  return m ? m[1] : text
}
