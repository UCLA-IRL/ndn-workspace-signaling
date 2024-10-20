import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { oidcAuthMiddleware, getAuth, revokeSession, processOAuthCallback } from '@hono/oidc-auth'
import * as kp from './key-provider'

const app = new Hono()

app.get('/', async (c) => {
  const auth = await getAuth(c);
  if (auth)
    return c.text(`Hello <${auth?.email}>!`);
  else
    return c.text("Hello World! You are not logged in.");
})

app.get('/keys', async (c) => {
  const auth = await getAuth(c);
  if (!auth)
    return c.json({error: "Not authorized"}, 403);

  return new Promise((resolve, reject) => {
    kp.readKeys()
        .then(keys => resolve(c.json(keys)))
        .catch(err => resolve(c.json({error: err}, 500)))
  });
})

app.get('/logout', async (c) => {
  await revokeSession(c)
  return c.text('You have been successfully logged out!')
})

app.get('/callback', async (c) => {
  return processOAuthCallback(c)
})

app.use('*', oidcAuthMiddleware())


const port = 3000
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port
})
