# Restart the DSH web GUI (dev mode from the deepseek-harness checkout).
# Detached runner: waits, stops whatever listens on 3080, starts a fresh
# 'node --import tsx/esm apps/cli/src/bin.ts web', and verifies the port.
$ErrorActionPreference = 'Continue'
# Logs and state go next to this script (path derived at runtime, no literal).
$logDir = Join-Path $PSScriptRoot 'gui-restart-logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$outLog  = Join-Path $logDir 'gui-out.log'
$errLog  = Join-Path $logDir 'gui-err.log'
$stateLog = Join-Path $logDir 'state.log'
function Log([string]$msg) {
  Add-Content -Path $stateLog -Value ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg)
}

Log 'restart script started; waiting 25s before stopping old GUI'
Start-Sleep -Seconds 25

# Stop whatever currently listens on 3080 (the old GUI).
$held = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue
foreach ($c in $held) {
  Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
  Log ('stopped GUI PID ' + $c.OwningProcess)
}
# Clean up the pnpm launcher chain from the previous boot, if still alive.
foreach ($id in 6524, 24980) {
  if (Get-Process -Id $id -ErrorAction SilentlyContinue) {
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
    Log ('stopped launcher PID ' + $id)
  }
}
Start-Sleep -Seconds 3
$still = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue
if ($still) {
  foreach ($c in $still) {
    Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    Log ('force-stopped port holder PID ' + $c.OwningProcess)
  }
  Start-Sleep -Seconds 3
}

# Clear session-scoped vars so the fresh boot starts its own context.
$env:DSH_SESSION_ID = $null
$env:DSH_SESSION_JSONL = $null

Log 'starting new GUI'
$p = Start-Process -FilePath 'node' `
  -ArgumentList '--import', 'tsx/esm', 'apps/cli/src/bin.ts', 'web' `
  -WorkingDirectory 'D:\AI\deepseek-harness' `
  -WindowStyle Hidden `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -PassThru
Log ('new GUI PID ' + $p.Id)

$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 1
  $conn = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) { $ok = $true; Log ('port 3080 listening, PID ' + $conn.OwningProcess); break }
  if ($p.HasExited) { Log ('new GUI exited early, exit code ' + $p.ExitCode); break }
}
if (-not $ok) { Log 'TIMEOUT: port 3080 not listening within 60s; check gui-err.log' }
Log 'restart script done'
