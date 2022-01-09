import { extractAccountFromAddress, getAccountPreferences } from '../services/accounts'
import { AccountInboundPreference, AccountPreference } from '../types'

const fetchPreferences = (recipients: string[]): Promise<AccountPreference[]> =>
  Promise.all(recipients.map((address) => getAccountPreferences(extractAccountFromAddress(address))))

const reduceToSinglePreference = (
  previous: { forwardTargets: Set<string>; save: boolean },
  current: AccountPreference
) => ({
  forwardTargets: current.inbound?.forwardTargets
    ? new Set([...previous.forwardTargets, ...current.inbound.forwardTargets])
    : previous.forwardTargets,
  save: current.inbound?.save || previous.save,
})

export const aggregatePreferences = (recipients: string[]): Promise<AccountInboundPreference> =>
  fetchPreferences(recipients).then((allPreferences) =>
    allPreferences.reduce(reduceToSinglePreference, { forwardTargets: new Set(), save: false })
  )
