import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static';
import { startSignal } from './signaling-server';
import { auth } from './routes/auth';
import { keys } from './routes/keys';
import { getAuth } from '@hono/oidc-auth';

const app = new Hono()

app.route('/', auth);
app.route('/keys', keys);
app.use('*', async (c, next) => {
    const auth = await getAuth(c);
    if (!auth)
        return c.redirect('/login');

    await next();  
});
app.use('*', serveStatic({ root: './frontend/dist/' }));

const port = 3000
console.log(`Server is running on port ${port}`)

export const server = serve({
    fetch: app.fetch,
    port
})

startSignal(server);
