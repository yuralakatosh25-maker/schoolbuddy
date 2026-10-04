// Зменшує фото до квадрата 256×256 (JPEG), щоб аватар не важив мегабайти
export function resizeImage(file, size = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      const s = Math.min(img.width, img.height)
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size)
      URL.revokeObjectURL(img.src)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

// Системне «Поділитися» з запасним варіантом — копіювання
export async function shareText({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url })
      return 'shared'
    } catch (e) {
      if (e?.name === 'AbortError') return 'aborted'
    }
  }
  return (await copyText([text, url].filter(Boolean).join(' '))) ? 'copied' : 'failed'
}

export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// Картинка 1080×1920 для Instagram Stories: streak, звання й досягнення
export async function makeStoryImage({ name, streak, streakLabel, title, rankLabel, achievements, footer }) {
  await document.fonts?.ready
  const W = 1080, H = 1920
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const font = (w, s) => `${w} ${s}px "Geist Variable", system-ui, sans-serif`

  ctx.fillStyle = '#0b0c0e'
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.8, H * 0.18, 0, W * 0.8, H * 0.18, 700)
  glow.addColorStop(0, 'rgba(196,242,90,0.22)')
  glow.addColorStop(1, 'rgba(196,242,90,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // логотип
  ctx.lineWidth = 14
  ctx.strokeStyle = '#c4f25a'
  ctx.beginPath(); ctx.arc(140, 180, 40, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = '#eceef1'
  ctx.beginPath(); ctx.arc(190, 180, 40, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = '#eceef1'
  ctx.font = font(600, 52)
  ctx.fillText('SchoolBuddy', 260, 198)

  ctx.fillStyle = '#8c929b'
  ctx.font = font(500, 46)
  ctx.fillText(name, 100, 520)

  ctx.fillStyle = '#c4f25a'
  ctx.font = font(700, 360)
  ctx.fillText(String(streak), 90, 900)
  ctx.fillStyle = '#eceef1'
  ctx.font = font(600, 64)
  ctx.fillText(streakLabel, 100, 1000)

  ctx.fillStyle = '#8c929b'
  ctx.font = font(500, 40)
  ctx.fillText(rankLabel, 100, 1150)
  ctx.fillStyle = '#eceef1'
  ctx.font = font(600, 72)
  ctx.fillText(title, 100, 1240)

  let y = 1380
  ctx.font = font(500, 40)
  for (const a of achievements.slice(0, 5)) {
    ctx.fillStyle = '#1e2126'
    roundRect(ctx, 100, y - 52, W - 200, 76, 22)
    ctx.fill()
    ctx.fillStyle = '#c4f25a'
    ctx.beginPath(); ctx.arc(140, y - 14, 8, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#eceef1'
    ctx.fillText(a, 170, y)
    y += 96
  }

  ctx.fillStyle = '#5d636c'
  ctx.font = font(500, 34)
  ctx.fillText(footer, 100, H - 110)

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export async function shareImage(blob, filename, text) {
  const file = new File([blob], filename, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text })
      return 'shared'
    } catch (e) {
      if (e?.name === 'AbortError') return 'aborted'
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  return 'downloaded'
}
