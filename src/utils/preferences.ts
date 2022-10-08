import { AccountInboundPreference, AccountPreference } from '../types'
import { extractAccountFromAddress, getAccountPreferences } from '../services/accounts'

const fetchPreferences = (recipients: string[]): Promise<AccountPreference[]> =>
  Promise.all(recipients.map((address) => getAccountPreferences(extractAccountFromAddress(address))))

const reduceToSinglePreference = (previous: { forwardTargets: Set<string> }, current: AccountPreference) => ({
  forwardTargets: current.inbound?.forwardTargets
    ? new Set([...previous.forwardTargets, ...current.inbound.forwardTargets])
    : previous.forwardTargets,
})

export const aggregatePreferences = (recipients: string[]): Promise<AccountInboundPreference> =>
  fetchPreferences(recipients).then((allPreferences) =>
    allPreferences.reduce(reduceToSinglePreference, { forwardTargets: new Set() })
  )
