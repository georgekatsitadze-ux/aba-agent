# Step4-Build.ps1 — clean install + build with logging (fixed ArgumentList)
$ErrorActionPreference = "Stop"

# Work in the script's folder
$App = $PSScriptRoot
if (-not $App) { $App = Split-Path -Parent $MyInvocation.MyCommand.Path }

# Log file
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$log = Join-Path $App ("step4-build-" + $timestamp + ".log")
Start-Transcript -Path $log -Append

function FreePort([int]$Port) {
  try {
    $pids = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
    if ($pids) {
      foreach ($pid in $pids) {
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        Write-Host "Killed PID $pid on port $Port"
      }
    } else {
      Write-Host "Nothing on port $Port"
    }
  } catch {
    Write-Warning ("Could not query/kill port {0}: {1}" -f $Port, $_)
  }
}

function Get-NpmPath {
  $npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
  if (-not $npm) { $npm = (Get-Command npm -ErrorAction SilentlyContinue).Source }
  if (-not $npm) { throw "npm not found in PATH" }
  return $npm
}

function Invoke-Npm([string[]]$ArgList) {
  $npm = Get-NpmPath
  # sanitize and join args to a single string for Start-Process
  $ArgList = $ArgList | Where-Object { $_ -ne $null -and $_ -ne "" }
  $argString = $ArgList -join " "
  if ([string]::IsNullOrWhiteSpace($argString)) {
    throw "Invoke-Npm called with empty args."
  }
  Write-Host "Running: $npm $argString"
  $p = Start-Process -FilePath $npm -ArgumentList $argString -WorkingDirectory $App -NoNewWindow -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "npm $argString failed ($($p.ExitCode))" }
}

Set-Location $App
Write-Host "Working directory: $App"

# Free preview port (vite preview uses 4173)
FreePort 4173

# Clean install
if (Test-Path (Join-Path $App "node_modules")) { Remove-Item -Recurse -Force (Join-Path $App "node_modules") }
if (Test-Path (Join-Path $App "package-lock.json")) { Remove-Item -Force (Join-Path $App "package-lock.json") }

# Diagnostics
try { & node -v } catch { Write-Warning "node not found in PATH" }
try { & (Get-NpmPath) --version } catch { Write-Warning "npm not found in PATH" }

# Install deps
Invoke-Npm @('install')
Invoke-Npm @('install','-D','@vitejs/plugin-react')

# Build (type-check + bundle via your package.json "build" script)
Invoke-Npm @('run','build')

Write-Host "`nBuild completed successfully." -ForegroundColor Green
Stop-Transcript

# Open the log and pause so the window doesn’t close
Start-Process notepad $log
Read-Host "Done. Log saved to $log. Press Enter to close..."
