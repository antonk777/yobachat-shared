export type {
  PlatformType,
  Platform,
  ChatMessage,
  ChatMessageSegment,
  BridgeHello,
  BridgeMessages,
  BridgeDeleted,
  BridgeClear,
  BridgeSiteMessage,
  BridgeEvent,
} from './types'

export { kMaxHistoryMessages, kChatBridgePath, kChatLivePath, chatBridgeSocketUrl } from './types'
export { getMessageSegments } from './segments'
