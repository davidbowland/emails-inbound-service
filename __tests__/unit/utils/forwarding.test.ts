import * as uuidV1 from 'uuid'
import { mocked } from 'jest-mock'

import * as queue from '@services/queue'
import * as s3 from '@services/s3'
import * as utilsAttachments from '@utils/attachments'
import { attachment, email, uuid } from '../__mocks__'
import { forwardEmail } from '@utils/forwarding'

jest.mock('@services/s3')
jest.mock('@services/queue')
jest.mock('@utils/attachments')
jest.mock('uuid')

describe('forwarding', () => {
  describe('forwardEmail', () => {
    const transformedAttachment = {
      ...attachment,
      content: 'queue/uuuuu-uuuuu-iiiii-ddddd-22222/ytghji87ytgbhj',
    }

    beforeAll(() => {
      mocked(s3).copyS3Object.mockResolvedValue(undefined)
      mocked(queue).sendEmail.mockResolvedValue(undefined)
      mocked(utilsAttachments).getAttachmentId.mockReturnValue(attachment.cid)
      mocked(uuidV1).v1.mockReturnValue(uuid)
    })

    test('expect sendEmail to be called for each recipient', async () => {
      const recipient1 = 'one@email.address'
      const recipient2 = 'two@email.address'
      await forwardEmail([recipient1, recipient2], email, [attachment])
      expect(mocked(queue).sendEmail).toHaveBeenCalledWith(recipient1, email, [transformedAttachment])
      expect(mocked(queue).sendEmail).toHaveBeenCalledWith(recipient2, email, [transformedAttachment])
    })

    test('expect copyS3Object called for attachments', async () => {
      const recipient1 = 'one@email.address'
      await forwardEmail([recipient1], email, [attachment])
      expect(mocked(s3).copyS3Object).toHaveBeenCalledWith(attachment.content, transformedAttachment.content)
    })
  })
})
