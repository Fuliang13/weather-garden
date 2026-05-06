param(
    [string]$Root = (Split-Path -Parent $PSScriptRoot),
    [string]$OutDir = "",
    [int]$MaxCharsPerFile = 120000,
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

$Root = (Resolve-Path -LiteralPath $Root).Path

if ([string]::IsNullOrWhiteSpace($OutDir)) {
    $OutDir = Join-Path $Root "_chatgpt_context"
}

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$GeneratedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"

$ExcludedDirs = @(
    ".git",
    ".idea",
    ".wrangler",
    "node_modules",
    "_chatgpt_context",
    "dist",
    "coverage"
)

$ExcludedFiles = @(
    "package-lock.json",
    "tree.txt",
    "wrangler.toml.bak"
)

$SecretPatterns = @(
    ".env",
    ".env.*",
    ".dev.vars",
    ".dev.vars.*"
)

$AllowedExtensions = @(
    ".js",
    ".json",
    ".jsonc",
    ".toml",
    ".md",
    ".html",
    ".css",
    ".ps1",
    ".bat",
    ".gitignore",
    ".editorconfig",
    ".prettierrc"
)

function Get-RelativeProjectPath {
    param([string]$FullName)

    $relative = Resolve-Path -LiteralPath $FullName -Relative
    return ($relative -replace "^\.[\\/]", "")
}

function Is-ExcludedPath {
    param([string]$FullName)

    $relative = Get-RelativeProjectPath $FullName
    $parts = $relative -split "[\\/]+"

    foreach ($dir in $ExcludedDirs) {
        if ($parts -contains $dir) {
            return $true
        }
    }

    return $false
}

function Is-SecretFile {
    param([string]$Name)

    foreach ($pattern in $SecretPatterns) {
        if ($Name -like $pattern) {
            return $true
        }
    }

    return $false
}

function Is-AllowedFile {
    param([System.IO.FileInfo]$File)

    if ($ExcludedFiles -contains $File.Name) {
        return $false
    }

    if (Is-SecretFile $File.Name) {
        return $false
    }

    if (Is-ExcludedPath $File.FullName) {
        return $false
    }

    if ($AllowedExtensions -contains $File.Extension) {
        return $true
    }

    if ($AllowedExtensions -contains $File.Name) {
        return $true
    }

    return $false
}

function Get-GitOutput {
    param([string[]]$Arguments)

    try {
        $output = & git @Arguments 2>$null

        if ($LASTEXITCODE -ne 0) {
            return ""
        }

        return ($output -join "`n").Trim()
    } catch {
        return ""
    }
}

function Get-FileLineCount {
    param([string]$Path)

    $content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8

    if ([string]::IsNullOrEmpty($content)) {
        return 0
    }

    return (($content -split "`r?`n").Count)
}

function Flush-Chunk {
    param(
        [System.Text.StringBuilder]$Builder,
        [int]$Index,
        [string[]]$FilesInChunk
    )

    if ($Builder.Length -eq 0) {
        return $null
    }

    $chunkName = "context-$Timestamp-{0:D2}.txt" -f $Index
    $path = Join-Path $OutDir $chunkName
    $fileList = ($FilesInChunk | ForEach-Object { " - $_" }) -join "`r`n"

    $header = @"
Weather Garden ChatGPT context
Generated at: $GeneratedAt
Root: $Root
Chunk: $Index
Max chars per chunk: $MaxCharsPerFile

Files in this chunk:
$fileList

"@

    Set-Content -Path $path -Value ($header + $Builder.ToString()) -Encoding UTF8

    return [ordered]@{
        index = $Index
        file = $chunkName
        path = $path
        files = $FilesInChunk
        chars = $Builder.Length
    }
}

Push-Location $Root

try {
    if ($Clean -and (Test-Path $OutDir)) {
        Remove-Item $OutDir -Recurse -Force
    }

    if (!(Test-Path $OutDir)) {
        New-Item -ItemType Directory -Path $OutDir | Out-Null
    }

    $gitBranch = Get-GitOutput -Arguments @("rev-parse", "--abbrev-ref", "HEAD")
    $gitCommit = Get-GitOutput -Arguments @("rev-parse", "--short", "HEAD")
    $gitStatus = Get-GitOutput -Arguments @("status", "--short")

    $files = Get-ChildItem -Path $Root -Recurse -File |
        Where-Object { Is-AllowedFile $_ } |
        Sort-Object FullName

    $fileEntries = foreach ($file in $files) {
        $relativePath = Get-RelativeProjectPath $file.FullName
        $hash = Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256

        [ordered]@{
            path = $relativePath
            bytes = $file.Length
            lines = Get-FileLineCount $file.FullName
            sha256 = $hash.Hash.ToLowerInvariant()
        }
    }

    $chunkIndex = 1
    $current = New-Object System.Text.StringBuilder
    $currentFiles = @()
    $chunks = @()

    foreach ($file in $files) {
        $relativePath = Get-RelativeProjectPath $file.FullName
        $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8

        $block = @"

===== FILE: $relativePath =====

$content

===== END FILE: $relativePath =====

"@

        if (($current.Length + $block.Length) -gt $MaxCharsPerFile -and $current.Length -gt 0) {
            $chunk = Flush-Chunk -Builder $current -Index $chunkIndex -FilesInChunk $currentFiles

            if ($chunk) {
                $chunks += $chunk
            }

            $chunkIndex++
            $current = New-Object System.Text.StringBuilder
            $currentFiles = @()
        }

        [void]$current.Append($block)
        $currentFiles += $relativePath
    }

    $chunk = Flush-Chunk -Builder $current -Index $chunkIndex -FilesInChunk $currentFiles

    if ($chunk) {
        $chunks += $chunk
    }

    $manifestTxtName = "manifest-$Timestamp.txt"
    $manifestJsonName = "manifest-$Timestamp.json"
    $manifestTxtPath = Join-Path $OutDir $manifestTxtName
    $manifestJsonPath = Join-Path $OutDir $manifestJsonName

    $manifest = @()
    $manifest += "Weather Garden ChatGPT context"
    $manifest += "Generated at: $GeneratedAt"
    $manifest += "Root: $Root"
    $manifest += "Git branch: $gitBranch"
    $manifest += "Git commit: $gitCommit"
    $manifest += "Git status:"
    $manifest += if ($gitStatus) { $gitStatus } else { "clean or unavailable" }
    $manifest += ""
    $manifest += "Chunks:"
    $manifest += $chunks | ForEach-Object {
        " - $($_.file) ($($_.files.Count) files, $($_.chars) chars)"
    }
    $manifest += ""
    $manifest += "Files:"
    $manifest += $fileEntries | ForEach-Object {
        " - $($_.path) ($($_.bytes) bytes, $($_.lines) lines, sha256 $($_.sha256.Substring(0, 12)))"
    }

    Set-Content -Path $manifestTxtPath -Value $manifest -Encoding UTF8

    $manifestJson = [ordered]@{
        generatedAt = $GeneratedAt
        timestamp = $Timestamp
        root = $Root
        maxCharsPerFile = $MaxCharsPerFile
        git = [ordered]@{
            branch = $gitBranch
            commit = $gitCommit
            status = $gitStatus
        }
        chunks = $chunks
        files = $fileEntries
    }

    $manifestJson |
        ConvertTo-Json -Depth 8 |
        Set-Content -Path $manifestJsonPath -Encoding UTF8

    Write-Host ""
    Write-Host "Context generated in:" -ForegroundColor Green
    Write-Host $OutDir
    Write-Host ""
    Write-Host "Files created:"
    Get-ChildItem $OutDir -Filter "*$Timestamp*" | Sort-Object Name | ForEach-Object {
        Write-Host (" - " + $_.Name)
    }
} finally {
    Pop-Location
}