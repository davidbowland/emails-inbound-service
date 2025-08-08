import {
  CopyObjectCommand,
  CopyObjectOutput,
  DeleteObjectCommand,
  DeleteObjectOutput,
  GetObjectCommand,
  PutObjectCommand,
  PutObjectOutput,
  S3Client,
} from '@aws-sdk/client-s3'

import { emailBucket } from '../config'
import { StringObject } from '../types'
import { log, xrayCapture } from '../utils/logging'

const s3 = xrayCapture(new S3Client({ apiVersion: '2006-03-01' }))

export const copyS3Object = async (from: string, to: string): Promise<CopyObjectOutput> => {
  const command = new CopyObjectCommand({ Bucket: emailBucket, CopySource: `/${emailBucket}/${from}`, Key: to })
  return s3.send(command)
}

export const deleteS3Object = async (key: string): Promise<DeleteObjectOutput> => {
  const command = new DeleteObjectCommand({ Bucket: emailBucket, Key: key })
  return s3.send(command)
}

export const getS3Object = async (key: string): Promise<string> => {
  const command = new GetObjectCommand({ Bucket: emailBucket, Key: key })
  const response = await s3.send(command)
  return response.Body
}

export const putS3Object = async (
  key: string,
  body: Buffer | string,
  metadata: StringObject = {},
): Promise<PutObjectOutput> => {
  const bodySize = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body, 'utf8')
  log('Uploading to S3', { key, size: bodySize })

  const command = new PutObjectCommand({ Body: body, Bucket: emailBucket, Key: key, Metadata: metadata })
  return s3.send(command)
}
