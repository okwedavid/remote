/**
 * Conversation state folding.
 *
 * Messages and parts arrive from three sources (initial fetch, SSE events and
 * occasional refreshes) and they can interleave. Keeping them in two keyed maps
 * makes every update idempotent:
 *
 *   - a part can arrive before its message without being lost
 *   - replaying a fetch after a burst of events converges to the server state
 *   - a dropped SSE frame can never duplicate text, because the server snapshot
 *     for a part always wins over locally accumulated deltas
 */
import type { Message, Part, TextPart } from '../types/opencode'
import type { MessageWithParts, OptimisticMessage } from '../types/opencode'

export interface ConversationState {
  messages: Record<string, Message>
  parts: Record<string, Part[]>
}

export const emptyConversation: ConversationState = { messages: {}, parts: {} }

function messageOrder(a: Message, b: Message): number {
  const created = a.time.created - b.time.created
  if (created !== 0) return created
  if (a.role !== b.role) return a.role === 'user' ? -1 : 1
  return a.id.localeCompare(b.id)
}

export function upsertMessage(state: ConversationState, info: Message): ConversationState {
  const existing = state.messages[info.id]
  if (existing === info) return state
  return { messages: { ...state.messages, [info.id]: info }, parts: state.parts }
}

/** Fold a single part update; later snapshots from the same source replace earlier ones. */
export function upsertPart(state: ConversationState, part: Part): ConversationState {
  const list = state.parts[part.messageID] ?? []
  const index = list.findIndex((entry) => entry.id === part.id)

  if (index === -1) {
    return { messages: state.messages, parts: { ...state.parts, [part.messageID]: [...list, part] } }
  }

  const previous = list[index] as Part
  let next: Part = part

  if (previous.type === 'text' && part.type === 'text') {
    // Guard against a shorter in-flight snapshot clobbering text we already
    // streamed. The part is still considered open when it has no end time.
    const partText = part as TextPart
    const isOpen = partText.time?.end === undefined
    if (isOpen && partText.text.length < previous.text.length) {
      next = { ...part, text: previous.text }
    }
  }

  const updated = [...list]
  updated[index] = next
  return { messages: state.messages, parts: { ...state.parts, [part.messageID]: updated } }
}

export function removePart(
  state: ConversationState,
  messageID: string,
  partID: string,
): ConversationState {
  const list = state.parts[messageID]
  if (!list) return state
  return {
    messages: state.messages,
    parts: { ...state.parts, [messageID]: list.filter((part) => part.id !== partID) },
  }
}

export function removeMessage(state: ConversationState, messageID: string): ConversationState {
  if (!state.messages[messageID]) return state
  const messages = { ...state.messages }
  delete messages[messageID]
  const parts = { ...state.parts }
  delete parts[messageID]
  return { messages, parts }
}

export function replaceConversation(entries: MessageWithParts[]): ConversationState {
  const messages: Record<string, Message> = {}
  const parts: Record<string, Part[]> = {}
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || !entry.info) continue
    messages[entry.info.id] = entry.info
    parts[entry.info.id] = Array.isArray(entry.parts) ? [...entry.parts] : []
  }
  return { messages, parts }
}

/** Sorted conversation for rendering. */
export function toMessageList(state: ConversationState): MessageWithParts[] {
  return Object.values(state.messages)
    .sort(messageOrder)
    .map((info) => ({ info, parts: state.parts[info.id] ?? [] }))
}

/** True while a text or reasoning part is still being written. */
export function isPartStreaming(part: Part): boolean {
  if (part.type === 'text' || part.type === 'reasoning') {
    return (part as TextPart).time?.end === undefined
  }
  if (part.type === 'tool') return part.state.status === 'running' || part.state.status === 'pending'
  return false
}

export function isSessionStreaming(state: ConversationState): boolean {
  const list = toMessageList(state)
  const last = list[list.length - 1]
  // Only an assistant turn can be streaming. OpenCode does not always stamp a
  // `time.end` on the user's own text part, and treating that as "still running"
  // left the composer stuck on Stop after an abort.
  if (!last || last.info.role !== 'assistant') return false
  return last.parts.some(isPartStreaming)
}

/**
 * Drop optimistic echoes once the server has echoed the same user message back.
 * Matching on text keeps this robust without inventing message ids.
 */
export function reconcileOptimistic(
  optimistic: OptimisticMessage[],
  entries: MessageWithParts[] | ConversationState,
): OptimisticMessage[] {
  if (optimistic.length === 0) return optimistic
  const list = Array.isArray(entries) ? entries : toMessageList(entries)
  const userTexts = new Set<string>()
  for (const entry of list) {
    if (entry.info.role !== 'user') continue
    for (const part of entry.parts) {
      if (part.type === 'text') userTexts.add(part.text.trim())
    }
  }
  if (userTexts.size === 0) return optimistic
  return optimistic.filter((entry) => !userTexts.has(entry.text.trim()))
}
