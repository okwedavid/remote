// @vitest-environment node
/**
 * Contract test against `e2e/fake-opencode-server.mjs`: the same server the
 * Playwright suite drives in a browser. Keeping it here means the transport +
 * SSE reading path is covered by the fast unit suite too.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createSdkTransport } from './opencode'
import type { Event } from '../types/opencode'

const PORT = 4098
const BASE = `http://127.0.0.1:${PORT}`
let child: ChildProcess

beforeAll(async () => {
  child = spawn(process.execPath, ['e2e/fake-opencode-server.mjs', '--port', String(PORT)], {
    cwd: process.cwd(),
    stdio: 'ignore',
  })
  // Wait for the server to answer.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/global/health`)
      if (response.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('fake server did not start')
})

afterAll(() => {
  child?.kill('SIGTERM')
})

describe('fake OpenCode server contract', () => {
  it('lists sessions and reads the health endpoint', async () => {
    const transport = createSdkTransport({ baseUrl: BASE })
    const health = await transport.health()
    expect(health.healthy).toBe(true)
    expect(health.version).toBe('1.18.34-test')

    const sessions = await transport.listSessions()
    expect(sessions.length).toBeGreaterThan(0)
  })

  it('streams message, tool and idle events as the turn runs', async () => {
    const transport = createSdkTransport({ baseUrl: BASE })
    const sessions = await transport.listSessions()
    const session = sessions[0]
    if (!session) throw new Error('no session')

    const received: Event[] = []
    const unsubscribe = transport.subscribeEvents({
      onEvent: (event) => received.push(event),
      onStatus: () => {},
    })

    // Give the stream a moment to open, then run a turn.
    await new Promise((resolve) => setTimeout(resolve, 150))
    await transport.promptAsync(session.id, { text: 'plan the release' })
    // The turn streams parts for ~150ms and goes idle at ~900ms.
    await new Promise((resolve) => setTimeout(resolve, 1400))
    unsubscribe()

    const types = received.map((event) => event.type)
    expect(types).toContain('message.updated')
    expect(types).toContain('message.part.updated')
    expect(types).toContain('session.idle')
  })
})
