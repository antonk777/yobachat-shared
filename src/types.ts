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
