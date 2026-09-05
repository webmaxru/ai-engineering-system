param(
  [string]$NorthstarPath = "..\northstar-orders-api-demo"
)

$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$lockPath = Join-Path $repositoryRoot "architecture-lock.json"
$lock = Get-Content -Raw $lockPath | ConvertFrom-Json
$guideName = Split-Path -Leaf $lock.guide.path

if ($lock.schema -ne "ai-engineering-system/architecture-lock/2") {
  throw "Unsupported architecture lock schema: $($lock.schema)"
}
if (
  [string]::IsNullOrWhiteSpace($lock.guide.path) -or
  $lock.guide.canonicalTextSha256 -notmatch "^[0-9a-f]{64}$"
) {
  throw "architecture-lock.json has an invalid guide identity"
}
if (
  $lock.auditedReference.repository -ne
    "webmaxru/northstar-orders-api-demo" -or
  $lock.auditedReference.commit -notmatch "^[0-9a-f]{40}$"
) {
  throw "architecture-lock.json has an invalid Northstar identity"
}

$referenceStates = @("accepted", "known-defective")
if ($lock.auditedReference.status -notin $referenceStates) {
  throw "Unsupported Northstar release status: $($lock.auditedReference.status)"
}
$conformanceStates = @("conformant", "blocked")
if ($lock.conformance.status -notin $conformanceStates) {
  throw "Unsupported architecture conformance status: $($lock.conformance.status)"
}
$blockingChanges = @($lock.conformance.blockingReferenceChanges)
if ($lock.conformance.status -eq "blocked" -and $blockingChanges.Count -eq 0) {
  throw "Blocked conformance must identify at least one reference change"
}
if (
  $lock.conformance.status -eq "conformant" -and
  (
    $lock.auditedReference.status -ne "accepted" -or
    $blockingChanges.Count -ne 0
  )
) {
  throw "Conformant architecture requires an accepted reference and no blockers"
}
if (
  $lock.auditedReference.status -eq "known-defective" -and
  $lock.conformance.status -ne "blocked"
) {
  throw "A known-defective reference must block architecture conformance"
}

$blockingStates = @(
  "pending-plan-approval",
  "pending-implementation",
  "pending-human-acceptance",
  "pending-hosted-evidence"
)
foreach ($blocker in $blockingChanges) {
  if (
    [string]::IsNullOrWhiteSpace($blocker.id) -or
    $blocker.state -notin $blockingStates
  ) {
    throw "architecture-lock.json contains an invalid blocking reference change"
  }
}

$authorityDocuments = @($lock.requiredAuthorityDocuments)
if (
  $authorityDocuments.Count -eq 0 -or
  ($authorityDocuments | Sort-Object -Unique).Count -ne
    $authorityDocuments.Count
) {
  throw "architecture-lock.json must contain unique authority documents"
}

function Get-CanonicalTextSha256([string]$Path) {
  $text = [System.IO.File]::ReadAllText($Path).Replace("`r`n", "`n")
  $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($text)
  $hash = [System.Security.Cryptography.SHA256]::HashData($bytes)
  return [Convert]::ToHexString($hash).ToLowerInvariant()
}

