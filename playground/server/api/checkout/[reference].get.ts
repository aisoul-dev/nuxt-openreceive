export default defineEventHandler(async (event) => {
  const order = await findOrder(getRouterParam(event, 'reference') ?? '')
  if (!order || order.visitor !== getCookie(event, 'visitor')) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  return { reference: order.id, title: order.title, state: order.state }
})
