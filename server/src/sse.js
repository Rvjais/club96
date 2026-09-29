// Server-Sent Events channel: each connected client receives its own
// per-user snapshot whenever the game pushes an update.

export function createChannel(snapshotFor) {
  const clients = new Set()

  async function write(client) {
    try {
      const snap = await snapshotFor(client.userId)
      if (!client.closed) client.res.write(`data: ${JSON.stringify(snap)}\n\n`)
    } catch (err) {
      console.error('SSE snapshot failed:', err.message)
    }
  }

  const heartbeat = setInterval(() => {
    for (const c of clients) c.res.write(': ping\n\n')
  }, 20000)
  heartbeat.unref()

  return {
    /** Express handler body for GET /stream (after requireAuth). */
    connect(req, res) {
      res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
      res.flushHeaders()
      res.write('retry: 2000\n\n')
      const client = { res, userId: req.userId, closed: false }
      clients.add(client)
      write(client)
      req.on('close', () => {
        client.closed = true
        clients.delete(client)
      })
    },

    broadcast() {
      return Promise.all([...clients].map(write))
    },

    sendTo(userId) {
      return Promise.all([...clients].filter((c) => c.userId === String(userId)).map(write))
    },
  }
}
