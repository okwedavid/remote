import { describe, expect, it } from 'vitest'
import { describeOrigin, isCrossOrigin, isLoopbackUrl, normalizeServerUrl, parseServerUrl } from './urls'

describe('parseServerUrl', () => {
  it('accepts a bare host:port and adds a scheme', () => {
    expect(parseServerUrl('localhost:4096')).toEqual({ ok: true, url: 'http://localhost:4096' })
  })

  it('strips trailing slashes', () => {
    expect(parseServerUrl('https://opencode.example.com///')).toEqual({
      ok: true,
      url: 'https://opencode.example.com',
    })
  })

  it('keeps an optional path prefix used by some tunnels', () => {
    expect(parseServerUrl('https://host.tunnel.dev/opencode')).toEqual({
      ok: true,
      url: 'https://host.tunnel.dev/opencode',
    })
  })

  it('rejects empty input, other schemes and embedded credentials', () => {
    expect(parseServerUrl('').ok).toBe(false)
    expect(parseServerUrl('ftp://localhost:4096').ok).toBe(false)
    const withCreds = parseServerUrl('http://user:pass@localhost:4096')
    expect(withCreds.ok).toBe(false)
    if (!withCreds.ok) expect(withCreds.reason).toMatch(/username and password fields/)
  })

  it('rejects nonsense', () => {
    expect(parseServerUrl('http://').ok).toBe(false)
  })
})

describe('normalizeServerUrl', () => {
  it('returns an empty string for unusable input', () => {
    expect(normalizeServerUrl('   ')).toBe('')
  })

  it('normalises a valid URL', () => {
    expect(normalizeServerUrl('192.168.1.20:4096/')).toBe('http://192.168.1.20:4096')
  })
})

describe('origin helpers', () => {
  it('describes the origin without any path or credentials', () => {
    expect(describeOrigin('http://192.168.1.20:4096/session')).toBe('http://192.168.1.20:4096')
  })

  it('detects loopback addresses', () => {
    expect(isLoopbackUrl('http://localhost:4096')).toBe(true)
    expect(isLoopbackUrl('http://127.0.0.1:4096')).toBe(true)
    expect(isLoopbackUrl('http://192.168.1.20:4096')).toBe(false)
  })

  it('flags cross-origin servers (jsdom runs on localhost:3000)', () => {
    expect(isCrossOrigin('http://localhost:4096')).toBe(true)
    expect(isCrossOrigin(window.location.origin)).toBe(false)
  })
})
