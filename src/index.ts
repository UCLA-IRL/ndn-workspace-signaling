import 'dotenv/config'
import axios from 'axios';
import {randomBytes} from "crypto";
import { serve } from '@hono/node-server'
import { validator } from 'hono/validator';
import { Hono } from 'hono'
import { oidcAuthMiddleware, getAuth, revokeSession, processOAuthCallback } from '@hono/oidc-auth'
import * as cs from './cert-storage'
import { startSignal } from './signaling-server';

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
    cs.getAllCerts()
        .then(certs => resolve(c.json(certs)))
        .catch(err => resolve(c.json({error: err}, 500)));
  });
})

app.post('/keys',
    validator('json', (value, c) => {
            const key = value['key'];
            const expiration = value['expires'];

            if (key == undefined || key === '') {
                c.json({error: 'key is required'}, 400);
            } else if (expiration == undefined || expiration < Date.now() / 1000) {
                c.json({error: 'expires must be valid'}, 400);
            }

            return {key, expiration};
        }
    ),
    async (c) => {
        const auth = await getAuth(c);
        if (!auth)
            return c.json({error: "Not authorized"}, 403);

        if (auth.email === undefined)
            return c.json({error: "Internal server error"}, 500);

        const { key, expiration } = c.req.valid('json');
        const cert: cs.CertInfo = {
            user: auth.email as string,
            expiration: expiration,
            key: key,
        };

        return new Promise((resolve, reject) => {
            cs.addCert(cert)
                .then(() => resolve(c.text('Key added')))
                .catch(err => resolve(c.json({error: err}, 500)));
        });
    }
);

app.delete('/keys/:key',
    async (c) => {
        const auth = await getAuth(c);
        if (!auth)
            return c.json({error: "Not authorized"}, 403);

        const key = c.req.param('key');

        return new Promise((resolve, reject) => {
            cs.removeCert(auth.email as string, key)
                .then(() => resolve(c.text('Key removed')))
                .catch(err => resolve(c.json({error: err}, 500)));
        });
    }
);

app.post('/invite',
    validator('json', (value, c) => {
      const email = value['email'];

      if (email == undefined || email === '') {
        c.json({error: 'email is required'}, 400);
      }

      return { email };
    }),
    async (c) => {
      const auth = await getAuth(c);
      // @ts-ignore
      if (!auth || !process.env.ADMIN_USERS.split(',').map(e => e.trim()).includes(auth?.email))
        return c.json({error: "Not authorized"}, 403);

      const { email } = c.req.valid('json');

      const authUrl = process.env.OIDC_ISSUER + '/oauth/token';
      const audience = process.env.OIDC_ISSUER + '/api/v2/';
      const createUserUrl = process.env.OIDC_ISSUER + '/api/v2/users';
      const changePasswordUrl = process.env.OIDC_ISSUER + '/dbconnections/change_password';

      try {
        // Step 1: Obtain access token
        const tokenResponse = await axios.post(authUrl, new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: process.env.OIDC_CLIENT_ID,
            client_secret: process.env.OIDC_CLIENT_SECRET,
            audience: audience,
          } as unknown as undefined),
            {
            headers: { 'content-type': 'application/x-www-form-urlencoded' }
            }
        );

        const accessToken = tokenResponse.data.access_token;

        // Step 2: Create user
        const createUserResponse = await axios.post(
            createUserUrl,
            {
              email: email,
              email_verified: true,
              name: email,
              connection: process.env.AUTH0_CONNECTION_NAME,
              password: randomBytes(32).toString('hex') + "aA1!" /* comply with any password req */,
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
              },
            }
        );

        // Step 3: Initiate password change request, if user creation succeeded
        if (createUserResponse.status === 201) {
          const changePasswordResponse = await axios.post(
              changePasswordUrl,
              {
                client_id: process.env.OIDC_CLIENT_ID,
                connection: process.env.AUTH0_CONNECTION_NAME,
                email: email,
              },
              {
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'Authorization': `Bearer ${accessToken}`,
                },
              }
          );

          return c.text(changePasswordResponse.data)
        } else {
          return c.json(createUserResponse.data, 500);
        }
      } catch (err) {
        return c.json({error: err}, 500);
      }
  }
)

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

export const server = serve({
  fetch: app.fetch,
  port
})

startSignal(server);
