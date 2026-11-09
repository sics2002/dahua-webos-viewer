const Service = require('webos-service');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const APP_DIR = __dirname;
const GO2RTC_BIN = path.join(APP_DIR, 'go2rtc');
const GO2RTC_EXEC = '/tmp/io.github.sics2002.dahuaviewer.go2rtc';
const GO2RTC_CFG = path.join(APP_DIR, 'go2rtc.yaml');
const PROXY_JS   = path.join(APP_DIR, 'proxy.js');
const NODE_BIN   = '/usr/bin/node';

let go2rtcProc = null;
let proxyProc  = null;
let lastError = '';

function isRunning(name) {
  try {
    const out = execSync('ps -ef 2>/dev/null || ps aux 2>/dev/null', { timeout: 2000 }).toString();
    return out.includes(name);
  } catch (e) {
    return false;
  }
}

function startGo2rtc() {
  if (isRunning(GO2RTC_EXEC)) return;
  if (!fs.existsSync(GO2RTC_BIN)) return;
  try {
    fs.copyFileSync(GO2RTC_BIN, GO2RTC_EXEC);
    fs.chmodSync(GO2RTC_EXEC, '0755');
  } catch (e) { lastError = `prepare go2rtc: ${e.message}`; return; }
  go2rtcProc = spawn(GO2RTC_EXEC, ['-config', GO2RTC_CFG], {
    cwd: APP_DIR,
    detached: true,
    stdio: 'ignore'
  });
  go2rtcProc.unref();
  go2rtcProc.on('error', e => { lastError = `go2rtc: ${e.message}`; go2rtcProc = null; });
  go2rtcProc.on('exit', () => { go2rtcProc = null; });
}

function startProxy() {
  if (isRunning(PROXY_JS)) return;
  if (!fs.existsSync(PROXY_JS)) return;
  proxyProc = spawn(NODE_BIN, [PROXY_JS], {
    cwd: APP_DIR,
    detached: true,
    stdio: 'ignore'
  });
  proxyProc.unref();
  proxyProc.on('error', e => { lastError = `proxy: ${e.message}`; proxyProc = null; });
  proxyProc.on('exit', () => { proxyProc = null; });
}

function watchdog() {
  startGo2rtc();
  startProxy();
}

watchdog();
setInterval(watchdog, 8000);

const service = new Service('io.github.sics2002.dahuaviewer.backend');

service.register('start', (message) => {
  watchdog();
  message.respond({
    returnValue: true,
    go2rtc: isRunning(GO2RTC_EXEC),
    proxy: isRunning(PROXY_JS)
  });
});

service.register('status', (message) => {
  let directoryEntries;
  try { directoryEntries = fs.readdirSync(APP_DIR); } catch (e) { directoryEntries = e.message; }
  message.respond({
    returnValue: true,
    go2rtc: isRunning(GO2RTC_EXEC),
    proxy: isRunning(PROXY_JS),
    appDir: APP_DIR,
    binaryExists: fs.existsSync(GO2RTC_BIN),
    proxyExists: fs.existsSync(PROXY_JS),
    serviceDir: __dirname,
    directoryEntries,
    lastError
  });
});

service.register('restartProxy', (message) => {
  try {
    const lines = execSync('ps -ef', { timeout: 2000 }).toString().split('\n');
    lines.forEach(line => {
      if (!line.includes('/usr/bin/node') || !line.includes('io.github.sics2002.dahuaviewer.backend/proxy.js')) return;
      const match = line.match(/^\s*\S+\s+(\d+)\s+/);
      if (match) process.kill(Number(match[1]), 'SIGTERM');
    });
    setTimeout(startProxy, 700);
    message.respond({ returnValue: true });
  } catch (e) {
    message.respond({ returnValue: false, errorText: e.message });
  }
});

service.register('restartEngine', (message) => {
  try {
    const lines = execSync('ps -ef', { timeout: 2000 }).toString().split('\n');
    lines.forEach(line => {
      if (!line.includes('/tmp/io.github.sics2002.dahuaviewer.go2rtc')) return;
      const match = line.match(/^\s*\S+\s+(\d+)\s+/);
      if (match) process.kill(Number(match[1]), 'SIGTERM');
    });
    setTimeout(startGo2rtc, 700);
    message.respond({ returnValue: true });
  } catch (e) {
    message.respond({ returnValue: false, errorText: e.message });
  }
});
