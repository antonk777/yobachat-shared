import type { ChatMessage } from './types'
import { z } from 'zod'

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/
const CONTROL_CHAR = /[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/
const CONTROL_CHARS = new RegExp(CONTROL_CHAR.source, 'g')
const PLATFORM_IDS = ['twitch', 'youtube', 'telegram', 'vkvideo', 'kick', 'goodgame', 'site'] as const

function cleanChatText(value: string): string {
  return value.replace(CONTROL_CHARS, '').trim()
}

function clip(value: string, max: number): string {
  return cleanChatText(value).slice(0, max)
}

function isHttpUrl(value: string): boolean {
  if (value.length === 0 || value.length > 2048) {
    return false
  }

  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function httpUrlMap(value: unknown, keyMax: number, maxEntries: number): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const next: Record<string, string> = {}

  for (const [key, url] of Object.entries(value)) {
    if (Object.keys(next).length >= maxEntries) {
      break
    }

    const name = clip(key, keyMax)

    if (!name || typeof url !== 'string' || !isHttpUrl(url)) {
      continue
    }

    next[name] = url
  }

  return Object.keys(next).length > 0 ? next : undefined
}

const textField = (max: number) => z.string().max(max * 4).transform(value => clip(value, max))

export const ChatPostSchema = z.object({
  text: z.string().max(500).transform(cleanChatText).pipe(z.string().min(1).max(500)),
  replyToId: z.unknown().optional().transform((value) => {
    if (typeof value !== 'string') {
      return undefined
    }

    const id = cleanChatText(value)

    if (!id || id.length > 128) {
      return undefined
    }

    return id
  }),
}).strip()

export const ChatMessageSchema = z.object({
  id: z.string().min(1).max(128).refine(id => !CONTROL_CHAR.test(id)),
  channel: textField(200).pipe(z.string().min(1)),
  username: textField(100),
  message: z.string().max(20000).transform(value => clip(value, 5000)),
  timestamp: z.number().int().positive(),
  platform: z.object({
    id: z.enum(PLATFORM_IDS),
    name: textField(100).pipe(z.string().min(1)),
    color: z.string().max(100).transform(value => HEX_COLOR.test(value) ? value : '#808080'),
    abbr: textField(10).pipe(z.string().min(1)),
  }),
  avatar: z.unknown().optional().transform(value => (
    typeof value === 'string' && isHttpUrl(value) ? value : undefined
  )),
  badges: z.unknown().optional().transform((value) => {
    if (!Array.isArray(value)) {
      return undefined
    }

    const next = value
      .filter((item): item is string => typeof item === 'string')
      .map(item => clip(item, 50))
      .filter(item => item.length > 0)
      .slice(0, 20)

    return next.length > 0 ? next : undefined
  }),
  badgeImages: z.unknown().optional().transform(value => httpUrlMap(value, 50, 20)),
  color: z.unknown().optional().transform(value => (
    typeof value === 'string' && HEX_COLOR.test(value) ? value : undefined
  )),
  isSubscriber: z.unknown().optional().transform(value => typeof value === 'boolean' ? value : undefined),
  isModerator: z.unknown().optional().transform(value => typeof value === 'boolean' ? value : undefined),
  isVip: z.unknown().optional().transform(value => typeof value === 'boolean' ? value : undefined),
  isEdited: z.unknown().optional().transform(value => typeof value === 'boolean' ? value : undefined),
  editDate: z.unknown().optional().transform(value => (
    typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
  )),
  emotesMap: z.unknown().optional().transform(value => httpUrlMap(value, 100, 50)),
  qrUrl: z.unknown().optional().transform(value => (
    typeof value === 'string' && isHttpUrl(value) ? value : undefined
  )),
  metadata: z.record(z.string(), z.unknown()).optional(),
  replyToId: z.unknown().optional().transform((value) => {
    if (typeof value !== 'string') {
      return undefined
    }

    const id = cleanChatText(value)
    return id && id.length <= 128 ? id : undefined
  }),
}).strip()

export function parseChatPost(input: unknown): { text: string, replyToId?: string } | null {
  const result = ChatPostSchema.safeParse(input)

  if (!result.success) {
    return null
  }

  return {
    text: result.data.text,
    replyToId: result.data.replyToId,
  }
}

export function parseChatMessage(input: unknown): ChatMessage | null {
  const result = ChatMessageSchema.safeParse(input)
  return result.success ? result.data : null
}
