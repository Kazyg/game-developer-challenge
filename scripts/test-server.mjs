import { createServer, preview } from 'vite'
import { prepareCutouts } from './prepare-cutouts.mjs'
prepareCutouts()
const port = Number(process.env.TEST_PORT ?? (process.argv.includes('--preview') ? 4173 : 5173))
const settings = { host: '127.0.0.1', port, strictPort: true }
const token = process.env.TEST_SERVER_TOKEN
function installShutdown(instance) {
  if (!token) return
  // Installed before Vite's SPA/404 middleware. Only this runner knows the token;
  // a reused developer server does not recognize it and stays running.
  instance.middlewares.use(`/__test_shutdown/${token}`, (request, response) => {
    if (request.method !== 'POST') { response.statusCode = 405; response.end(); return }
    response.statusCode = 202
    response.end()
    const fallback = setTimeout(() => process.exit(0), 1000)
    fallback.unref()
    void close().finally(() => process.exit(0))
  })
}
const plugins = [{ name: 'test-server-lifecycle', configureServer: installShutdown, configurePreviewServer: installShutdown }]
const server = process.argv.includes('--preview')
  ? await preview({ plugins, preview: settings })
  : await createServer({ plugins, server: settings })
if ('listen' in server) await server.listen()
async function close() {
  if ('close' in server) await server.close()
  else await new Promise(resolve => server.httpServer.close(resolve))
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  await close()
  process.exit(0)
})
