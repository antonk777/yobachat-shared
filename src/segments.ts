import type { ChatMessage, ChatMessageSegment } from './types'

interface Match {
  type: 'url' | 'emote'
  index: number
  length: number
  content: string
  url?: string
}

/**
 * Split message text into text, link, and emote segments.
 * Bad-word filtering stays in the Yobachat client and should run before this.
 */
export function getMessageSegments(
  message: Pick<ChatMessage, 'message' | 'emotesMap'>,
  options: { showEmotes: boolean },
): ChatMessageSegment[] {
  const filtered = message.message
  const segments: ChatMessageSegment[] = []
  const showEmotes = options.showEmotes
    && !!message.emotesMap
    && Object.keys(message.emotesMap).length > 0

  const matches: Match[] = []
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi

  let urlMatch: RegExpExecArray | null
  while ((urlMatch = urlRegex.exec(filtered)) !== null) {
    matches.push({
      type: 'url',
      index: urlMatch.index,
      length: urlMatch[0].length,
      content: urlMatch[0],
    })
  }

  if (showEmotes && message.emotesMap) {
    const emoteIds = Object.keys(message.emotesMap).sort((a, b) => b.length - a.length)

    for (const emoteId of emoteIds) {
      let searchIndex = 0

      while (true) {
        const index = filtered.indexOf(emoteId, searchIndex)
        if (index === -1) {
          break
        }

        matches.push({
          type: 'emote',
          index,
          length: emoteId.length,
          content: emoteId,
          url: message.emotesMap[emoteId],
        })

        searchIndex = index + 1
      }
    }
  }

  matches.sort((a, b) => a.index - b.index)

  const filteredMatches: Match[] = []
  let lastProcessedEnd = 0

  for (const match of matches) {
    const matchEnd = match.index + match.length
    const isOverlapping = match.index < lastProcessedEnd

    if (!isOverlapping) {
      filteredMatches.push(match)
      lastProcessedEnd = matchEnd
    } else if (match.type === 'emote') {
      while (filteredMatches.length > 0) {
        const lastMatch = filteredMatches[filteredMatches.length - 1]!
        const lastMatchEnd = lastMatch.index + lastMatch.length

        if (lastMatchEnd <= match.index) {
          break
        }

        filteredMatches.pop()
      }

      filteredMatches.push(match)
      lastProcessedEnd = matchEnd
    }
  }

  let lastIndex = 0
  for (const match of filteredMatches) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: filtered.substring(lastIndex, match.index),
      })
    }

    if (match.type === 'url') {
      segments.push({
        type: 'link',
        content: match.content,
        url: match.content,
      })
    } else {
      segments.push({
        type: 'emote',
        content: match.content,
        url: match.url!,
      })
    }

    lastIndex = match.index + match.length
  }

  if (lastIndex < filtered.length) {
    segments.push({
      type: 'text',
      content: filtered.substring(lastIndex),
    })
  }

  if (segments.length === 0) {
    return [{ type: 'text', content: filtered }]
  }

  return segments
}

/** True when every non-emote segment is only whitespace, and there is at least one emote. */
export function isEmoteOnlyMessage(segments: ChatMessageSegment[]): boolean {
  let hasEmote = false

  for (const segment of segments) {
    if (segment.type === 'emote') {
      hasEmote = true
      continue
    }

    if (segment.content.trim() !== '') {
      return false
    }
  }

  return hasEmote
}
