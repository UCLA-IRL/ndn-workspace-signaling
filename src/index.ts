import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import * as kp from './key-provider'
import {HTTPException} from "hono/http-exception";

const app = new Hono()

app.get('/', async (c) => {
  const newRow: kp.KeyInfo = {
    Sequence: 3,
    Expiration: Math.floor(Date.now() / 1000), // current timestamp in seconds
    Key: 'newKey'
  };

  await kp.insertKey(newRow)
      .then(() => console.log('Row inserted successfully'))
      .catch(err => console.error('Error inserting row:', err));

  return new Promise((resolve, reject) => {
    kp.readKeys()
        .then(keys => resolve(c.json(keys)))
        .catch(err => resolve(c.json({error: err})))
  });
})

const port = 3000
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port
})
