// A separate replica for the PostgreSQL refresh contract test.
import { Hono } from 'hono';
import { browserLoginRouter } from '../../auth/browser-logins/routes';
const app=new Hono().route('/v1/auth/browser-logins',browserLoginRouter);
const server=Bun.serve({port:0,fetch:app.fetch});
process.stdout.write(JSON.stringify({port:server.port})+'\n');
