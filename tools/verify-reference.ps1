param(
  [string]$NorthstarPath = "..\northstar-orders-api-demo"
)

$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$snapshotRoot = Join-Path $repositoryRoot "templates\northstar"
$lockPath = Join-Path $snapshotRoot "reference-lock.json"
$northstarRoot = (Resolve-Path $NorthstarPath).Path
$lock = Get-Content -Raw $lockPath | ConvertFrom-Json

if ($lock.schema -ne "ai-engineering-system/reference-lock/1") {
  throw "Unsupported reference lock schema: $($lock.schema)"
}
if ($lock.sourceRepository -ne "webmaxru/northstar-orders-api-demo") {
  throw "reference-lock.json names an unexpected source repository"
}
if (
  [string]::IsNullOrWhiteSpace($lock.sourceBranch) -or
  $lock.sourceCommit -notmatch "^[0-9a-f]{40}$"
) {
  throw "reference-lock.json has an invalid source revision"
}
if ($lock.releaseStatus -notin @("accepted", "known-defective")) {
  throw "Unsupported reference release status: $($lock.releaseStatus)"
}
$knownDefects = @($lock.knownDefects)
if ($lock.validation.status -notin @("pass", "fail")) {
  throw "reference-lock.json has an invalid validation status"
}
if (
  $lock.validation.hostedAcceptance -notin
    @("verified", "not-verified", "failed-workflow-parse")
) {
  throw "reference-lock.json has an invalid hosted acceptance status"
}
if (
  $lock.releaseStatus -eq "accepted" -and
  (
    $knownDefects.Count -ne 0 -or
    $lock.validation.status -ne "pass" -or
    $lock.validation.hostedAcceptance -like "failed-*"
  )
) {
  throw "An accepted reference cannot retain defects or failed validation"
}
if (
  $lock.releaseStatus -eq "known-defective" -and
  $knownDefects.Count -eq 0
) {
  throw "A known-defective reference must identify at least one defect"
}
if (@($lock.files).Count -eq 0) {
  throw "reference-lock.json has no snapshot files"
}

function Get-CanonicalTextSha256([string]$Path) {
  $text = [System.IO.File]::ReadAllText($Path).Replace("`r`n", "`n")
  $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($text)
  $hash = [System.Security.Cryptography.SHA256]::HashData($bytes)
  return [Convert]::ToHexString($hash).ToLowerInvariant()
}

function Get-GitText(
  [string]$Repository,
  [string]$Revision,
  [string]$Path
) {
  $start = [System.Diagnostics.ProcessStartInfo]::new()
  $start.FileName = "git"
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $start.UseShellExecute = $false
  $start.StandardOutputEncoding = [System.Text.UTF8Encoding]::new($false)
  foreach ($argument in @("-C", $Repository, "show", "${Revision}:$Path")) {
    [void]$start.ArgumentList.Add($argument)
  }

  $process = [System.Diagnostics.Process]::Start($start)
  $content = $process.StandardOutput.ReadToEnd()
  $errorOutput = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    throw "Unable to read $Path from Northstar $Revision`: $errorOutput"
  }
  return $content
}

function Get-CanonicalTextSha256FromText([string]$Text) {
  $normalized = $Text.Replace("`r`n", "`n")
  $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($normalized)
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

$frameworkIdentity = "webmaxru/ai-engineering-system"
$readme = Get-GitText $northstarRoot $lock.sourceCommit "README.md"
$canonicalLinkPattern =
  "(?i)\[[^\]]+\]\(https://github\.com/webmaxru/ai-engineering-system\)"
$frameworkLinks = [regex]::Matches(
  $readme,
  $canonicalLinkPattern
)
if ($frameworkLinks.Count -ne 1) {
  throw "Northstar README.md must contain exactly one canonical framework Markdown link"
}
$readmeWithoutCanonicalLink = [regex]::new(
  $canonicalLinkPattern
).Replace($readme, "", 1)
if ($readmeWithoutCanonicalLink -match "(?i)webmaxru/ai-engineering-system") {
  throw "Northstar README.md contains an additional framework reference"
}

$frameworkReferences = @(
  & git -C $northstarRoot grep -i -n -F $frameworkIdentity $lock.sourceCommit --
)
if ($LASTEXITCODE -gt 1) {
  throw "Unable to inspect Northstar framework references"
}
$lockedPrefix = [regex]::Escape($lock.sourceCommit)
if (
  $frameworkReferences.Count -eq 0 -or
  @(
    $frameworkReferences |
      Where-Object { $_ -notmatch "^${lockedPrefix}:README\.md:\d+:" }
  ).Count -ne 0
) {
  throw "Northstar must contain framework repository identity in README.md only"
}

$expectedTemplatePaths = @(
  $lock.files | ForEach-Object { $_.templatePath }
)
if (($expectedTemplatePaths | Sort-Object -Unique).Count -ne $expectedTemplatePaths.Count) {
  throw "reference-lock.json contains duplicate template paths"
}

foreach ($entry in $lock.files) {
  if (
    [string]::IsNullOrWhiteSpace($entry.sourcePath) -or
    [string]::IsNullOrWhiteSpace($entry.templatePath) -or
    $entry.sha256 -notmatch "^[0-9a-f]{64}$"
  ) {
    throw "reference-lock.json contains an invalid file entry"
  }
  $templatePath = Join-Path $snapshotRoot ($entry.templatePath -replace "/", "\")

  if (-not (Test-Path -LiteralPath $templatePath -PathType Leaf)) {
    throw "Missing template file: $($entry.templatePath)"
  }

  $sourceText = Get-GitText $northstarRoot $lock.sourceCommit $entry.sourcePath
  $sourceHash = Get-CanonicalTextSha256FromText $sourceText
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
