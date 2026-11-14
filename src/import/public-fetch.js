import { abortable } from '../production/control.js';
import dns from 'node:dns/promises';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';

const blocked = new net.BlockList();
for (const [ip, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]]) blocked.addSubnet(ip, bits, 'ipv4');
const global6 = new net.BlockList();
global6.addSubnet('2000::', 3, 'ipv6');
const special6 = new net.BlockList();
for (const [ip, bits] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]]) special6.addSubnet(ip, bits, 'ipv6');

export function isPublicAddress(ip) {
  if (net.isIPv4(ip)) return !blocked.check(ip, 'ipv4');
  return net.isIPv6(ip) && global6.check(ip, 'ipv6') && !special6.check(ip, 'ipv6');
}

export async function resolvePublicUrl(input, lookup = dns.lookup) {
  const raw = String(input);
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) throw new Error('Разрешены только http(s) адреса');
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (url.username || url.password || !['http:', 'https:'].includes(url.protocol) ||
    /(^localhost$|\.localhost$|\.local$|\.internal$)/i.test(host)) throw new Error('Локальные адреса и учётные данные запрещены');
  const addresses = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error('Адрес указывает на закрытую или служебную сеть');
  return { url, addresses };
}

export function pinnedLookup(addresses) {
  return (_host, options, callback) => options?.all ? callback(null, addresses) : callback(null, addresses[0].address, addresses[0].family);
}

export async function fetchPublic(input, { signal, maxBytes = 3 * 1024 * 1024, timeoutMs = 15000,
  headers = {}, contentType = /html|xml/i, lookup = dns.lookup, request } = {}) {
  const deadline = AbortSignal.timeout(timeoutMs);
  const stop = signal ? AbortSignal.any([signal, deadline]) : deadline;
  let next = input;
  for (let hop = 0; hop < 5; hop++) {
    stop.throwIfAborted();
    const { url, addresses } = await abortable(resolvePublicUrl(next, lookup), stop);
    stop.throwIfAborted();
    const response = await new Promise((resolve, reject) => {
      const send = request || (url.protocol === 'https:' ? https.request : http.request);
      const req = send(url, { signal: stop, agent: false, lookup: pinnedLookup(addresses), headers: {
        accept: 'text/html,application/xhtml+xml', 'accept-encoding': 'identity', 'user-agent': 'KADR/1.0', ...headers,
      } }, resolve);
      req.on('error', reject);
      req.end();
    });
    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
      response.destroy();
      next = new URL(response.headers.location, url).toString();
      continue;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      response.destroy();
      throw new Error(`HTTP ${response.statusCode}`);
    }
    if (contentType && !contentType.test(response.headers['content-type'] || '')) {
      response.destroy();
      throw new Error('Неверный тип ресурса');
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response) {
      size += chunk.length;
      if (size > maxBytes) { response.destroy(); throw new Error('Ресурс превышает допустимый размер'); }
      chunks.push(chunk);
    }
    return { body: Buffer.concat(chunks), finalUrl: url.toString(), contentType: response.headers['content-type'] };
  }
  throw new Error('Слишком много перенаправлений');
}
