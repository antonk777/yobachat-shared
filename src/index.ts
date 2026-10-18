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
  SiteEmote,
  SiteEmoteFile,
  BridgeEmoteQueue,
  BridgeEmoteReview,
  BridgeEmoteAdd,
  BridgeEmoteRename,
  BridgeEmoteDelete,
} from './types'

export { kMaxHistoryMessages, kChatBridgePath, kChatLivePath, chatBridgeSocketUrl } from './types'
export { getMessageSegments } from './segments'
export { qrImageSrc } from './qr'
export { prepareEmoteFile } from './resize-emote'
export type { PrepareEmoteResult } from './resize-emote'
export {
  ChatPostSchema,
  ChatMessageSchema,
  parseChatPost,
  parseChatMessage,
} from './chat-message'
export {
  EMOTE_NAME_ERROR,
  EmoteNameSchema,
  EmoteAuthorSchema,
  SiteEmoteSchema,
  ApprovedEmoteSchema,
  EmoteReviewSchema,
  EmoteRenameSchema,
  EmoteDeleteSchema,
  EmoteAddFileSchema,
  EmoteAddSchema,
  StoredEmoteSchema,
  parseEmoteName,
  parseEmoteAuthor,
  parseApprovedEmotes,
  parseStoredEmote,
  parseStoredSubmissions,
  emoteFileByteLength,
} from './chat-emote'
export type { StoredEmoteRecord } from './chat-emote'
