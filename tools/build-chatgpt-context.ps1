$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$OutDir = Join-Path $Root "_chatgpt_context"
$MaxCharsPerFile = 120000

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
    ".gitignore",
    ".editorconfig",
    ".prettierrc"
)

function Is-ExcludedPath {
    param([string]$FullName)

    $relative = Resolve-Path -LiteralPath $FullName -Relative
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

if (Test-Path $OutDir) {
    Remove-Item $OutDir -Recurse -Force
}

New-Item -ItemType Directory -Path $OutDir | Out-Null

$files = Get-ChildItem -Path $Root -Recurse -File |
    Where-Object { Is-AllowedFile $_ } |
    Sort-Object FullName

$manifestPath = Join-Path $OutDir "manifest.txt"
$manifest = @()
$manifest += "Weather Garden ChatGPT context"
$manifest += "Generated at: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")"
$manifest += "Root: $Root"
$manifest += ""
$manifest += "Files:"
$manifest += $files | ForEach-Object {
    $relativePath = Resolve-Path -LiteralPath $_.FullName -Relative
    " - " + $relativePath.TrimStart(".\")
}

Set-Content -Path $manifestPath -Value $manifest -Encoding UTF8

$chunkIndex = 1
$current = New-Object System.Text.StringBuilder

function Flush-Chunk {
    param(
        [System.Text.StringBuilder]$Builder,
        [int]$Index
    )

    if ($Builder.Length -eq 0) {
        return
    }

    $path = Join-Path $OutDir ("context-{0:D2}.txt" -f $Index)
    Set-Content -Path $path -Value $Builder.ToString() -Encoding UTF8
}

foreach ($file in $files) {
    $relativePath = Resolve-Path -LiteralPath $file.FullName -Relative
    $relativePath = $relativePath.TrimStart(".\")

    $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8

    $block = @"

===== FILE: $relativePath =====

$content

===== END FILE: $relativePath =====

"@

    if (($current.Length + $block.Length) -gt $MaxCharsPerFile -and $current.Length -gt 0) {
        Flush-Chunk -Builder $current -Index $chunkIndex
        $chunkIndex++
        $current = New-Object System.Text.StringBuilder
    }

    [void]$current.Append($block)
}

Flush-Chunk -Builder $current -Index $chunkIndex

Write-Host ""
Write-Host "Context generated in:" -ForegroundColor Green
Write-Host $OutDir
Write-Host ""
Write-Host "Files created:"
Get-ChildItem $OutDir | ForEach-Object {
    Write-Host (" - " + $_.Name)
}