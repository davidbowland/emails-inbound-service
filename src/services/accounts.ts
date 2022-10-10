import axios from 'axios'

import { accountApiKey, accountApiUrl } from '../config'
import { AccountPreference } from '../types'
import { xrayCaptureHttps } from '../utils/logging'

xrayCaptureHttps()
const api = axios.create({
  baseURL: accountApiUrl,
  headers: { 'x-api-key': accountApiKey },
})

export const extractAccountFromAddress = (email: string): string => email.replace(/@[a-z0-9.-]+$/i, '')

export const getAccountPreferences = (account: string, orDefault = true): Promise<AccountPreference> =>
  api
    .get(`/accounts/${encodeURIComponent(account)}`, {
      params: { default: orDefault },
    })
    .then((response: any) => response.data)
