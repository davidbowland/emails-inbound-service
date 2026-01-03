import { log } from './logging'

const extractDomainFromEmail = (email: string): string => {
  const match = email.match(/@([^@]+)$/)
  return match ? match[1].toLowerCase() : ''
}

const doesSenderMatchSetting = (senderEmail: string, setting: string): boolean => {
  const normalizedSender = senderEmail.toLowerCase()
  const normalizedSetting = setting.toLowerCase()

  // Exact email match
  if (normalizedSender === normalizedSetting) {
    log('Bouncing exact sender match')
    return true
  }

  // Domain matching - setting should match all subdomains but not partial matches
  if (!normalizedSetting.includes('@')) {
    const senderDomain = extractDomainFromEmail(normalizedSender)

    // Exact domain match
    if (senderDomain === normalizedSetting) {
      log('Bouncing exact domain match', { senderDomain })
      return true
    }

    // Subdomain match - sender domain should end with .setting
    if (senderDomain.endsWith(`.${normalizedSetting}`)) {
      log('Bouncing domain match with subdomain', { normalizedSetting })
      return true
    }
  }

  return false
}

export const shouldBounceSender = (senderEmail: string, bounceSenders: string[]): boolean => {
  for (const sender of bounceSenders) {
    // If sender is falsey, all senders match
    if (!sender) {
      return true
    }

    const senders = sender.split(',').map((s) => s.trim())
    for (const senderPattern of senders) {
      if (senderPattern && doesSenderMatchSetting(senderEmail, senderPattern)) {
        return true
      }
    }
  }

  return false
}
