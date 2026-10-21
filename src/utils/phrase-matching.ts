// Normalization per AC-038. Every pattern here is fixed; no regular expression is ever built from user input.
// U+200D sits last in the class: between two other members it reads as a joined sequence (no-misleading-character-class)
const ZERO_WIDTH = /[\u200B\u200C\u2060\uFEFF\u200D]/g
const SINGLE_QUOTES = /[\u2018\u2019]/g
const DOUBLE_QUOTES = /[\u201C\u201D]/g
const DASHES = /[\u2013\u2014]/g
const ELLIPSIS = /\u2026/g
const NBSP = /\u00A0/g
const APOSTROPHES = /'/g
const NON_WORD = /[^\p{L}\p{N}]+/gu

const normalizeText = (text: string): string =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(ZERO_WIDTH, '')
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(DASHES, '-')
    .replace(ELLIPSIS, '...')
    .replace(NBSP, ' ')
    .replace(APOSTROPHES, '')
    .replace(NON_WORD, ' ')

export const toWords = (text: string): string[] =>
  normalizeText(text)
    .split(' ')
    .filter((word) => word.length > 0)

// Words never contain spaces, so a space-delimited join turns a consecutive-word scan into one literal substring
// search -- linear in practice, with no backtracking and no user-built pattern. The text is joined once, so one
// matcher checks many phrases against the same text cheaply.
export const createPhraseMatcher = (textWords: string[]): ((phraseWords: string[]) => boolean) => {
  const haystack = ` ${textWords.join(' ')} `
  return (phraseWords: string[]): boolean =>
    phraseWords.length > 0 && phraseWords.length <= textWords.length && haystack.includes(` ${phraseWords.join(' ')} `)
}

export const containsPhrase = (textWords: string[], phraseWords: string[]): boolean =>
  createPhraseMatcher(textWords)(phraseWords)
