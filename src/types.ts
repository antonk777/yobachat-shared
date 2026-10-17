export type PlatformType = 'twitch' | 'youtube' | 'telegram' | 'vkvideo' | 'kick' | 'goodgame' | 'site'

export interface Platform {
  id: PlatformType
  name: string
  color: string
  abbr: string
}

export type ChatMessageSegment = {
  type: 'text'
  content: string
} | {
  type: 'emote'
  content: string
  url: string
} | {
  type: 'link'
  content: string
  url: string
}

export interface ChatMessage {
  id: string
  channel: string
  username: string
  message: string
  timestamp: number
  platform: Platform
  avatar?: string
  badges?: string[]
  badgeImages?: Record<string, string>
  color?: string
  isSubscriber?: boolean
  isModerator?: boolean
  isVip?: boolean
  isEdited?: boolean
  editDate?: number
  emotesMap?: Record<string, string>
  metadata?: Record<string, unknown>
  replyToId?: string
}

export interface BridgeHello {
  type: 'hello'
  messages: ChatMessage[]
}

export interface BridgeMessages {
  type: 'messages'
  messages: ChatMessage[]
}

export interface BridgeDeleted {
  type: 'deleted'
  ids: string[]
}

export interface BridgeClear {
  type: 'clear'
}

export interface BridgeSiteMessage {
  type: 'site-message'
  message: ChatMessage
}

export type BridgeEvent =
  | BridgeHello
  | BridgeMessages
  | BridgeDeleted
  | BridgeClear
  | BridgeSiteMessage

export const kMaxHistoryMessages = 100

/** Fixed route on the site. Not part of Yobachat config. */
export const kChatBridgePath = '/api/chat/bridge'

/** Browser socket for the theatre panel. Same origin as the page. */
export const kChatLivePath = '/api/chat/live'

/**
 * Build the bridge WebSocket URL from a site origin.
 * `http://127.0.0.1:3000` becomes `ws://127.0.0.1:3000/api/chat/bridge`.
 * `https://example.com` becomes `wss://example.com/api/chat/bridge`.
 */
export function chatBridgeSocketUrl(origin: string): string {
  const url = new URL(origin.trim())

  if (url.protocol === 'http:') {
    url.protocol = 'ws:'
  } else if (url.protocol === 'https:') {
    url.protocol = 'wss:'
  } else if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new Error('siteBridge.origin must be an http(s) origin')
  }

  url.pathname = kChatBridgePath
  url.search = ''
  url.hash = ''
  return url.toString()
}
