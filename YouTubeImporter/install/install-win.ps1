# Installs the YouTube Importer CEP extension for Adobe Premiere Pro on Windows.
# Run this once from PowerShell: powershell -ExecutionPolicy Bypass -File install\install-win.ps1

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourceDir = Split-Path -Parent $ScriptDir
$ExtensionId = "com.kvnlibrary.youtubeimporter"
$TargetDir = Join-Path $env:APPDATA "Adobe\CEP\extensions\$ExtensionId"

Write-Host "== YouTube Importer - instalacao (Windows) =="
Write-Host "Origem: $SourceDir"
Write-Host "Destino: $TargetDir"

if (Test-Path $TargetDir) { Remove-Item -Recurse -Force $TargetDir }
New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

Get-ChildItem -Path $SourceDir -Force -Exclude "install", ".git" | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $TargetDir -Recurse -Force
}

Write-Host "Extensao copiada."

Write-Host "Habilitando modo de debug do CEP (necessario para extensoes nao assinadas)..."
foreach ($version in 8, 9, 10, 11, 12) {
    $regPath = "HKCU:\Software\Adobe\CSXS.$version"
    if (-not (Test-Path $regPath)) { New-Item -Path $regPath -Force | Out-Null }
    Set-ItemProperty -Path $regPath -Name PlayerDebugMode -Value 1 -Type String
}

Write-Host ""
Write-Host "Verificando dependencias externas (yt-dlp e ffmpeg)..."
$ytdlp = Get-Command yt-dlp -ErrorAction SilentlyContinue
$ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue

if (-not $ytdlp) { Write-Host "  - yt-dlp NAO encontrado." } else { Write-Host "  - yt-dlp encontrado." }
if (-not $ffmpeg) { Write-Host "  - ffmpeg NAO encontrado." } else { Write-Host "  - ffmpeg encontrado." }

if (-not $ytdlp -or -not $ffmpeg) {
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        $answer = Read-Host "Deseja instalar as dependencias ausentes agora via winget? [s/N]"
        if ($answer -match '^[sS]$') {
            if (-not $ytdlp) { winget install --id yt-dlp.yt-dlp -e }
            if (-not $ffmpeg) { winget install --id Gyan.FFmpeg -e }
        } else {
            Write-Host "Voce pode instalar depois. Veja o README.md para instrucoes."
        }
    } else {
        Write-Host "winget nao encontrado. Veja o README.md para instrucoes de instalacao manual."
    }
}

Write-Host ""
Write-Host "Concluido. Reinicie o Adobe Premiere Pro e abra:"
Write-Host "  Window > Extensions > YouTube Importer"
