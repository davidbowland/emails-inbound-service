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
import { Readable } from 'stream'

import { emailBucket } from '../config'
import { StringObject } from '../types'
import { xrayCapture } from '../utils/logging'

const s3 = xrayCapture(new S3Client({ apiVersion: '2006-03-01' }))

export const copyS3Object = async (from: string, to: string): Promise<CopyObjectOutput> => {
  const command = new CopyObjectCommand({ Bucket: emailBucket, CopySource: `/${emailBucket}/${from}`, Key: to })
  return s3.send(command)
}

export const deleteS3Object = async (key: string): Promise<DeleteObjectOutput> => {
  const command = new DeleteObjectCommand({ Bucket: emailBucket, Key: key })
  return s3.send(command)
}

const readableToBuffer = (stream: Readable): Promise<Buffer> =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks)))
  })

export const getS3Object = async (key: string): Promise<string> => {
  const command = new GetObjectCommand({ Bucket: emailBucket, Key: key })
  const response = await s3.send(command)

  const s3Data = await readableToBuffer(response.Body as Readable)
  return s3Data.toString('utf-8')
}

export const putS3Object = async (
  key: string,
  body: Buffer | string,
  metadata: StringObject = {},
): Promise<PutObjectOutput> => {
  const command = new PutObjectCommand({ Body: body, Bucket: emailBucket, Key: key, Metadata: metadata })
  return s3.send(command)
}
