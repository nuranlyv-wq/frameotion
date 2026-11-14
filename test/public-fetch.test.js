import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { fetchPublic, isPublicAddress, resolvePublicUrl } from '../src/import/public-fetch.js';
const lookup = async () => [{ address: '93.184.215.14', family: 4 }];
function transport(responses, onRequest = () => {}) {
  return (url, options, callback) => {
    onRequest(url, options);
    const req = new EventEmitter();
    req.end = () => queueMicrotask(() => {
      const spec = responses.shift();
      const response = Readable.from([Buffer.from(spec.body || '')]);
      response.statusCode = spec.status ?? 200;
      response.headers = { 'content-type': 'text/html', ...spec.headers };
      callback(response);
    });
    return req;
  };
}
test('SSRF: special IPv4, mapped IPv6, IPv6 local and ambiguous hosts are blocked', async () => {
  for (const ip of ['127.0.0.1', '169.254.169.254', '100.64.0.1', '198.18.0.1', '192.0.0.1', '0.0.0.0', '224.0.0.1', '::1', '::ffff:7f00:1', '::ffff:192.168.1.1', 'fe80::1', 'fc00::1', '2002:7f00:1::', '2001:db8::1']) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress('93.184.215.14'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  for (const url of ['http://2130706433', 'http://0x7f000001', 'http://[::ffff:127.0.0.1]', 'file:///etc/passwd', 'http://user:pw@example.com', 'http://localhost']) await assert.rejects(resolvePublicUrl(url, lookup));
  await assert.rejects(resolvePublicUrl('https://example.com', async () => [{ address: '93.184.215.14', family: 4 }, { address: '10.0.0.1', family: 4 }]));
});
test('connection uses pinned addresses, checks every redirect and rejects oversized data', async () => {
  let resolved = 0; const addresses = [];
  const body = await fetchPublic('https://example.com', { lookup: async () => { resolved++; return lookup(); },
    request: transport([{ body: '<html>hello</html>' }], (_url, opts) => opts.lookup('example.com', { all: true }, (_err, values) => addresses.push(values))) });
  assert.equal(resolved, 1); assert.equal(addresses[0][0].address, '93.184.215.14'); assert.match(body.body.toString(), /hello/);
  await assert.rejects(fetchPublic('https://example.com', { lookup, request: transport([{ status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } }]) }), /закрытую/);
  await assert.rejects(fetchPublic('https://example.com', { lookup, maxBytes: 4, request: transport([{ body: '12345' }]) }), /размер/);
  await assert.rejects(fetchPublic('https://example.com', { lookup, request: transport(Array.from({ length: 5 }, () => ({ status: 302, headers: { location: '/again' } }))) }), /перенаправлений/);
});
test('cancellation stops pending DNS resolution', async () => {
  const c = new AbortController(); const pending = fetchPublic('https://example.com', { signal: c.signal, lookup: async () => new Promise(() => {}) });
  c.abort(new Error('cancelled import')); await assert.rejects(pending, /cancelled import/);
});
