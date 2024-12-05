import 'dotenv/config'
import { Hono } from "hono";
import axios from 'axios';
import { randomBytes } from "crypto";
import { getAuth, revokeSession, processOAuthCallback, oidcAuthMiddleware } from '@hono/oidc-auth';
import { validator } from 'hono/validator';

export const auth = new Hono();

auth.post('/invite',
    validator('json', (value, c) => {
        const email = value['email'];

        if (email == undefined || email === '') {
            return c.json({ error: 'email is required' }, 400);
        }

        return { email };
    }),
    async (c) => {
        const auth = await getAuth(c);
        // @ts-ignore
        if (!auth || !process.env.ADMIN_USERS.split(',').map(e => e.trim()).includes(auth?.email))
            return c.json({ error: "Not authorized" }, 403);

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
            return c.json({ error: err }, 500);
        }
    }
)

auth.get('/logout', async (c) => {
    await revokeSession(c)
    return c.text('You have been successfully logged out!')
})

auth.get('/callback', async (c) => {
    return processOAuthCallback(c)
})

auth.use('*', oidcAuthMiddleware());

