/**
 * Agents and models available on the connected server, used by the composer.
 * Loaded once per transport; failures are non-fatal (the selects simply stay
 * empty and prompts use the server defaults).
 */
import { useCallback, useRef, useState } from 'react'
import type { Agent, ProviderSummary } from '../types/opencode'
import type { OpenCodeTransport } from '../lib/transport'

export interface UseCatalogResult {
  agents: Agent[]
  providers: ProviderSummary[]
  load: () => void
}

export function useCatalog(transport: OpenCodeTransport | null, enabled: boolean): UseCatalogResult {
  const [agents, setAgents] = useState<Agent[]>([])
  const [providers, setProviders] = useState<ProviderSummary[]>([])
  const loadedFor = useRef<OpenCodeTransport | null>(null)
  const inFlight = useRef(false)

  const load = useCallback(() => {
    if (!transport || !enabled) return
    if (loadedFor.current === transport || inFlight.current) return
    inFlight.current = true
    void (async () => {
      try {
        const [agentList, providerList] = await Promise.all([
          transport.agents().catch(() => [] as Agent[]),
          transport.providers().catch(() => null),
        ])
        setAgents(agentList)
        if (providerList) setProviders(providerList.providers)
        loadedFor.current = transport
      } finally {
        inFlight.current = false
      }
    })()
  }, [transport, enabled])

  return { agents, providers, load }
}
