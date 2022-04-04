import axios from 'axios'

import { accountApiKey, accountApiUrl } from '../config'
import { AccountPreference } from '../types'

const api = axios.create({
  baseURL: accountApiUrl,
  headers: { 'x-api-key': accountApiKey },
})

export const extractAccountFromAddress = (email: string): string => email.replace(/@[a-z0-9.-]+$/i, '')

export const getAccountPreferences = async (account: string, orDefault = true): Promise<AccountPreference> => {
  const response = await api.get(`/accounts/${encodeURIComponent(account)}`, {
    params: { default: orDefault },
  })
  return response.data
}
