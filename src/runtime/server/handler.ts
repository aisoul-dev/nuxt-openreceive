import { createRequestId, errorResponse, HttpError } from '@openreceive/http'
import { defineEventHandler, toWebRequest } from 'h3'
import { useOpenReceive } from './utils/openreceive'

let warned = false

// Every request under the prefix goes to OpenReceive's Web-standard handler.
// The H3 event travels as `native`, so `authorize` can read the app session.
export default defineEventHandler(async (event) => {
  let stack
  try {
    stack = await useOpenReceive()
  }
  catch (error) {
    if (!warned || import.meta.dev) {
      warned = true
      console.error(`[openreceive] ${error instanceof Error ? error.message : String(error)}`)
    }
    return errorResponse(
      new HttpError(503, 'WALLET_UNAVAILABLE', 'The payment service is not available. Please try again shortly.', {
        retryable: true,
        retryAfterSeconds: 5,
      }),
      createRequestId(),
    )
  }
  return stack.handler(toWebRequest(event), { native: event })
})