$guidePath = Join-Path $repositoryRoot ($lock.guide.path -replace "/", "\")
if (-not (Test-Path -LiteralPath $guidePath -PathType Leaf)) {
  throw "Missing architectural authority: $($lock.guide.path)"
}

$guideHash = Get-CanonicalTextSha256 $guidePath
if ($guideHash -ne $lock.guide.canonicalTextSha256) {
  throw "The learning guide changed. Re-audit both repositories and update architecture-lock.json."
}

foreach ($relativePath in $authorityDocuments) {
  $documentPath = Join-Path $repositoryRoot ($relativePath -replace "/", "\")
  if (-not (Test-Path -LiteralPath $documentPath -PathType Leaf)) {
    throw "Missing required architecture document: $relativePath"
  }

  $content = Get-Content -Raw $documentPath
  if (-not $content.Contains($guideName)) {
    throw "$relativePath does not identify the non-negotiable learning guide"
  }
}

$extensionsPath = Join-Path $repositoryRoot "docs\TECHNICAL-EXTENSIONS.md"
$extensions = Get-Content -Raw $extensionsPath
$headingIds = @(
  [regex]::Matches($extensions, "(?m)^## (EXT-\d{3}) - ") |
    ForEach-Object { $_.Groups[1].Value }
)
$tableIds = @(
  [regex]::Matches($extensions, "(?m)^\| (EXT-\d{3}) \|") |
    ForEach-Object { $_.Groups[1].Value }
)

if ($headingIds.Count -eq 0) {
  throw "No technical extensions are registered"
}
if (($headingIds | Sort-Object -Unique).Count -ne $headingIds.Count) {
  throw "Technical extension headings contain duplicate IDs"
}
$tableIdKey = (($tableIds | Sort-Object) -join ",")
$headingIdKey = (($headingIds | Sort-Object) -join ",")
if ($tableIdKey -ne $headingIdKey) {
  throw "Technical extension summary and detail IDs differ"
}

$registeredIds = [System.Collections.Generic.HashSet[string]]::new(
  [string[]]$headingIds
)
$coverage = @($lock.extensionCoverage)
if ($coverage.Count -eq 0) {
  throw "architecture-lock.json has no extension coverage"
}
$coverageIds = @($coverage | ForEach-Object { $_.id })
if (($coverageIds | Sort-Object -Unique).Count -ne $coverageIds.Count) {
  throw "architecture-lock.json extension coverage contains duplicate IDs"
}
$coverageIdKey = (($coverageIds | Sort-Object) -join ",")
if ($coverageIdKey -ne $headingIdKey) {
  throw "architecture-lock.json extension coverage and the extension register differ"
}

foreach ($entry in $coverage) {
  if ($entry.id -notmatch "^EXT-\d{3}$") {
    throw "Invalid extension coverage ID: $($entry.id)"
  }
  if (@($entry.mechanisms).Count -eq 0) {
    throw "$($entry.id) has no named mechanisms in architecture-lock.json"
  }
  if (@($entry.evidencePaths).Count -eq 0) {
    throw "$($entry.id) has no evidence paths in architecture-lock.json"
  }
  foreach ($relativePath in $entry.evidencePaths) {
    $evidencePath = Join-Path $repositoryRoot ($relativePath -replace "/", "\")
    if (-not (Test-Path -LiteralPath $evidencePath)) {
      throw "$($entry.id) evidence path does not exist: $relativePath"
    }
  }
}

$unknownReferences = @()
Get-ChildItem -Path $repositoryRoot -Recurse -Filter "*.md" -File |
  Where-Object { $_.FullName -notlike "*\templates\northstar\*" } |
  ForEach-Object {
    $relativePath = $_.FullName.Substring($repositoryRoot.Length + 1)
    $content = Get-Content -Raw $_.FullName
    foreach ($match in [regex]::Matches($content, "EXT-\d{3}")) {
      if (-not $registeredIds.Contains($match.Value)) {
        $unknownReferences += "$relativePath references $($match.Value)"
      }
    }
  }
if ($unknownReferences.Count -gt 0) {
  throw ($unknownReferences -join [Environment]::NewLine)
}

foreach ($activePath in @(".github\agents", ".github\hooks", ".github\workflows")) {
  if (Test-Path -LiteralPath (Join-Path $repositoryRoot $activePath)) {
    throw "The framework repository must not activate $activePath"
  }
}

$referenceLockPath = Join-Path $repositoryRoot "templates\northstar\reference-lock.json"
$referenceLock = Get-Content -Raw $referenceLockPath | ConvertFrom-Json
if ($referenceLock.sourceCommit -ne $lock.auditedReference.commit) {
  throw "architecture-lock.json and templates/northstar/reference-lock.json disagree on the audited Northstar commit"
}
if ($referenceLock.releaseStatus -ne $lock.auditedReference.status) {
  throw "architecture-lock.json and templates/northstar/reference-lock.json disagree on the Northstar release status"
}

& (Join-Path $PSScriptRoot "verify-reference.ps1") -NorthstarPath $NorthstarPath
if ($LASTEXITCODE -ne 0) {
  throw "Reference snapshot verification failed"
}

if ($lock.auditedReference.status -ne "accepted") {
  throw "The audited Northstar reference is $($lock.auditedReference.status), not accepted."
}
if ($lock.conformance.status -ne "conformant") {
  $blockers = @(
    $lock.conformance.blockingReferenceChanges |
      ForEach-Object { "$($_.id):$($_.state)" }
  )
  throw "Architecture conformance is $($lock.conformance.status): $($blockers -join ', ')"
}
if (@($lock.conformance.blockingReferenceChanges).Count -ne 0) {
  throw "Conformant architecture cannot retain blocking reference changes"
}

Write-Output "Architecture authority and $($headingIds.Count) technical extensions verified."
