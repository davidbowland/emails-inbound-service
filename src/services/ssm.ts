import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'

import { xrayCapture } from '../utils/logging'

const ssm = xrayCapture(new SSMClient({}))

export const getParameter = async (name: string): Promise<string> => {
  const response = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }))
  const value = response.Parameter?.Value
  if (value === undefined) {
    throw new Error(`SSM parameter ${name} has no value`)
  }
  return value
}

// Each parameter is memoized independently, per warm container: a function granted ssm:GetParameter on one
// path must never reach for another. The cache never expires, so a rotated value requires a cold start.
export const memoized = (fetchValue: () => Promise<string>): (() => Promise<string>) => {
  let cached: Promise<string> | undefined
  return (): Promise<string> => {
    // The promise is cached rather than the resolved value, so calls that overlap on a cold container share
    // one read instead of racing past a guard that has not been satisfied yet. A rejection is evicted: a
    // cached failure would wedge the container for the rest of its life over one throttled SSM call.
    cached ??= fetchValue().catch((error) => {
      cached = undefined
      throw error
    })
    return cached
  }
}
