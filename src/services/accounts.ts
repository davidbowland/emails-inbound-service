import axios from 'axios'

import { accountApiKeyName, accountApiUrl } from '../config'
import { getApiKey } from '../services/api-keys'
import { AccountPreference } from '../types'

const api = axios.create({
  baseURL: accountApiUrl,
})

export const extractAccountFromAddress = (email: string): string => email.replace(/@[a-z0-9.-]+$/i, '')

export const getAccountPreferences = async (account: string, orDefault = true): Promise<AccountPreference> => {
  const apiKey = await getApiKey(accountApiKeyName)
  const response = await api.get(`/accounts/${encodeURIComponent(account)}`, {
    headers: { 'x-api-key': apiKey },
    params: { default: orDefault },
  })
  return response.data
}
