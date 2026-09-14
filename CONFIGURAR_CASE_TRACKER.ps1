<#
Instalador/atualizador do Case Tracker.

Copia a aplicação para LocalAppData, recria atalhos e inicia o servidor oculto.
Não requer privilégios administrativos e preserva os dados do navegador.
#>
$ErrorActionPreference = 'Stop'

$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$destination = Join-Path $env:LOCALAPPDATA 'CaseTracker'
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'Case Tracker.lnk'
$wscriptPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
$powershellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$launcherPath = Join-Path $destination 'ABRIR_CASE_TRACKER.vbs'
$uninstallerPath = Join-Path $destination 'DESINSTALAR_CASE_TRACKER.vbs'
$startMenuFolder = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Case Tracker'
$serverPath = Join-Path $destination 'servidor-local.ps1'
$iconPath = Join-Path $destination 'icons\case-tracker.ico'
$backupRoot = Join-Path $destination 'Backups'
$logRoot = Join-Path $destination 'Logs'
$serverStdoutLog = Join-Path $logRoot 'server-startup-output.log'
$serverStderrLog = Join-Path $logRoot 'server-startup-error.log'
$popupShell = New-Object -ComObject WScript.Shell

# Arquivos úteis no repositório, mas desnecessários na instalação de runtime.
$copyExclusions = @('.git', '.github', '.gitignore', '.gitattributes', 'README.md', 'CHANGELOG.md', 'SECURITY.md')

function Copy-Tree {
    param(
        [Parameter(Mandatory = $true)][string]$From,
        [Parameter(Mandatory = $true)][string]$To
    )
    if (-not (Test-Path -LiteralPath $To -PathType Container)) {
        New-Item -ItemType Directory -Path $To -Force | Out-Null
    }
    Get-ChildItem -LiteralPath $From -Force | Where-Object {
        $copyExclusions -notcontains $_.Name
    } | ForEach-Object {
        $target = Join-Path $To $_.Name
        if ($_.PSIsContainer) { Copy-Tree -From $_.FullName -To $target }
        else { Copy-Item -LiteralPath $_.FullName -Destination $target -Force }
    }
}

function Test-CaseTrackerServer {
    try {
        $request = [System.Net.HttpWebRequest]::Create('http://127.0.0.1:8765/__case_tracker_ping')
        $request.Method = 'GET'
        $request.Proxy = $null
        $request.Timeout = 600
        $request.ReadWriteTimeout = 600
        $response = $request.GetResponse()
        try {
            $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
            return $reader.ReadToEnd() -eq 'CASE_TRACKER_OK'
        }
        finally { $response.Close() }
    }
    catch { return $false }
}

function Stop-CaseTrackerServers {
    try {
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
            $_.Name -ieq 'powershell.exe' -and
            $_.CommandLine -and
            $_.CommandLine -match 'servidor-local\.ps1'
        } | ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
    } catch {}
}

function Get-Port8765Diagnostic {
    try {
        $conn = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction Stop | Select-Object -First 1
        if ($null -eq $conn) { return $null }
        $proc = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $conn.OwningProcess) -ErrorAction SilentlyContinue
        if ($null -ne $proc) {
            return "Porta 8765 em uso pelo processo $($proc.Name) (PID $($conn.OwningProcess))."
        }
        return "Porta 8765 em uso pelo PID $($conn.OwningProcess)."
    } catch { return $null }
}

