param(
  [string]$NorthstarPath = "..\northstar-orders-api-demo"
)

$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$snapshotRoot = Join-Path $repositoryRoot "templates\northstar"
$lockPath = Join-Path $snapshotRoot "reference-lock.json"
$northstarRoot = (Resolve-Path $NorthstarPath).Path
$lock = Get-Content -Raw $lockPath | ConvertFrom-Json

function Get-CanonicalTextSha256([string]$Path) {
  $text = [System.IO.File]::ReadAllText($Path).Replace("`r`n", "`n")
  $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($text)
  $hash = [System.Security.Cryptography.SHA256]::HashData($bytes)
  return [Convert]::ToHexString($hash).ToLowerInvariant()
}

$actualCommit = (& git -C $northstarRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) {
  throw "Unable to resolve the Northstar commit at $northstarRoot"
}
if ($actualCommit -ne $lock.sourceCommit) {
  throw "Northstar HEAD is $actualCommit; snapshot expects $($lock.sourceCommit)"
}

$expectedTemplatePaths = @(
  $lock.files | ForEach-Object { $_.templatePath }
)

foreach ($entry in $lock.files) {
  $sourcePath = Join-Path $northstarRoot ($entry.sourcePath -replace "/", "\")
  $templatePath = Join-Path $snapshotRoot ($entry.templatePath -replace "/", "\")

  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Missing Northstar source file: $($entry.sourcePath)"
  }
  if (-not (Test-Path -LiteralPath $templatePath -PathType Leaf)) {
    throw "Missing template file: $($entry.templatePath)"
  }

  $sourceHash = Get-CanonicalTextSha256 $sourcePath
  $templateHash = Get-CanonicalTextSha256 $templatePath
  if ($sourceHash -ne $entry.sha256) {
    throw "Northstar source hash changed: $($entry.sourcePath)"
  }
  if ($templateHash -ne $entry.sha256) {
    throw "Template hash changed: $($entry.templatePath)"
  }
}

$actualTemplatePaths = @(
  Get-ChildItem -Path $snapshotRoot -Recurse -Force -File |
    ForEach-Object {
      $_.FullName.Substring($snapshotRoot.Length + 1).Replace("\", "/")
    } |
    Where-Object { $_ -notin @("README.md", "reference-lock.json") }
)

$unexpected = @($actualTemplatePaths | Where-Object { $_ -notin $expectedTemplatePaths })
$missing = @($expectedTemplatePaths | Where-Object { $_ -notin $actualTemplatePaths })
if ($unexpected.Count -gt 0 -or $missing.Count -gt 0) {
  throw "Snapshot file set differs from reference-lock.json"
}

$nestedAgentInstructions = @(
  Get-ChildItem -Path (Join-Path $repositoryRoot "templates") -Recurse -Force -Filter "AGENTS.md"
)
if ($nestedAgentInstructions.Count -gt 0) {
  throw "Nested AGENTS.md files would activate template instructions"
}

Write-Output "Reference snapshot matches Northstar $actualCommit ($($lock.files.Count) files)."
