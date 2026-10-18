import { z } from 'zod'

const CONTROL_CHARS = /[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g
const EMOTE_NAME = /^[A-Za-z0-9_]{2,20}$/
const AUTHOR_ID = /^[A-Za-z0-9_-]{1,64}$/
const MAX_FILE_BYTES = 512 * 1024
const MAX_FILE_BASE64 = 800_000

export const EMOTE_NAME_ERROR = 'Имя: 2–20 символов, латиница, цифры и _'

function clean(value: string): string {
  return value.replace(CONTROL_CHARS, '').trim()
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

export const EmoteNameSchema = z.string()
  .max(80)
  .transform(clean)
  .pipe(z.string().regex(EMOTE_NAME))

export const EmoteAuthorSchema = z.object({
  authorId: z.string().regex(AUTHOR_ID),
  authorName: z.string().max(200).transform(value => clean(value).slice(0, 100)).pipe(z.string().min(1)),
}).strip()

export const SiteEmoteSchema = z.object({
  id: z.string().uuid(),
  name: z.string().regex(EMOTE_NAME),
  code: z.string().regex(/^:[A-Za-z0-9_]{2,20}:$/),
  url: z.string().max(2048).refine(isHttpUrl),
  status: z.enum(['pending', 'approved']),
  authorName: z.string().max(200).transform(value => clean(value).slice(0, 100)).pipe(z.string().min(1)),
}).strip().refine(emote => emote.code === `:${emote.name}:`)

export const ApprovedEmoteSchema = z.object({
  name: z.string().regex(EMOTE_NAME),
  code: z.string().regex(/^:[A-Za-z0-9_]{2,20}:$/),
  url: z.string().max(2048).refine(isHttpUrl),
}).strip().refine(emote => emote.code === `:${emote.name}:`)

export const EmoteReviewSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
}).strip()

export const EmoteRenameSchema = z.object({
  id: z.string().uuid(),
  name: EmoteNameSchema,
}).strip()

export const EmoteDeleteSchema = z.object({
  id: z.string().uuid(),
}).strip()

export const EmoteAddFileSchema = z.object({
  name: EmoteNameSchema,
  dataBase64: z.string().min(1).max(MAX_FILE_BASE64).regex(/^[A-Za-z0-9+/]+={0,2}$/),
}).strip()

export const EmoteAddSchema = z.object({
  files: z.array(EmoteAddFileSchema).min(1).max(20),
}).strip()

export const StoredEmoteSchema = z.object({
  id: z.string().uuid(),
  name: z.string().regex(EMOTE_NAME),
  ext: z.enum(['png', 'gif']),
  status: z.enum(['pending', 'approved']),
  authorId: z.string().regex(AUTHOR_ID),
  authorName: z.string().max(200).transform(value => clean(value).slice(0, 100)).pipe(z.string().min(1)),
  createdAt: z.number().int().positive(),
}).strip()

const StoredSubmissionSchema = z.object({
  userId: z.string().regex(AUTHOR_ID),
  createdAt: z.number().int().positive(),
}).strip()

export type StoredEmoteRecord = z.infer<typeof StoredEmoteSchema>

export function parseEmoteName(input: unknown): string | null {
  const result = EmoteNameSchema.safeParse(input)
  return result.success ? result.data : null
}

export function parseEmoteAuthor(input: unknown): { authorId: string, authorName: string } | null {
  const result = EmoteAuthorSchema.safeParse(input)
  return result.success ? result.data : null
}

export function parseApprovedEmotes(input: unknown): { name: string, code: string, url: string }[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input.flatMap((item) => {
    const result = ApprovedEmoteSchema.safeParse(item)
    return result.success ? [result.data] : []
  })
}

export function parseStoredEmote(input: unknown): StoredEmoteRecord | null {
  const result = StoredEmoteSchema.safeParse(input)
  return result.success ? result.data : null
}

export function parseStoredSubmissions(input: unknown): { userId: string, createdAt: number }[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input.flatMap((item) => {
    const result = StoredSubmissionSchema.safeParse(item)
    return result.success ? [result.data] : []
  })
}

export function emoteFileByteLength(input: unknown): number | null {
  if (!input || typeof input !== 'object' || !('length' in input)) {
    return null
  }

  const length = (input as { length?: unknown }).length

  if (typeof length !== 'number' || !Number.isInteger(length) || length < 1 || length > MAX_FILE_BYTES) {
    return null
  }

  return length
}