try {
    $sourceFull = [System.IO.Path]::GetFullPath($source).TrimEnd('\')
    $destinationFull = [System.IO.Path]::GetFullPath($destination).TrimEnd('\')

    # Encerra instancias anteriores, inclusive iniciadas de uma pasta extraida antiga.
    Stop-CaseTrackerServers
    for ($i = 0; $i -lt 20; $i++) {
        if (-not (Test-CaseTrackerServer)) { break }
        Start-Sleep -Milliseconds 150
        Stop-CaseTrackerServers
    }
    Start-Sleep -Milliseconds 250

    if (-not $sourceFull.Equals($destinationFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        Copy-Tree -From $source -To $destination
    }

    $required = @(
        'ABRIR_CASE_TRACKER.vbs',
        'DESINSTALAR_CASE_TRACKER.vbs',
        'scripts\DESINSTALADOR_INTERNO.ps1',
        'servidor-local.ps1',
        'index.html',
        'styles-v1.9.0-RC4.9.css',
        'theme-init.js',
        'sw.js',
        'manifest.webmanifest',
        'src\app.js',
        'src\attachments.js',
        'src\backup.js',
        'src\constants.js',
        'src\db.js',
        'src\domain.js',
        'src\notifications.js',
        'src\time.js',
        'src\validation.js',
        'icons\case-tracker.ico'
    )
    foreach ($relativePath in $required) {
        $fullPath = Join-Path $destination $relativePath
        if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
            throw "Arquivo essencial nao encontrado apos a copia: $relativePath"
        }
    }

    Get-ChildItem -LiteralPath $destination -File -ErrorAction SilentlyContinue | Where-Object {
        ($_.Name -like 'app-v*.bundle.js') -or
        ($_.Name -like 'app.bundle.js') -or
        ($_.Name -like 'styles-v*.css' -and $_.Name -ne 'styles-v1.9.0-RC4.9.css')
    } | Remove-Item -Force -ErrorAction SilentlyContinue

    @('INICIAR_SILENCIOSO.vbs', 'INSTALAR.vbs', 'INSTALAR.ps1', 'INICIAR.bat', 'DESINSTALAR_CASE_TRACKER.ps1') | ForEach-Object {
        $legacyPath = Join-Path $destination $_
        if (Test-Path -LiteralPath $legacyPath -PathType Leaf) {
            Remove-Item -LiteralPath $legacyPath -Force -ErrorAction SilentlyContinue
        }
    }

    @(
        $backupRoot,
        (Join-Path $backupRoot 'Automaticos'),
        (Join-Path $backupRoot 'Manuais'),
        (Join-Path $backupRoot 'Macros'),
        (Join-Path $backupRoot 'Anotacoes'),
        (Join-Path $backupRoot 'Anexos'),
        $logRoot
    ) | ForEach-Object {
        if (-not (Test-Path -LiteralPath $_ -PathType Container)) {
            New-Item -ItemType Directory -Path $_ -Force | Out-Null
        }
    }

    $shortcut = $popupShell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $wscriptPath
    $shortcut.Arguments = '"' + $launcherPath + '"'
    $shortcut.WorkingDirectory = $destination
    $shortcut.IconLocation = $iconPath + ',0'
    $shortcut.Description = 'Acompanhamento de Cases - Case Tracker'
    $shortcut.Save()
    if (-not (Test-Path -LiteralPath $shortcutPath -PathType Leaf)) {
        throw 'O atalho nao foi criado na Area de Trabalho.'
    }

    # Entradas no Menu Iniciar: aplicativo e desinstalador, sem poluir a Area de Trabalho.
    if (-not (Test-Path -LiteralPath $startMenuFolder -PathType Container)) {
        New-Item -ItemType Directory -Path $startMenuFolder -Force | Out-Null
    }
    $startAppShortcutPath = Join-Path $startMenuFolder 'Case Tracker.lnk'
    $startAppShortcut = $popupShell.CreateShortcut($startAppShortcutPath)
    $startAppShortcut.TargetPath = $wscriptPath
    $startAppShortcut.Arguments = '"' + $launcherPath + '"'
    $startAppShortcut.WorkingDirectory = $destination
    $startAppShortcut.IconLocation = $iconPath + ',0'
    $startAppShortcut.Description = 'Acompanhamento de Cases - Case Tracker'
    $startAppShortcut.Save()

    $uninstallShortcutPath = Join-Path $startMenuFolder 'Desinstalar Case Tracker.lnk'
    $uninstallShortcut = $popupShell.CreateShortcut($uninstallShortcutPath)
    $uninstallShortcut.TargetPath = $wscriptPath
    $uninstallShortcut.Arguments = '"' + $uninstallerPath + '"'
    $uninstallShortcut.WorkingDirectory = $destination
    $uninstallShortcut.IconLocation = $iconPath + ',0'
    $uninstallShortcut.Description = 'Desinstalar o Case Tracker com seguranca'
    $uninstallShortcut.Save()

    # Inicia o servidor/agente sem abrir o navegador. O primeiro minuto fica livre de tarefas
    # de manutencao para que o servidor possa responder ao teste de inicializacao imediatamente.
    Remove-Item -LiteralPath $serverStdoutLog -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $serverStderrLog -Force -ErrorAction SilentlyContinue
    $serverArgs = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $serverPath + '"'
    $serverProcess = Start-Process -FilePath $powershellPath -ArgumentList $serverArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput $serverStdoutLog -RedirectStandardError $serverStderrLog
    $serverReady = $false
    for ($i = 0; $i -lt 40; $i++) {
        if (Test-CaseTrackerServer) { $serverReady = $true; break }
        try { $serverProcess.Refresh() } catch {}
        if ($serverProcess.HasExited) { break }
        Start-Sleep -Milliseconds 200
    }
    if (-not $serverReady) {
        $extra = Get-Port8765Diagnostic
        if ($serverProcess.HasExited -and (Test-Path -LiteralPath $serverStderrLog -PathType Leaf)) {
            $erroServidor = (Get-Content -LiteralPath $serverStderrLog -Raw -ErrorAction SilentlyContinue).Trim()
            if (-not [string]::IsNullOrWhiteSpace($erroServidor)) {
                if ($erroServidor.Length -gt 700) { $erroServidor = $erroServidor.Substring(0, 700) + '...' }
                $extra = "Erro do servidor: $erroServidor"
            }
        }
        if ([string]::IsNullOrWhiteSpace($extra)) {
            $extra = "Consulte o arquivo Logs\server-startup-error.log na pasta instalada."
        }
        throw "O servidor local nao respondeu na porta 8765. $extra"
    }

    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'Case Tracker'
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.ShowInTaskbar = $true
    $form.ClientSize = New-Object System.Drawing.Size(430, 255)
    $form.BackColor = [System.Drawing.Color]::FromArgb(248, 248, 248)
    $form.Font = New-Object System.Drawing.Font('Segoe UI', 9)

    $labelAtalho = New-Object System.Windows.Forms.Label
    $labelAtalho.AutoSize = $false
    $labelAtalho.TextAlign = 'MiddleCenter'
    $labelAtalho.Size = New-Object System.Drawing.Size(390, 22)
    $labelAtalho.Location = New-Object System.Drawing.Point(20, 26)
    $labelAtalho.Text = 'Atalho criado na Area de Trabalho.'
    $form.Controls.Add($labelAtalho)

    $labelServidor = New-Object System.Windows.Forms.Label
    $labelServidor.AutoSize = $false
    $labelServidor.TextAlign = 'MiddleCenter'
    $labelServidor.Size = New-Object System.Drawing.Size(390, 22)
    $labelServidor.Location = New-Object System.Drawing.Point(20, 52)
    $labelServidor.Text = 'Servidor executado em segundo plano.'
    $form.Controls.Add($labelServidor)

    $menesPanel = New-Object System.Windows.Forms.FlowLayoutPanel
    $menesPanel.Size = New-Object System.Drawing.Size(390, 42)
    $menesPanel.Location = New-Object System.Drawing.Point(20, 92)
    $menesPanel.FlowDirection = 'LeftToRight'
    $menesPanel.WrapContents = $false
    $menesPanel.AutoSize = $false
    $menesPanel.BackColor = [System.Drawing.Color]::Transparent
    $form.Controls.Add($menesPanel)

    function Add-ColoredLetter {
        param([string]$Letter, [int]$R, [int]$G, [int]$B)
        $lbl = New-Object System.Windows.Forms.Label
        $lbl.AutoSize = $true
        $lbl.Margin = New-Object System.Windows.Forms.Padding(0)
        $lbl.Font = New-Object System.Drawing.Font('Segoe UI', 18, [System.Drawing.FontStyle]::Bold)
        $lbl.ForeColor = [System.Drawing.Color]::FromArgb($R, $G, $B)
        $lbl.Text = $Letter
        $menesPanel.Controls.Add($lbl)
    }

    Add-ColoredLetter 'M' 66 133 244
    Add-ColoredLetter 'e' 234 67 53
    Add-ColoredLetter 'n' 251 188 5
    Add-ColoredLetter 'e' 66 133 244
    Add-ColoredLetter 's' 52 168 83

    $form.Add_Shown({
        $totalWidth = 0
        foreach ($ctrl in $menesPanel.Controls) { $totalWidth += $ctrl.Width }
        $left = [Math]::Max(0, [int](($menesPanel.Width - $totalWidth) / 2))
        $menesPanel.Padding = New-Object System.Windows.Forms.Padding($left, 0, 0, 0)
    })

    $labelQuestion = New-Object System.Windows.Forms.Label
    $labelQuestion.AutoSize = $false
    $labelQuestion.TextAlign = 'MiddleCenter'
    $labelQuestion.Size = New-Object System.Drawing.Size(390, 22)
    $labelQuestion.Location = New-Object System.Drawing.Point(20, 150)
    $labelQuestion.Text = 'Deseja abrir o sistema agora?'
    $form.Controls.Add($labelQuestion)

    $buttonSim = New-Object System.Windows.Forms.Button
    $buttonSim.Text = 'Sim'
    $buttonSim.Size = New-Object System.Drawing.Size(74, 30)
    $buttonSim.Location = New-Object System.Drawing.Point(136, 195)
    $buttonSim.DialogResult = [System.Windows.Forms.DialogResult]::Yes
    $buttonSim.FlatStyle = 'System'
    $form.Controls.Add($buttonSim)

    $buttonNao = New-Object System.Windows.Forms.Button
    $buttonNao.Text = 'Nao'
    $buttonNao.Size = New-Object System.Drawing.Size(74, 30)
    $buttonNao.Location = New-Object System.Drawing.Point(220, 195)
    $buttonNao.DialogResult = [System.Windows.Forms.DialogResult]::No
    $buttonNao.FlatStyle = 'System'
    $form.Controls.Add($buttonNao)

    $form.AcceptButton = $buttonSim
    $form.CancelButton = $buttonNao
    $answer = $form.ShowDialog()
    if ($answer -eq [System.Windows.Forms.DialogResult]::Yes) {
        Start-Process -FilePath $wscriptPath -ArgumentList ('"' + $launcherPath + '"') -WorkingDirectory $destination
    }
}
catch {
    $details = $_.Exception.Message
    $popupShell.Popup("Falha ao instalar o Case Tracker.`r`n`r`nDetalhes: $details", 0, 'Case Tracker', 16) | Out-Null
    exit 1
}
