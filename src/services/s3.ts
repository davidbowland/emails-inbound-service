import { S3 } from 'aws-sdk'

import { emailBucket } from '../config'
import { StringObject } from '../types'

const s3 = new S3({ apiVersion: '2006-03-01' })

/* Copy */

export const copyS3Object = (from: string, to: string): Promise<S3.CopyObjectOutput> =>
  s3.copyObject({ Bucket: emailBucket, CopySource: `/${emailBucket}/${from}`, Key: to }).promise()

/* Get */

export const getS3Object = (key: string): Promise<string> =>
  s3
    .getObject({ Bucket: emailBucket, Key: key })
    .promise()
    .then((result) => result.Body as string)

/* Put */

export const putS3Object = (
  key: string,
  body: Buffer | string,
  metadata: StringObject = {}
): Promise<S3.PutObjectOutput> =>
  s3.putObject({ Body: body, Bucket: emailBucket, Key: key, Metadata: metadata }).promise()
