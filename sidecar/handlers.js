async function readBody(req) {
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 16 * 1024 * 1024) throw new Error('request body too large');   // 16MB cap
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function send(res, status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(text);
}

function parseUrl(url) {
  const u = new URL(url, 'http://x');
  return { pathname: u.pathname, params: u.searchParams };
}

export async function handleRequest({ storage, root }, req, res) {
  const { pathname, params } = parseUrl(req.url);

  if (req.method === 'POST' && pathname === '/backups') {
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch { return send(res, 400, { error: 'invalid JSON body' }); }

    const { path, content, username } = body || {};
    if (typeof path !== 'string' || !path) return send(res, 400, { error: 'missing path' });
    if (typeof content !== 'string')        return send(res, 400, { error: 'missing content' });
    if (typeof username !== 'string' || !username) return send(res, 400, { error: 'missing username' });

    try {
      const result = await storage.writeBackup({ root, path, content, username });
      return send(res, 200, result);
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  }

  return send(res, 404, { error: 'not found' });
}
