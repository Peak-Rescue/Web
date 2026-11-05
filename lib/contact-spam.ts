// Heuristics for the bot spam that gets past the contact form honeypot:
// submissions where every field is a random string like
// "QRAsSBkobkEANBEEjZHnpgg". Flagged submissions are still stored
// (spam = true) so nothing real is ever lost — they just skip the email
// notification and land in the admin spam list instead of the inbox.

function looksGibberish(value: string): boolean {
  const letters = value.replace(/[^a-zA-Z]/g, '')
  if (letters.length < 8) return false

  // Lowercase→uppercase flips mid-string ("kobkEANB"): humans produce these
  // at most once or twice (McDonald, LaTeX); random strings do it constantly.
  let flips = 0
  for (let i = 1; i < value.length; i++) {
    if (/[a-z]/.test(value[i - 1]) && /[A-Z]/.test(value[i])) flips++
  }
  if (flips >= 3) return true

  // English text runs roughly 35–45% vowels; random consonant soup runs far
  // lower. Only judge strings long enough for the ratio to mean something.
  if (letters.length >= 10) {
    const vowels = (letters.match(/[aeiouyAEIOUY]/g) ?? []).length
    if (vowels / letters.length < 0.2) return true
  }

  return false
}

export function isLikelyContactSpam(fields: {
  firstName: string
  lastName: string
  email: string
  organization: string | null
  message: string
}): boolean {
  let score = 0
  if (looksGibberish(fields.firstName)) score += 1
  if (looksGibberish(fields.lastName)) score += 1
  if (fields.organization && looksGibberish(fields.organization)) score += 1

  // A gibberish message — or any "message" with no whitespace at all — is
  // strong enough evidence on its own, so it carries double weight.
  const msg = fields.message
  if (looksGibberish(msg) || (msg.length >= 12 && !/\s/.test(msg))) score += 2

  // A "message" with no letters at all is a bot pasting a phone number.
  else if (!/[a-zA-Z]/.test(msg)) score += 2

  // Gmail ignores dots, so bots scatter them to mint fresh addresses
  // ("geb.i.yuz.ow.u.y.u.7.7@gmail.com"). One or two dots is a person.
  const [local, domain] = fields.email.toLowerCase().split('@')
  if (domain === 'gmail.com' && (local.match(/\./g) ?? []).length >= 3) score += 1

  // Requiring two signals keeps a lone unusual name or org out of spam.
  return score >= 2
}
