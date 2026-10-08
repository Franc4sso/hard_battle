/**
 * La card da condividere: un'immagine 1080×1350 composta sul telefono con i due
 * ritratti, il titolo, la foto del K.O. e la mossa MVP. Niente server.
 */
export interface ShareCardData {
  title: string
  arena: string
  names: [string, string]
  players: [string, string]
  winner: 0 | 1
  portraits: [string, string]
  koPhoto: string | null
  mvp: string
  rounds: number
  byJury: boolean
}

const W = 1080
const H = 1350
const INK = '#16141a'
const SUN = '#ffe14d'
const RED = '#ff4b3e'
const GOLD = '#ffb020'

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** Disegna un'immagine ritagliata a riempire il rettangolo (come object-fit: cover). */
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, radius: number) {
  const s = Math.max(w / img.width, h / img.height)
  const dw = img.width * s
  const dh = img.height * s
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, radius)
  ctx.clip()
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  ctx.restore()
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, font: (px: number) => string, max: number, min: number): number {
  for (let px = max; px > min; px -= 2) {
    ctx.font = font(px)
    if (ctx.measureText(text).width <= maxWidth) return px
  }
  ctx.font = font(min)
  return min
}

function comicStroke(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, align: CanvasTextAlign = 'left') {
  ctx.textAlign = align
  ctx.lineJoin = 'round'
  ctx.strokeStyle = INK
  ctx.lineWidth = 8
  ctx.strokeText(text, x, y)
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
}

export async function renderShareCard(d: ShareCardData): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  try {
    await Promise.all([document.fonts.load('60px Bangers'), document.fonts.load('700 30px "Rubik Variable"')])
  } catch {
    // Senza i font si va con quelli di sistema.
  }
  const comic = (px: number) => `${px}px Bangers, Impact, sans-serif`
  const sans = (px: number, weight = 700) => `${weight} ${px}px "Rubik Variable", system-ui, sans-serif`
  const [p0, p1, ko] = await Promise.all([loadImage(d.portraits[0]), loadImage(d.portraits[1]), d.koPhoto ? loadImage(d.koPhoto) : Promise.resolve(null)])

  // Fondo: nero con i puntini del gioco.
  ctx.fillStyle = INK
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  for (let y = 0; y < H; y += 24) for (let x = (y / 24) % 2 ? 12 : 0; x < W; x += 24) ctx.fillRect(x, y, 3, 3)

  // Marchio e arena.
  ctx.font = comic(44)
  ctx.textBaseline = 'alphabetic'
  comicStroke(ctx, 'RISSA ASSURDA', 48, 86, SUN)
  ctx.font = sans(26, 700)
  ctx.fillStyle = '#c9c3d6'
  ctx.textAlign = 'right'
  ctx.fillText(d.arena.toUpperCase(), W - 48, 84)

  // Titolo.
  const titlePx = fitText(ctx, d.title.toUpperCase(), W - 96, comic, 84, 40)
  ctx.font = comic(titlePx)
  comicStroke(ctx, d.title.toUpperCase(), 48, 190, '#fff')

  // I due ritratti.
  const size = 440
  const y = 230
  const xs = [48, W - 48 - size]
  for (const s of [0, 1] as const) {
    const img = s === 0 ? p0 : p1
    const win = d.winner === s
    ctx.save()
    if (!win) ctx.filter = 'grayscale(0.7) brightness(0.75)'
    if (img) cover(ctx, img, xs[s], y, size, size, 28)
    else {
      ctx.fillStyle = '#2a2438'
      ctx.beginPath()
      ctx.roundRect(xs[s], y, size, size, 28)
      ctx.fill()
    }
    ctx.restore()
    ctx.lineWidth = 10
    ctx.strokeStyle = win ? GOLD : '#fff'
    ctx.beginPath()
    ctx.roundRect(xs[s], y, size, size, 28)
    ctx.stroke()
    const name = (win ? '★ ' : '') + d.names[s].toUpperCase()
    const px = fitText(ctx, name, size, comic, 40, 24)
    ctx.font = comic(px)
    comicStroke(ctx, name, xs[s] + size / 2, y + size + 52, win ? SUN : '#c9c3d6', 'center')
    ctx.font = sans(24, 700)
    ctx.fillStyle = '#c9c3d6'
    ctx.textAlign = 'center'
    ctx.fillText(d.players[s], xs[s] + size / 2, y + size + 88)
  }
  ctx.font = comic(120)
  comicStroke(ctx, 'VS', W / 2, y + size / 2 + 44, RED, 'center')

  // La foto del K.O. (o, se manca, il verdetto in grande).
  const koY = 790
  const koH = 440
  if (ko) {
    cover(ctx, ko, 48, koY, W - 96, koH, 28)
    ctx.lineWidth = 8
    ctx.strokeStyle = '#fff'
    ctx.beginPath()
    ctx.roundRect(48, koY, W - 96, koH, 28)
    ctx.stroke()
  } else {
    ctx.fillStyle = RED
    ctx.beginPath()
    ctx.roundRect(48, koY, W - 96, koH, 28)
    ctx.fill()
  }
  const kick = d.byJury ? `GIURIA AL ROUND ${d.rounds}` : `K.O. AL ROUND ${d.rounds}`
  ctx.font = comic(72)
  comicStroke(ctx, kick, 76, koY + koH - 36, SUN)

  // Piè di pagina: chi ha battuto chi a sinistra, l'MVP a destra.
  ctx.textAlign = 'left'
  ctx.font = sans(28, 700)
  ctx.fillStyle = '#fff'
  const foot = `${d.players[d.winner]} batte ${d.players[d.winner ? 0 : 1]}`
  ctx.fillText(foot, 48, H - 56)
  if (d.mvp) {
    ctx.textAlign = 'right'
    ctx.fillStyle = '#c9c3d6'
    const room = W - 96 - ctx.measureText(foot).width - 32
    const px = fitText(ctx, `MVP: ${d.mvp}`, room, (p) => sans(p, 500), 26, 16)
    ctx.font = sans(px, 500)
    ctx.fillText(`MVP: ${d.mvp}`, W - 48, H - 56)
  }

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9))
}

/** Condivide con il foglio nativo del telefono; se non si può, scarica il file. Ritorna cosa ha fatto. */
export async function shareCard(blob: Blob, title: string): Promise<'shared' | 'downloaded' | 'failed'> {
  const file = new File([blob], 'rissa-assurda.jpg', { type: 'image/jpeg' })
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title })
      return 'shared'
    }
  } catch (e) {
    // Annullato dall'utente o non supportato: si scarica.
    if ((e as Error)?.name === 'AbortError') return 'failed'
  }
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'rissa-assurda.jpg'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return 'downloaded'
  } catch {
    return 'failed'
  }
}
