import { getAuth } from "@hono/oidc-auth";
import { Hono } from "hono";
import { validator } from "hono/validator";

import * as cs from '../cert-storage'

export const keys = new Hono();

keys.get('/keys', async (c) => {
    const auth = await getAuth(c);
    if (!auth)
        return c.json({ error: "Not authorized" }, 403);

    return new Promise((resolve, _) => {
        cs.getAllCerts()
            .then(certs => resolve(c.json(certs)))
            .catch(err => resolve(c.json({ error: err }, 500)));
    });
})

keys.get('/keys/:id', async (c) => {
    
});

keys.post('/keys',
    validator('json', (value, c) => {
        const key = value['key'];
        const expiration = value['expires'];

        if (key == undefined || key === '') {
            c.json({ error: 'key is required' }, 400);
        } else if (expiration == undefined || expiration < Date.now() / 1000) {
            c.json({ error: 'expires must be valid' }, 400);
        }

        return { key, expiration };
    }
    ),
    async (c) => {
        const auth = await getAuth(c);
        if (!auth)
            return c.json({ error: "Not authorized" }, 403);

        if (auth.email === undefined)
            return c.json({ error: "Internal server error" }, 500);

        const { key, expiration } = c.req.valid('json');
        const cert: cs.CertInfo = {
            user: auth.email as string,
            expiration: expiration,
            key: key,
        };

        return new Promise((resolve, reject) => {
            cs.addCert(cert)
                .then(() => resolve(c.text('Key added')))
                .catch(err => resolve(c.json({ error: err }, 500)));
        });
    }
);

