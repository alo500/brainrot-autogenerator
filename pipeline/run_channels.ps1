# Daily story-channel run: generate -> post -> pull stats.
# Scheduled by the "StoryChannels-Daily" task (see CHANNELS.md); safe to run by hand.
param([int]$PerAccount = 2)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$py = Join-Path $root ".venv\Scripts\python.exe"
$log = Join-Path $PSScriptRoot "output\channels\run.log"
New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null
Set-Location $PSScriptRoot

"=== $(Get-Date -Format s) ===" | Add-Content $log
& $py channel_stats.py *>&1 | Add-Content $log
& $py channel_gen.py all --count $PerAccount *>&1 | Add-Content $log
& $py channel_post.py *>&1 | Add-Content $log
