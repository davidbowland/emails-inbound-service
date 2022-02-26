import { AttachmentCommon, Email, SESEvent, ParsedMail } from '@types'

export const messageId = 'aaaaa-uuuuu-uuuuu-iiiii-ddddd'

export const uuid = 'uuuuu-uuuuu-iiiii-ddddd-22222'

export const accounts = {
  default: {
    inbound: {
      forwardTargets: ['one@email.address', 'two@email.address'],
    },
  },
  account1: {
    inbound: {},
    outbound: {},
  },
  account2: {
    outbound: {
      ccTargets: ['three@email.address', 'four@email.address'],
    },
  },
}

export const attachment = {
  checksum: 'jytgbni87ytgbnjkuy',
  cid: 'ytghji87ytgbhj',
  content: 'A big file',
  contentDisposition: 'attachment',
  contentId: 'j7ytgbnjhgfdert',
  contentType: 'text/plain',
  filename: 'big.file',
  headers: {
    author: 'Shakespeare',
  },
  related: false,
  size: 32_000,
} as unknown as AttachmentCommon

export const email: Email = {
  attachments: ['ytghji87ytgbhj'],
  bodyHtml:
    '<a href="http://www.gutenberg.org/files/8164/8164-h/8164-h.htm">http://www.gutenberg.org/files/8164/8164-h/8164-h.htm</a>\n',
  bodyText: 'http://www.gutenberg.org/files/8164/8164-h/8164-h.htm\n',
  ccAddress: undefined,
  fromAddress: {
    display: 'Person A <a@person.email>',
    value: [
      {
        address: 'a@person.email',
        name: 'Person A',
      },
    ],
  },
  headers: {},
  id: messageId,
  inReplyTo: undefined,
  recipients: ['e@mail.address'],
  references: [],
  replyToAddress: {
    display: '',
    value: [
      {
        address: '',
        name: '',
      },
    ],
  },
  subject: 'P G Wodehouse',
  toAddress: {
    display: 'Person B <b@person.email>',
    value: [
      {
        address: 'b@person.email',
        name: 'Person B',
      },
    ],
  },
}

export const parsedContents = {
  attachments: [attachment],
  headers: {},
  headerLines: [
    { key: 'mime-version', line: 'MIME-Version: 1.0' },
    { key: 'date', line: 'Date: Sun, 5 Aug 2018 19:58:58 -0500' },
    { key: 'message-id', line: `Message-ID: ${messageId}` },
    { key: 'subject', line: 'Subject: P G Wodehouse' },
    { key: 'from', line: 'From: Person A <a@person.email>' },
    { key: 'to', line: 'To: Person B <b@person.email>' },
    {
      key: 'content-type',
      line: 'Content-Type: multipart/alternative; boundary="00000000000054a3f30572b9c865"',
    },
  ],
  html: '<a href="http://www.gutenberg.org/files/8164/8164-h/8164-h.htm">http://www.gutenberg.org/files/8164/8164-h/8164-h.htm</a>\n',
  text: 'http://www.gutenberg.org/files/8164/8164-h/8164-h.htm\n',
  textAsHtml:
    '<p><a href="http://www.gutenberg.org/files/8164/8164-h/8164-h.htm">http://www.gutenberg.org/files/8164/8164-h/8164-h.htm</a></p>',
  subject: 'P G Wodehouse',
  date: '2018-08-06T00:58:58.000Z',
  to: {
    value: [{ address: 'b@person.email', name: 'Person B' }],
    display: 'Person B <b@person.email>',
  },
  from: {
    value: [{ address: 'a@person.email', name: 'Person A' }],
    display: 'Person A <a@person.email>',
  },
  messageId,
} as unknown as ParsedMail

export const request = {
  Records: [
    {
      eventSource: 'aws:ses',
      eventVersion: '1.0',
      ses: {
        mail: {
          commonHeaders: {
            date: 'Wed, 7 Oct 2015 12:34:56 -0700',
            from: ['Jane Doe <janedoe@example.com>'],
            messageId: '<0123456789example.com>',
            returnPath: 'janedoe@example.com',
            subject: 'Test Subject',
            to: ['johndoe@example.com'],
          },
          destination: ['johndoe@example.com'],
          headers: [
            {
              name: 'Return-Path',
              value: '<janedoe@example.com>',
            },
            {
              name: 'Received',
              value:
                'from mailer.example.com (mailer.example.com [203.0.113.1]) by inbound-smtp.us-east-1.amazonaws.com with SMTP id o3vrnil0e2ic28trm7dfhrc2v0cnbeccl4nbp0g1 for johndoe@example.com; Wed, 07 Oct 2015 12:34:56 +0000 (UTC)',
            },
            {
              name: 'DKIM-Signature',
              value:
                'v=1; a=rsa-sha256; c=relaxed/relaxed; d=example.com; s=example; h=mime-version:from:date:message-id:subject:to:content-type; bh=jX3F0bCAI7sIbkHyy3mLYO28ieDQz2R0P8HwQkklFj4=; b=sQwJ+LMe9RjkesGu+vqU56asvMhrLRRYrWCbVt6WJulueecwfEwRf9JVWgkBTKiL6m2hr70xDbPWDhtLdLO+jB3hzjVnXwK3pYIOHw3vxG6NtJ6o61XSUwjEsp9tdyxQjZf2HNYee873832l3K1EeSXKzxYk9Pwqcpi3dMC74ct9GukjIevf1H46hm1L2d9VYTL0LGZGHOAyMnHmEGB8ZExWbI+k6khpurTQQ4sp4PZPRlgHtnj3Zzv7nmpTo7dtPG5z5S9J+L+Ba7dixT0jn3HuhaJ9b+VThboo4YfsX9PMNhWWxGjVksSFOcGluPO7QutCPyoY4gbxtwkN9W69HA==',
            },
            {
              name: 'MIME-Version',
              value: '1.0',
            },
            {
              name: 'From',
              value: 'Jane Doe <janedoe@example.com>',
            },
            {
              name: 'Date',
              value: 'Wed, 7 Oct 2015 12:34:56 -0700',
            },
            {
              name: 'Message-ID',
              value: '<0123456789example.com>',
            },
            {
              name: 'Subject',
              value: 'Test Subject',
            },
            {
              name: 'To',
              value: 'johndoe@example.com',
            },
            {
              name: 'Content-Type',
              value: 'text/plain; charset=UTF-8',
            },
          ],
          headersTruncated: false,
          messageId,
          source: 'janedoe@example.com',
          timestamp: '1970-01-01T00:00:00.000Z',
        },
        receipt: {
          action: {
            functionArn: 'arn:aws:lambda:us-east-1:123456789012:function:Example',
            invocationType: 'Event',
            type: 'Lambda',
          },
          dkimVerdict: {
            status: 'PASS',
          },
          processingTimeMillis: 574,
          recipients: ['johndoe@example.com'],
          spamVerdict: {
            status: 'PASS',
          },
          spfVerdict: {
            status: 'PASS',
          },
          timestamp: '1970-01-01T00:00:00.000Z',
          virusVerdict: {
            status: 'PASS',
          },
        },
      },
    },
  ],
} as SESEvent
