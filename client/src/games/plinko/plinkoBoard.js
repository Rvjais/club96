// Canvas renderer for the Plinko board. It does no physics of its own:
// each ball follows the left/right path the server already decided,
// hopping from peg to peg, and reports when it lands in its bucket.
//
// Geometry: with `rows` rows, pegs are spaced sx = width / (rows + 2)
// apart; row r has r + 3 pegs and bucket i sits under x = cx + (i − rows/2)·sx.

export function createPlinkoBoard(canvas, { onLand, onPeg }) {
  const ctx = canvas.getContext('2d')
  let rows = 12
  let width = 0
  let height = 0
  let balls = []
  const flashes = new Map() // "row:peg" → time it was hit
  let raf = 0

  const geo = () => {
    const sx = width / (rows + 2)
    const gap = sx * 0.9
    const top = sx * 0.9
    return { sx, gap, top, cx: width / 2, pegR: Math.max(2, sx * 0.11), ballR: Math.max(3.5, sx * 0.23) }
  }

  function resize() {
    const parent = canvas.parentElement
    if (!parent) return
    width = parent.clientWidth
    const { sx, gap, top } = geo()
    height = Math.round(top + (rows - 1) * gap + sx * 0.75)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.style.height = `${height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  /** Waypoints: drop-in point, a contact point above each peg hit, then the bucket. */
  function waypoints(path, bucket) {
    const { sx, gap, top, cx, pegR, ballR } = geo()
    const pts = [{ x: cx, y: -ballR * 2 }]
    let rights = 0
    for (let r = 0; r < rows; r++) {
      pts.push({ x: cx + (rights - r / 2) * sx, y: top + r * gap - pegR - ballR, row: r, peg: rights + 1 })
      rights += path[r]
    }
    pts.push({ x: cx + (bucket - rows / 2) * sx, y: height - ballR })
    return pts
  }

  function drop(path, bucket, id) {
    const segMs = rows <= 8 ? 135 : rows <= 12 ? 110 : 92
    balls.push({ id, pts: waypoints(path, bucket), seg: 0, t0: performance.now(), segMs, rowsAt: rows, x: width / 2, y: -10 })
  }

  function step(now) {
    const { gap } = geo()
    for (const b of balls) {
      while (true) {
        const dur = b.seg === 0 ? b.segMs * 1.3 : b.segMs
        const t = (now - b.t0) / dur
        const a = b.pts[b.seg]
        const z = b.pts[b.seg + 1]
        if (t < 1) {
          if (b.seg === 0) {
            b.x = a.x
            b.y = a.y + (z.y - a.y) * t * t // falling in from the top
          } else {
            // Bounce off the peg: small hop up, then fall to the next contact point
            b.x = a.x + (z.x - a.x) * (1 - (1 - t) * (1 - t))
            b.y = a.y + (z.y - a.y) * t - gap * 0.38 * 4 * t * (1 - t)
          }
          break
        }
        // Reached the next waypoint
        b.seg++
        b.t0 += dur
        if (z.row != null) {
          flashes.set(`${z.row}:${z.peg}`, now)
          onPeg?.(z.row)
        }
        if (b.seg >= b.pts.length - 1) {
          b.done = true
          onLand?.(b.id)
          break
        }
      }
    }
    balls = balls.filter((b) => !b.done)
  }

  function draw(now) {
    const { sx, gap, top, cx, pegR, ballR } = geo()
    ctx.clearRect(0, 0, width, height)

    for (let r = 0; r < rows; r++) {
      for (let j = 0; j < r + 3; j++) {
        const x = cx + (j - (r + 2) / 2) * sx
        const y = top + r * gap
        const hit = flashes.get(`${r}:${j}`)
        const age = hit ? (now - hit) / 350 : 1
        if (age < 1) {
          ctx.beginPath()
          ctx.fillStyle = `rgba(45, 255, 175, ${0.35 * (1 - age)})`
          ctx.arc(x, y, pegR * (2.6 - age), 0, Math.PI * 2)
          ctx.fill()
        } else if (hit) {
          flashes.delete(`${r}:${j}`)
        }
        ctx.beginPath()
        ctx.fillStyle = age < 1 ? '#8dffd0' : '#c9d6ee'
        ctx.arc(x, y, pegR, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    for (const b of balls) {
      const g = ctx.createRadialGradient(b.x - ballR * 0.3, b.y - ballR * 0.3, ballR * 0.1, b.x, b.y, ballR)
      g.addColorStop(0, '#fffbe6')
      g.addColorStop(0.45, '#ffd84d')
      g.addColorStop(1, '#ff9f1a')
      ctx.shadowColor = 'rgba(255, 196, 61, 0.8)'
      ctx.shadowBlur = 12
      ctx.beginPath()
      ctx.fillStyle = g
      ctx.arc(b.x, b.y, ballR, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
    }
  }

  function loop(now) {
    step(now)
    draw(now)
    raf = requestAnimationFrame(loop)
  }

  const ro = new ResizeObserver(resize)
  ro.observe(canvas.parentElement)
  resize()
  raf = requestAnimationFrame(loop)

  return {
    setRows(n) {
      rows = n
      flashes.clear()
      resize()
    },
    drop,
    inFlight: () => balls.length,
    destroy() {
      cancelAnimationFrame(raf)
      ro.disconnect()
    },
  }
}
