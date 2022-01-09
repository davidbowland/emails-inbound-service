import { SESEvent } from '../types'

export const handleIncomingEmail = (event: SESEvent): Promise<string> => {
  console.log(event)
  return Promise.resolve('Hello, world')
}
