param(
    [Parameter(Mandatory=$true)]
    [string]$Path,
    [switch]$Vision,
    [ValidateSet("Ringkas", "Standar", "Mendalam")]
    [string]$Depth = "Standar",
    [ValidateSet("missing_only", "replace_all", "append")]
    [string]$NotesMode = "missing_only"
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$python = ".\.venv\Scripts\python.exe"
$argsList = @("scripts\preflight_cost.py", $Path, "--depth", $Depth, "--notes-mode", $NotesMode)
if ($Vision) { $argsList += "--vision" }
& $python @argsList
exit $LASTEXITCODE
