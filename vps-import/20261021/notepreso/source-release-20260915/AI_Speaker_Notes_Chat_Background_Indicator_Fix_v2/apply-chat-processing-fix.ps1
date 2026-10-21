$ErrorActionPreference = "Stop"
python "$PSScriptRoot\apply-chat-processing-fix.py"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
