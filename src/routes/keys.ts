import { getAuth } from "@hono/oidc-auth";
import { Hono } from "hono";
import { validator } from "hono/validator";

import * as cs from '../cert-storage'

export const keys = new Hono();

keys.get('/', async (c) => {
    const auth = await getAuth(c);
    if (!auth)
        return c.json({ error: "Not authorized" }, 403);

    return new Promise((resolve, _) => {
        cs.getAllCerts()
            .then(certs => resolve(c.json(certs)))
            .catch(err => resolve(c.json({ error: err }, 500)));
    });
})

keys.post('/',
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

        return new Promise((resolve, _) => {
            cs.addCert(cert)
                .then(() => resolve(c.text('Key added')))
                .catch(err => resolve(c.json({ error: err }, 500)));
        });
    }
);

keys.get('/:key',
    async (c) => {
        const auth = await getAuth(c);
        if (!auth)
            return c.json({ error: "Not authorized" }, 403);

        const key = c.req.param('key');

        return new Promise((resolve, _) => {
            cs.getCertByFP(key)
                .then(cert => {
                    if (cert != null) {
                        resolve(c.json({ user: cert.user }, 200));
                    } else {
                        resolve(c.json({ status: 'Not found' }, 404));
                    }
                })
                .catch(err => resolve(c.json({ error: err }, 500)));
        });
    }
);


keys.delete('/:key',
    async (c) => {
        const auth = await getAuth(c);
        if (!auth)
            return c.json({ error: "Not authorized" }, 403);

        const key = c.req.param('key');

        return new Promise((resolve, _) => {
            cs.removeCert(auth.email as string, key)
                .then(() => resolve(c.text('Key removed')))
                .catch(err => resolve(c.json({ error: err }, 500)));
        });
    }
);

// let keymap: any = {}
//
// keys.get('/:id', (c) => {
//     let key = c.req.param('id').toLowerCase();
//     if (key in keymap) {
//         if (keymap[key] < Date.now()) {
//             delete keymap[key];
//             c.status(403)
//             return c.json({ status: 'Key Expired' });
//         } else {
//             return c.json({ status: 'OK' });
//         }
//     } else {
//         c.status(404);
//         return c.json({ status: 'Not found' });
//     }
// });
//
// keys.post('/', async (c) => {
//     const body = await c.req.json();
//     if (!('key' in body && 'expires' in body)) {
//         c.status(400)
//         return c.json({ status: 'Bad Request' });
//     }
//     let key = body.key.toLowerCase();
//     let expires = body.expires;
//     if (key in keymap) {
//         c.status(400)
//         return c.json({ status: 'Key exists' });
//     } else {
//         keymap[key] = expires
//         return c.json({ status: 'OK' });
//     }
// });
//
// keys.delete('/:id', (c) => {
//     let key = c.req.param('id').toLowerCase();
//     if (key in keymap) {
//         delete keymap[key];
//         return c.json({ status: 'OK' });
//     } else {
//         c.status(404)
//         return c.json({ status: 'Not found' });
//     }
// });


