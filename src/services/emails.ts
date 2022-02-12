import axios from 'axios'

import { emailApiKeyName, emailApiUrl } from '../config'
import { getApiKey } from '../services/api-keys'
import { Email } from '../types'

const api = axios.create({
  baseURL: emailApiUrl,
})

export const saveEmail = (email: Email): Promise<unknown> =>
  getApiKey(emailApiKeyName).then((emailApiKey) =>
    api.put(`/emails/${encodeURIComponent(email.id)}`, email, {
      headers: {
        'x-api-key': emailApiKey,
      },
    })
  )
