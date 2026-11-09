/**
 * DAHUA C4 SURVEILLANCE PROXY & STREAM MANAGER v6.0
 * Manages go2rtc ARM64 engine | Serves Playback recordings | TV Telemetry
 * Engineered by AIwolfie for RIOT
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const net = require('net');

let NVR_HOST = '', NVR_PORT = 443, USERNAME = '', PASSWORD = '', RTSP_PORT = 554, configured = false, configuring = false;

// Persistent HTTPS agent for NVR Dahua API queries
const agent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true,
    maxSockets: 5,
    keepAliveMsecs: 15000
});

let digestContext = null;

function getDigestAuth(uri, method = 'GET') {
    if (!digestContext) return null;
    const { realm, nonce, qop } = digestContext;
    const cnonce = crypto.randomBytes(4).toString('hex');
    const nc = '00000001';
    const ha1 = crypto.createHash('md5').update(`${USERNAME}:${realm}:${PASSWORD}`).digest('hex');
    const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');
    const resp = crypto.createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop || 'auth'}:${ha2}`).digest('hex');
    return `Digest username="${USERNAME}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${resp}", qop=${qop || 'auth'}, nc=${nc}, cnonce="${cnonce}"`;
}

function fetchDahua(pathUri, timeoutMs = 6000, authRetry = 0) {
    return new Promise((resolve, reject) => {
        const headers = { 'User-Agent': 'DahuaProxy/6.0' };
        if (digestContext) {
            headers['Authorization'] = getDigestAuth(pathUri);
        }

        const req = https.request({
            host: NVR_HOST,
            port: NVR_PORT,
            path: pathUri,
            method: 'GET',
            headers: headers,
            agent: agent,
            timeout: timeoutMs
        }, (res) => {
            if (res.statusCode === 401 && res.headers['www-authenticate']) {
                res.resume();
                if (authRetry > 0) return reject(new Error('NVR authentication failed'));
                const parts = {};
                res.headers['www-authenticate'].replace('Digest ', '').split(',').forEach(p => {
                    const idx = p.indexOf('=');
                    if (idx > 0) {
                        const k = p.slice(0, idx).trim();
                        const v = p.slice(idx + 1).trim().replace(/"/g, '');
                        parts[k] = v;
                    }
                });
                digestContext = parts;
                return fetchDahua(pathUri, timeoutMs, authRetry + 1).then(resolve).catch(reject);
            }

            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode}`));
            }

            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('timeout'));
        });
        req.end();
    });
}

function updatePlaybackStream(source, name = 'dahua_playback') {
    return new Promise((resolve, reject) => {
        const url = new URL('http://127.0.0.1:11984/api/streams');
        url.searchParams.set('name', name);
        url.searchParams.set('src', source);
        const req = http.request(url, { method: 'PATCH', timeout: 8000 }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => res.statusCode === 200 ? resolve() : reject(new Error('go2rtc HTTP ' + res.statusCode)));
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('go2rtc timeout')));
        req.end();
    });
}

function nvrIsReachable() {
    return new Promise(resolve => {
        const socket = net.connect({ host: NVR_HOST, port: RTSP_PORT });
        let done = false;
        const finish = ok => {
            if (done) return;
            done = true;
            socket.destroy();
            resolve(ok);
        };
        socket.setTimeout(1200);
        socket.on('connect', () => finish(true));
        socket.on('timeout', () => finish(false));
        socket.on('error', () => finish(false));
    });
}

// HTTP API Server
const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && origin !== 'null' && !origin.startsWith('file://')) {
        res.writeHead(403); return res.end();
    }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-cache, no-store');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        return res.end();
    }

    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/api/config' && req.method === 'POST') {
        if (configuring) { res.writeHead(409); return res.end(); }
        if (!(req.headers['content-type'] || '').startsWith('application/json')) {
            res.writeHead(415); return res.end();
        }
        configuring = true;
        try {
            const chunks = [];
            let size = 0;
            for await (const chunk of req) {
                size += chunk.length;
                if (size > 4096) { res.writeHead(413); return res.end(); }
                chunks.push(chunk);
            }
            const c = JSON.parse(Buffer.concat(chunks).toString());
            if (!c || typeof c.host !== 'string' || !/^[a-z0-9][a-z0-9.-]{0,252}$/i.test(c.host) ||
                typeof c.user !== 'string' || !c.user || typeof c.password !== 'string' || !c.password ||
                ![c.rtspPort, c.httpsPort].every(p => Number.isInteger(p) && p > 0 && p < 65536) ||
                !Number.isInteger(c.channels) || c.channels < 1 || c.channels > 16) {
                res.writeHead(400); return res.end();
            }
            const base = 'rtsp://' + encodeURIComponent(c.user) + ':' + encodeURIComponent(c.password)
                + '@' + c.host + ':' + c.rtspPort + '/cam/realmonitor?channel=';
            for (let i = 1; i <= c.channels; i++) {
                await updatePlaybackStream(base + i + '&subtype=0', 'cam' + i + '_hd');
                await updatePlaybackStream(base + i + '&subtype=1', 'cam' + i);
            }
            NVR_HOST = c.host; NVR_PORT = c.httpsPort; RTSP_PORT = c.rtspPort;
            USERNAME = c.user; PASSWORD = c.password; digestContext = null; configured = true;
            res.writeHead(204); return res.end();
        } catch (e) { res.writeHead(502); return res.end('Configuration unavailable'); }
        finally { configuring = false; }
    }
    if (req.method === 'GET' && url.pathname === '/api/engine') {
        const check = http.get('http://127.0.0.1:11984/api/streams', {timeout: 2000}, upstream => {
            upstream.resume();
            res.writeHead(upstream.statusCode === 200 ? 204 : 503); res.end();
        });
        check.on('timeout', () => check.destroy());
        check.on('error', () => { res.writeHead(503); res.end(); });
        return;
    }
    if (req.method === 'GET' && url.pathname === '/api/stream.mjpeg' && configured &&
        /^cam(?:[1-9]|1[0-6])$/.test(url.searchParams.get('src') || '')) {
        const upstream = http.get('http://127.0.0.1:11984/api/stream.mjpeg?src=' +
            encodeURIComponent(url.searchParams.get('src')), incoming => {
            res.writeHead(incoming.statusCode, {'Content-Type': incoming.headers['content-type'] || 'text/plain'});
            incoming.pipe(res);
        });
        res.on('close', () => upstream.destroy());
        upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
        return;
    }
    if (!configured && url.pathname !== '/api/health') { res.writeHead(503); return res.end(); }

    // 1. Playback Recordings Finder API (mediaFileFind)
    if (url.pathname === '/api/recordings') {
        const ch = parseInt(url.searchParams.get('channel') || '1', 10);
        const dateStr = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
        if (!Number.isInteger(ch) || ch < 1 || ch > 16 || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            res.writeHead(400); return res.end('Invalid channel or date');
        }
        let objId;
        try {
            const createRes = await fetchDahua('/cgi-bin/mediaFileFind.cgi?action=factory.create');
            objId = (createRes.toString().match(/result=(\d+)/) || [])[1];
            if (!objId) throw new Error('NVR did not create recording search');
            const sTime = `${dateStr}%2000:00:00`;
            const eTime = `${dateStr}%2023:59:59`;
            const findRes = await fetchDahua(`/cgi-bin/mediaFileFind.cgi?action=findFile&object=${objId}&condition.Channel=${ch}&condition.StartTime=${sTime}&condition.EndTime=${eTime}`);
            if (!findRes.toString().startsWith('OK')) throw new Error('NVR rejected recording search');
            const batches = [];
            for (let i = 0; i < 10; i++) {
                const batch = (await fetchDahua(`/cgi-bin/mediaFileFind.cgi?action=findNextFile&object=${objId}&count=50`)).toString();
                const found = parseInt((batch.match(/found=(\d+)/) || [])[1] || '0', 10);
                if (!found) break;
                batches.push(batch);
                if (found < 50) break;
            }
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end(batches.join('\n') || 'found=0');
        } catch (e) {
            console.error('Recordings find error:', e.message);
            res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('تعذر البحث في تسجيلات جهاز داهوا');
        } finally {
            if (objId) fetchDahua(`/cgi-bin/mediaFileFind.cgi?action=destroy&object=${objId}`).catch(() => {});
        }
    }

    if (url.pathname === '/api/playback/start') {
        const ch = parseInt(url.searchParams.get('channel') || '', 10);
        const start = url.searchParams.get('start') || '';
        const end = url.searchParams.get('end') || '';
        const validTime = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
        if (!Number.isInteger(ch) || ch < 1 || ch > 16 || !validTime.test(start) || !validTime.test(end) || end <= start) {
            res.writeHead(400); return res.end('Invalid playback range');
        }
        const rtsp = `rtsp://${encodeURIComponent(USERNAME)}:${encodeURIComponent(PASSWORD)}@${NVR_HOST}:${RTSP_PORT}/cam/playback?channel=${ch}&starttime=${start.replace(/[- :]/g, '_')}&endtime=${end.replace(/[- :]/g, '_')}`;
        try {
            await updatePlaybackStream(rtsp);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ stream: 'dahua_playback' }));
        } catch (e) {
            console.error('Playback start error:', e.message);
            res.writeHead(502); return res.end('Playback unavailable');
        }
    }

    // 2. Health check
    if (url.pathname === '/api/health') {
        const nvrReachable = configured && await nvrIsReachable();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'ok', engine: 'proxy', configured, nvrReachable }));
    }

    // NVR web interface for the TV settings pane. Keep it local to the TV;
    // the NVR still performs its own login and authorizes each setting.
    res.writeHead(404);
    res.end('Not found');
});

server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => socket.destroy());
    const origin = req.headers.origin;
    const url = new URL(req.url, 'http://localhost');
    const src = url.searchParams.get('src') || '';
    if (!configured || (origin && origin !== 'null' && !origin.startsWith('file://')) ||
        url.pathname !== '/api/ws' || !/^(?:cam(?:[1-9]|1[0-6])(?:_hd)?|dahua_playback)$/.test(src)) {
        socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return;
    }
    const headers = {...req.headers, host: '127.0.0.1:11984'};
    delete headers.origin;
    const upstream = http.request({
        hostname: '127.0.0.1', port: 11984, path: '/api/ws?src=' + encodeURIComponent(src),
        headers, timeout: 4000
    });
    upstream.on('upgrade', (reply, peer, pending) => {
        socket.write('HTTP/1.1 101 Switching Protocols\r\n' +
            Object.keys(reply.headers).map(k => k + ': ' + reply.headers[k]).join('\r\n') + '\r\n\r\n');
        if (pending.length) socket.write(pending);
        if (head.length) peer.write(head);
        peer.on('error', () => socket.destroy());
        peer.on('close', () => socket.destroy());
        socket.on('close', () => peer.destroy());
        peer.pipe(socket).pipe(peer);
    });
    socket.on('close', () => upstream.destroy());
    upstream.on('timeout', () => upstream.destroy());
    upstream.on('response', reply => { reply.resume(); socket.destroy(); });
    upstream.on('error', () => socket.destroy());
    upstream.end();
});

server.listen(11888, '127.0.0.1', () => {
    console.log('[Dahua Proxy v6.0] Running on port 11888');
});
