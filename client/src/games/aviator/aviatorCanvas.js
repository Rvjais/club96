// Canvas renderer for the Aviator stage. Pure drawing — reads a frame, paints it.

const PAD_L = 44
const PAD_B = 38
const PAD_R = 76
const PAD_T = 70
const CURVE_SECONDS = 12

const RED = '#ff2d55'
const RED_DARK = '#c81e43'
const YELLOW = '#f59e0b'

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

function curveHead(w, h, sec) {
  const sx = PAD_L
  const sy = h - PAD_B
  const p = Math.min(1, sec / CURVE_SECONDS)
  const tx = sx + (w - PAD_L - PAD_R) * p
  const ty = sy - (h - PAD_B - PAD_T) * Math.pow(p, 0.8)
  const cpx = sx + (tx - sx) * 0.5
  return { sx, sy, tx, ty, cpx, p }
}

function drawBackdrop(ctx, w, h, frame) {
  const { phase, flightSec, now } = frame
  const ox = PAD_L
  const oy = h - PAD_B

  // Base + vignette
  ctx.fillStyle = '#19212e'
  ctx.fillRect(0, 0, w, h)
  const vg = ctx.createRadialGradient(ox, oy, 0, ox, oy, Math.hypot(w, h))
  vg.addColorStop(0, 'rgba(255,45,85,0.07)')
  vg.addColorStop(0.45, 'rgba(25,33,46,0)')
  vg.addColorStop(1, 'rgba(15,20,28,0.85)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, w, h)

  // Rotating sunburst from the origin
  const rays = 22
  const spin = phase === 'flying' ? now * 0.00006 : now * 0.00001
  const R = Math.hypot(w, h) * 1.1
  ctx.save()
  ctx.translate(ox, oy)
  ctx.fillStyle = 'rgba(255,255,255,0.022)'
  for (let i = 0; i < rays; i += 2) {
    const a0 = spin + (i / rays) * Math.PI * 2
    const a1 = spin + ((i + 1) / rays) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, R, a0, a1)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()

  // Axes
  ctx.strokeStyle = 'rgba(148,163,184,0.14)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(ox, PAD_T * 0.4)
  ctx.lineTo(ox, oy)
  ctx.lineTo(w - 10, oy)
  ctx.stroke()

  // Scrolling axis dots
  const shift = phase === 'flying' ? flightSec * 46 : 0
  const gap = 58
  ctx.fillStyle = 'rgba(148,163,184,0.35)'
  for (let x = ox + gap - (shift % gap); x < w - 10; x += gap) {
    ctx.beginPath()
    ctx.arc(x, oy + 14, 1.8, 0, Math.PI * 2)
    ctx.fill()
  }
  for (let y = oy - gap + (shift % gap); y > PAD_T * 0.4; y -= gap) {
    ctx.beginPath()
    ctx.arc(ox - 16, y, 1.8, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawCurve(ctx, head, alpha) {
  const { sx, sy, tx, ty, cpx } = head
  ctx.save()
  ctx.globalAlpha = alpha

  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.quadraticCurveTo(cpx, sy, tx, ty)
  ctx.lineTo(tx, sy)
  ctx.closePath()
  const fill = ctx.createLinearGradient(0, ty, 0, sy)
  fill.addColorStop(0, 'rgba(255,45,85,0.38)')
  fill.addColorStop(1, 'rgba(255,45,85,0.02)')
  ctx.fillStyle = fill
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.quadraticCurveTo(cpx, sy, tx, ty)
  ctx.strokeStyle = RED
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.shadowColor = RED
  ctx.shadowBlur = 16
  ctx.stroke()
  ctx.restore()
}

export function drawPlane(ctx, x, y, angle, scale, now, alpha = 1) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.scale(scale, scale)
  ctx.shadowColor = 'rgba(255,45,85,0.75)'
  ctx.shadowBlur = 22

  // Far wing
  ctx.fillStyle = RED_DARK
  ctx.beginPath()
  ctx.moveTo(6, -5)
  ctx.lineTo(-4, -5)
  ctx.lineTo(-12, -17)
  ctx.lineTo(-5, -17)
  ctx.closePath()
  ctx.fill()

  // Fuselage + tail
  const body = ctx.createLinearGradient(0, -10, 0, 8)
  body.addColorStop(0, '#ff5c7c')
  body.addColorStop(1, RED_DARK)
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.moveTo(26, 0)
  ctx.bezierCurveTo(26, -7, 19, -9, 9, -9)
  ctx.lineTo(-19, -6)
  ctx.lineTo(-29, -19)
  ctx.lineTo(-35, -19)
  ctx.lineTo(-31, -3)
  ctx.lineTo(-33, 3)
  ctx.lineTo(-20, 5)
  ctx.lineTo(9, 7)
  ctx.bezierCurveTo(19, 7, 26, 5, 26, 0)
  ctx.closePath()
  ctx.fill()
  ctx.shadowBlur = 0

  // Near wing
  ctx.fillStyle = '#ff7a93'
  ctx.beginPath()
  ctx.moveTo(8, 1)
  ctx.lineTo(-8, 1)
  ctx.lineTo(-17, 17)
  ctx.lineTo(-8, 17)
  ctx.closePath()
  ctx.fill()

  // Stabiliser
  ctx.fillStyle = RED_DARK
  ctx.beginPath()
  ctx.moveTo(-24, 0)
  ctx.lineTo(-32, 0)
  ctx.lineTo(-36, 7)
  ctx.lineTo(-30, 7)
  ctx.closePath()
  ctx.fill()

  // Cockpit glass
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.beginPath()
  ctx.moveTo(18, -6)
  ctx.quadraticCurveTo(12, -12, 6, -8.5)
  ctx.lineTo(8, -5)
  ctx.closePath()
  ctx.fill()

  // Propeller (motion blur)
  const blade = 12 + Math.abs(Math.sin(now / 18)) * 3
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.beginPath()
  ctx.ellipse(28, 0, 2.4, blade, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = YELLOW
  ctx.beginPath()
  ctx.arc(27.5, 0, 2.6, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

export function drawScene(ctx, w, h, frame) {
  const { phase, flightSec, sincePhase, now } = frame
  const scale = clamp(w / 720, 0.72, 1.15)

  drawBackdrop(ctx, w, h, frame)

  if (phase === 'waiting') {
    // Parked plane idling on the runway
    const bob = Math.sin(now / 420) * 1.5
    drawPlane(ctx, PAD_L + 38 * scale, h - PAD_B - 18 * scale + bob, -0.04, scale, now, 0.9)
    return
  }

  const head = curveHead(w, h, flightSec) // frozen at crash time once crashed
  let { tx, ty } = head
  const angle = clamp(Math.atan2(ty - head.sy, tx - head.cpx), -0.62, -0.08)

  if (phase === 'flying') {
    if (head.p >= 1) {
      tx += Math.cos(now / 520) * 5
      ty += Math.sin(now / 380) * 7
    }
    drawCurve(ctx, { ...head, tx, ty }, 1)
    drawPlane(ctx, tx, ty, angle, scale, now)
    return
  }

  // Crashed: curve fades, plane accelerates off-screen
  const t = sincePhase / 1000
  drawCurve(ctx, head, Math.max(0, 1 - t / 0.7))
  const fly = t * t * 900
  const px = tx + fly
  const py = ty - fly * 0.45
  if (px < w + 80) drawPlane(ctx, px, py, angle - Math.min(0.3, t * 0.4), scale, now, Math.max(0, 1 - t / 1.4))
}
