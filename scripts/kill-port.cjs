#!/usr/bin/env node
// Cross-platform helper: free a TCP port before starting the dev server.
// Usage: node scripts/kill-port.cjs <port>
'use strict';

const { execSync } = require('child_process');
const net = require('net');
const PORT = parseInt(process.argv[2]) || 8118;

function getPids(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        `powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"`,
        { encoding: 'utf8' }
      );
      return [...new Set(out.trim().split(/\r?\n/).map(s => s.trim()).filter(s => /^\d+$/.test(s) && s !== '0'))];
    } else {
      const out = execSync(`lsof -ti:${port} 2>/dev/null || true`, { encoding: 'utf8', shell: true });
      return [...new Set(out.trim().split(/\r?\n/).filter(s => /^\d+$/.test(s)))];
    }
  } catch {
    return [];
  }
}

function killPid(pid) {
  try {
    if (process.platform === 'win32') {
      execSync(`powershell.exe -NoProfile -Command "Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue"`, { stdio: 'ignore' });
    } else {
      process.kill(parseInt(pid), 'SIGKILL');
    }
    return true;
  } catch {
    return false;
  }
}

// First check if port is free already
const probe = net.createServer();
probe.once('error', () => {
  // Port is in use — find and kill the owner
  const pids = getPids(PORT);
  if (pids.length === 0) {
    console.log(`[kill-port] Port ${PORT} busy but no killable PID found — proceeding anyway.`);
    process.exit(0);
  }
  let killed = 0;
  pids.forEach(pid => { if (killPid(pid)) { console.log(`[kill-port] Killed PID ${pid} (was holding :${PORT})`); killed++; } });
  if (killed > 0) {
    // Brief wait for the OS to release the socket
    setTimeout(() => process.exit(0), 500);
  } else {
    console.log(`[kill-port] Could not kill any process on :${PORT} — you may need to free it manually.`);
    process.exit(0); // don't block the dev start
  }
});
probe.once('listening', () => {
  probe.close();
  // Port was free — nothing to do
  process.exit(0);
});
probe.listen(PORT);
