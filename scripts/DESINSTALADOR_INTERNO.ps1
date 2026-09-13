<#
Rotina interna de desinstalação do Case Tracker.

É chamada por DESINSTALAR_CASE_TRACKER.vbs a partir de uma cópia temporária,
permitindo remover a própria pasta instalada. Backups existentes são preservados
em Documentos e os dados IndexedDB do navegador não são apagados.
#>
param(
    [string]$InstallPath = (Join-Path $env:LOCALAPPDATA 'CaseTracker')
)

$ErrorActionPreference = 'Stop'
$popupShell = New-Object -ComObject WScript.Shell
$documents = [Environment]::GetFolderPath('MyDocuments')
$backupArchiveRoot = Join-Path $documents 'CaseTracker Backups'
$backupArchivePath = $null

function Stop-CaseTrackerProcesses {
    try {
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
            $_.Name -ieq 'powershell.exe' -and
            $_.CommandLine -and
            ($_.CommandLine -match 'servidor-local\.ps1' -or $_.CommandLine -match 'CaseTracker')
        } | ForEach-Object {
            if ($_.ProcessId -ne $PID) {
                Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {}
}

function Get-DesktopFolders {
    $candidates = New-Object System.Collections.Generic.List[string]

    try {
        $desktopKnown = [Environment]::GetFolderPath('Desktop')
        if ($desktopKnown) { $candidates.Add($desktopKnown) }
    } catch {}

    foreach ($path in @(
        (Join-Path $env:USERPROFILE 'Desktop'),
        $(if ($env:OneDrive) { Join-Path $env:OneDrive 'Desktop' }),
        $(if ($env:OneDriveCommercial) { Join-Path $env:OneDriveCommercial 'Desktop' }),
        $(if ($env:OneDriveConsumer) { Join-Path $env:OneDriveConsumer 'Desktop' })
    )) {
        if ($path) { $candidates.Add($path) }
    }

    try {
        $reg = Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders' -ErrorAction Stop
        if ($reg.Desktop) {
            $expanded = [Environment]::ExpandEnvironmentVariables([string]$reg.Desktop)
            if ($expanded) { $candidates.Add($expanded) }
        }
    } catch {}

    return $candidates | Where-Object { $_ } | Select-Object -Unique
}

function Remove-CaseTrackerShortcuts {
    $names = @('Case Tracker.lnk', 'Desinstalar Case Tracker.lnk')
    foreach ($folder in (Get-DesktopFolders)) {
        foreach ($name in $names) {
            $shortcut = Join-Path $folder $name
            Remove-Item -LiteralPath $shortcut -Force -ErrorAction SilentlyContinue
        }
    }

    $startMenuFolder = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Case Tracker'
    if (Test-Path -LiteralPath $startMenuFolder) {
        Remove-Item -LiteralPath $startMenuFolder -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Preserve-Backups {
    param([string]$SourceRoot)

    $backupSource = Join-Path $SourceRoot 'Backups'
    if (-not (Test-Path -LiteralPath $backupSource -PathType Container)) { return $null }
    $items = @(Get-ChildItem -LiteralPath $backupSource -Force -Recurse -File -ErrorAction SilentlyContinue)
    if ($items.Count -eq 0) { return $null }

    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $destination = Join-Path $backupArchiveRoot ("Desinstalacao-$stamp")
    New-Item -ItemType Directory -Path $destination -Force | Out-Null

    # Robocopy provides safer recursive copies for files that may include binary attachments.
    $robo = Join-Path $env:SystemRoot 'System32\robocopy.exe'
    if (Test-Path -LiteralPath $robo) {
        $proc = Start-Process -FilePath $robo -ArgumentList @(
            ('"' + $backupSource + '"'),
            ('"' + $destination + '"'),
            '/E','/COPY:DAT','/DCOPY:T','/R:2','/W:1','/NFL','/NDL','/NJH','/NJS','/NP'
        ) -Wait -PassThru -WindowStyle Hidden
        if ($proc.ExitCode -ge 8) {
            throw "Nao foi possivel preservar os backups (codigo Robocopy $($proc.ExitCode)). A desinstalacao foi cancelada para evitar perda de arquivos."
        }
    } else {
        Copy-Item -Path (Join-Path $backupSource '*') -Destination $destination -Recurse -Force -ErrorAction Stop
    }
    return $destination
}

function Refresh-Explorer {
    try {
        $shellApp = New-Object -ComObject Shell.Application
        foreach ($window in @($shellApp.Windows())) {
            try { $window.Refresh() } catch {}
        }
    } catch {}
    try {
        $ie4uinit = Join-Path $env:SystemRoot 'System32\ie4uinit.exe'
        if (Test-Path -LiteralPath $ie4uinit) {
            Start-Process -FilePath $ie4uinit -ArgumentList '-show' -WindowStyle Hidden -ErrorAction SilentlyContinue | Out-Null
        }
    } catch {}
}

try {
    $message = @"
Deseja desinstalar o Case Tracker?

- Servidor e agente em segundo plano serao encerrados.
- Atalhos da Area de Trabalho e Menu Iniciar serao removidos.
- Os arquivos instalados em LocalAppData serao removidos.
- Os dados do navegador (cases, macros, anotacoes, queries e rascunhos) NAO serao apagados.
- Se existirem backups locais, uma copia sera preservada em Documentos\CaseTracker Backups.
"@
    $answer = $popupShell.Popup($message, 0, 'Desinstalar Case Tracker', 36)
    if ($answer -ne 6) { exit 0 }

    Stop-CaseTrackerProcesses
    Start-Sleep -Milliseconds 700

    if (Test-Path -LiteralPath $InstallPath -PathType Container) {
        $backupArchivePath = Preserve-Backups -SourceRoot $InstallPath
    }

    Remove-CaseTrackerShortcuts

    if (Test-Path -LiteralPath $InstallPath -PathType Container) {
        $removed = $false
        for ($attempt = 0; $attempt -lt 5; $attempt++) {
            try {
                Remove-Item -LiteralPath $InstallPath -Recurse -Force -ErrorAction Stop
                $removed = $true
                break
            } catch {
                Stop-CaseTrackerProcesses
                Start-Sleep -Milliseconds 600
            }
        }
        if (-not $removed -and (Test-Path -LiteralPath $InstallPath)) {
            throw 'Nao foi possivel remover completamente a pasta de instalacao. Feche qualquer janela que esteja usando arquivos do Case Tracker e tente novamente.'
        }
    }

    Refresh-Explorer

    $done = "Case Tracker desinstalado com sucesso.`r`n`r`nOs dados armazenados pelo navegador foram preservados."
    if ($backupArchivePath) {
        $done += "`r`n`r`nBackups preservados em:`r`n$backupArchivePath"
    }
    $done += "`r`n`r`nSe o OneDrive ainda mostrar um atalho fantasma por alguns segundos, pressione F5 na Area de Trabalho."
    $popupShell.Popup($done, 0, 'Case Tracker', 64) | Out-Null
}
catch {
    $details = $_.Exception.Message
    $popupShell.Popup("Falha ao desinstalar o Case Tracker.`r`n`r`nDetalhes: $details", 0, 'Case Tracker', 16) | Out-Null
    exit 1
}
