import * as uuidV1 from 'uuid'

import { attachment, email, uuid } from '../__mocks__'
import * as queue from '@services/queue'
import * as s3 from '@services/s3'
import * as utilsAttachments from '@utils/attachments'
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
      jest.mocked(s3).copyS3Object.mockResolvedValue(undefined)
      jest.mocked(queue).sendEmail.mockResolvedValue(undefined)
      jest.mocked(utilsAttachments).getAttachmentId.mockReturnValue(attachment.cid)
      jest.mocked(uuidV1).v1.mockReturnValue(uuid)
    })

    it('should call sendEmail for each recipient', async () => {
      const recipient1 = 'one@email.address'
      const recipient2 = 'two@email.address'
      await forwardEmail([recipient1, recipient2], email, [attachment])

      expect(queue.sendEmail).toHaveBeenCalledWith(recipient1, email, [transformedAttachment])
      expect(queue.sendEmail).toHaveBeenCalledWith(recipient2, email, [transformedAttachment])
    })

    it('should call copyS3Object for attachments', async () => {
      const recipient1 = 'one@email.address'
      await forwardEmail([recipient1], email, [attachment])

      expect(s3.copyS3Object).toHaveBeenCalledWith(attachment.content, transformedAttachment.content)
    })
  })
})
