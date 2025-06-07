import { extractAccountFromAddress, getAccountPreferences } from '../services/emails'
import { AccountPreference } from '../types'

const fetchPreferences = (recipients: string[]): Promise<AccountPreference[]> =>
  Promise.all(recipients.map((address) => getAccountPreferences(extractAccountFromAddress(address))))

const reduceToSinglePreference = (previous: AccountPreference, current: AccountPreference): AccountPreference => ({
  forwardTargets:
    current?.forwardTargets && previous.forwardTargets
      ? [...previous.forwardTargets, ...current.forwardTargets]
      : previous.forwardTargets,
})

export const aggregatePreferences = (recipients: string[]): Promise<AccountPreference> =>
  fetchPreferences(recipients).then((allPreferences) =>
    allPreferences.reduce(reduceToSinglePreference, { forwardTargets: [] }),
  )
