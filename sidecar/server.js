import { createServer } from 'node:http';
import * as storageModule from './storage.js';
import { handleRequest } from './handlers.js';

export async function startServer({ root, host = '127.0.0.1', port = 3001 }) {
  const storage = {
    writeBackup: storageModule.writeBackup,
    listBackups: storageModule.listBackups,
    getBackup: storageModule.getBackup,
  };

  const server = createServer((req, res) => {
    handleRequest({ storage, root }, req, res).catch((err) => {
      console.error('sidecar request error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'internal error' }));
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  return { server, port: server.address().port };
}

// Allow `node server.js` to start with env-driven config.
if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.env.BACKUP_ROOT || '/data/backups';
  const port = parseInt(process.env.BACKUP_PORT || '3001', 10);
  startServer({ root, host: '127.0.0.1', port }).then(({ port }) => {
    console.log(`sidecar listening on 127.0.0.1:${port}, root=${root}`);
  }).catch((err) => {
    console.error('sidecar failed to start:', err);
    process.exit(1);
  });
}
