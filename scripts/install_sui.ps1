# scripts/install_sui.ps1
$ErrorActionPreference = "Stop"

$version = "v1.65.1"
$url = "https://github.com/MystenLabs/sui/releases/download/testnet-$version/sui-testnet-$version-windows-x86_64.tgz"
$archive = "sui.tgz"
$binDir = "bin"
$tempDir = "temp_sui_install"

Write-Host "[INFO] Downloading Sui Testnet $version CLI..."
Invoke-WebRequest -Uri $url -OutFile $archive

Write-Host "[INFO] Extracting..."
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

# Extract into temp dir
# Using cd to avoid tar -C issues if not supported
Push-Location $tempDir
tar -xf "../$archive"
$exe = Get-ChildItem -Recurse -Filter "sui.exe" | Select-Object -First 1
Pop-Location

# Ensure bin dir exists
if (!(Test-Path $binDir)) { New-Item -ItemType Directory -Force -Path $binDir | Out-Null }

if ($exe) {
    Move-Item -Path $exe.FullName -Destination "$binDir\sui.exe" -Force
    Write-Host "[OK] Sui CLI installed to $PWD\$binDir\sui.exe"
    
    # Cleanup
    Remove-Item $archive -Force
    Remove-Item $tempDir -Recurse -Force
} else {
    Write-Host "[ERROR] Could not find sui.exe in extracted files."
    Remove-Item $tempDir -Recurse -Force
    exit 1
}
