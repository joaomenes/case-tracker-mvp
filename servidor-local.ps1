<#
Case Tracker - servidor local e agente de tarefas.

Responsabilidades principais:
- servir somente os arquivos da aplicação em loopback (127.0.0.1/localhost);
- manter endpoints internos protegidos por token de sessão;
- executar backups/retenção e notificações do Windows em segundo plano;
- nunca expor o listener para interfaces de rede externas.
#>
param(
    [int]$Port = 8765,
    [switch]$OpenBrowser
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Url = "http://localhost:$Port/?v=1.9.0-RC4.7"
$SessionToken = [Guid]::NewGuid().ToString('N')
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$running = $true

$BackupRoot = Join-Path $Root 'Backups'
$AutoBackupDir = Join-Path $BackupRoot 'Automaticos'
$ManualBackupDir = Join-Path $BackupRoot 'Manuais'
$MacroBackupDir = Join-Path $BackupRoot 'Macros'
$AnnotationBackupDir = Join-Path $BackupRoot 'Anotacoes'
$AttachmentBackupDir = Join-Path $BackupRoot 'Anexos'
$DataDir = Join-Path $Root 'DadosInternos'
$CurrentStateFile = Join-Path $DataDir 'estado-atual.json'
$CurrentMacrosFile = Join-Path $DataDir 'macros-atual.json'
$CurrentAnnotationsFile = Join-Path $DataDir 'anotacoes-atual.json'
$AutoBackupFile = Join-Path $AutoBackupDir 'backup-automatico.json'
$MacroHistoryFile = Join-Path $MacroBackupDir 'macros-historico.json'
$LegacyMacroBackupFile = Join-Path $MacroBackupDir 'macros-automatico.json'
$PendingMacroChangesFile = Join-Path $DataDir 'macros-pendentes.json'
$AnnotationHistoryFile = Join-Path $AnnotationBackupDir 'anotacoes-historico.json'
$PendingAnnotationChangesFile = Join-Path $DataDir 'anotacoes-pendentes.json'
$NotificationStateFile = Join-Path $DataDir 'notificacoes-bg.json'
$AutoBackupHours = 48
$MacroBackupDays = 5
$AnnotationBackupDays = 5
$ManualBackupRetentionDays = 30
$AttachmentBackupMaxCopies = 3
$IncompleteAttachmentBackupRetentionHours = 24
$MaxBodyChars = 48 * 1024 * 1024
$lastMaintenance = Get-Date # evita bloquear o primeiro ping com manutencao/backups/notificacoes
$StateReady = Test-Path -LiteralPath $CurrentStateFile -PathType Leaf
$AgentAvailable = $false
$LastAgentNotification = $null
try {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
    Add-Type -AssemblyName System.Drawing -ErrorAction Stop
    $AgentAvailable = $true
} catch {
    $AgentAvailable = $false
}

@($BackupRoot, $AutoBackupDir, $ManualBackupDir, $MacroBackupDir, $AnnotationBackupDir, $AttachmentBackupDir, $DataDir) | ForEach-Object {
    if (-not (Test-Path -LiteralPath $_ -PathType Container)) {
        New-Item -ItemType Directory -Path $_ -Force | Out-Null
    }
}

# -----------------------------------------------------------------------------
# HTTP local e utilitários de arquivo
# -----------------------------------------------------------------------------
function Open-DefaultBrowser([string]$TargetUrl) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $TargetUrl
    $psi.UseShellExecute = $true
    [System.Diagnostics.Process]::Start($psi) | Out-Null
}

function Get-MimeType([string]$Path) {
    switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        '.html' { 'text/html; charset=utf-8' }
        '.css' { 'text/css; charset=utf-8' }
        '.js' { 'text/javascript; charset=utf-8' }
        '.json' { 'application/json; charset=utf-8' }
        '.webmanifest' { 'application/manifest+json; charset=utf-8' }
        '.png' { 'image/png' }
        '.svg' { 'image/svg+xml' }
        '.ico' { 'image/x-icon' }
        default { 'application/octet-stream' }
    }
}

function Send-Response($Stream, [int]$StatusCode, [string]$StatusText, [byte[]]$Body, [string]$ContentType) {
    $header = "HTTP/1.1 $StatusCode $StatusText`r`n" +
              "Content-Type: $ContentType`r`n" +
              "Content-Length: $($Body.Length)`r`n" +
              "Cache-Control: no-cache, no-store, must-revalidate`r`n" +
              "Pragma: no-cache`r`n" +
              "X-Content-Type-Options: nosniff`r`n" +
              "Referrer-Policy: no-referrer`r`n" +
              "Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'`r`n" +
              "Connection: close`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($Body.Length -gt 0) { $Stream.Write($Body, 0, $Body.Length) }
    $Stream.Flush()
}

function Send-Text($Stream, [int]$StatusCode, [string]$StatusText, [string]$Text, [string]$ContentType = 'text/plain; charset=utf-8') {
    $body = [System.Text.Encoding]::UTF8.GetBytes($Text)
    Send-Response $Stream $StatusCode $StatusText $body $ContentType
}

function Test-ExistingCaseTracker {
    try {
        $request = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$Port/__case_tracker_ping")
        $request.Method = 'GET'
        $request.Timeout = 1000
        $request.ReadWriteTimeout = 1000
        $response = $request.GetResponse()
        try {
            $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
            return $reader.ReadToEnd() -eq 'CASE_TRACKER_OK'
        }
        finally { $response.Close() }
    }
    catch { return $false }
}

function Get-BodyText($Reader, $Headers) {
    if (-not $Headers.ContainsKey('content-length')) { return '' }
    $length = 0
    if (-not [int]::TryParse($Headers['content-length'], [ref]$length)) { throw 'Content-Length invalido.' }
    if ($length -lt 0 -or $length -gt $MaxBodyChars) { throw 'Corpo da requisicao excede o limite permitido.' }
    if ($length -eq 0) { return '' }

    $buffer = [char[]]::new($length)
    $offset = 0
    while ($offset -lt $length) {
        $read = $Reader.ReadBlock($buffer, $offset, $length - $offset)
        if ($read -le 0) { break }
        $offset += $read
    }
    if ($offset -le 0) { return '' }
    return -join $buffer[0..($offset - 1)]
}

function Decode-Base64Utf8([string]$Base64) {
    if ([string]::IsNullOrWhiteSpace($Base64)) { throw 'Conteudo vazio.' }
    $bytes = [Convert]::FromBase64String($Base64)
    return [System.Text.Encoding]::UTF8.GetString($bytes)
}

function Save-Utf8NoBom([string]$Path, [string]$Text) {
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Text, $utf8)
}

function Read-JsonFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    try {
        return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json)
    }
    catch {
        return $null
    }
}

# -----------------------------------------------------------------------------
# Histórico acumulativo de macros e anotações
# -----------------------------------------------------------------------------
function Get-MacroArray($Snapshot) {
    if ($null -eq $Snapshot -or $null -eq $Snapshot.modelosMensagem) { return @() }
    return @($Snapshot.modelosMensagem)
}

function Get-MacroChanges($OldSnapshot, $NewSnapshot) {
    $oldMap = @{}
    $newMap = @{}
    foreach ($item in (Get-MacroArray $OldSnapshot)) {
        if ($null -ne $item.id) { $oldMap[[string]$item.id] = $item }
    }
    foreach ($item in (Get-MacroArray $NewSnapshot)) {
        if ($null -ne $item.id) { $newMap[[string]$item.id] = $item }
    }

    $changes = New-Object System.Collections.ArrayList
    $nowIso = (Get-Date).ToString('o')

    foreach ($id in $newMap.Keys) {
        $newItem = $newMap[$id]
        if (-not $oldMap.ContainsKey($id)) {
            [void]$changes.Add([ordered]@{
                ocorridoEm = if ($newItem.atualizadoEm) { [string]$newItem.atualizadoEm } else { $nowIso }
                acao = 'CRIADA'
                macroId = $id
                nome = [string]$newItem.nome
                anterior = $null
                atual = $newItem
            })
            continue
        }

        $oldItem = $oldMap[$id]
        $oldJson = $oldItem | ConvertTo-Json -Depth 20 -Compress
        $newJson = $newItem | ConvertTo-Json -Depth 20 -Compress
        if ($oldJson -ne $newJson) {
            $oldActive = $oldItem.ativo -ne $false
            $newActive = $newItem.ativo -ne $false
            $oldDeleted = -not [string]::IsNullOrWhiteSpace([string]$oldItem.excluidoEm)
            $newDeleted = -not [string]::IsNullOrWhiteSpace([string]$newItem.excluidoEm)
            $action = if (-not $oldDeleted -and $newDeleted) { 'MOVIDA_LIXEIRA' } elseif ($oldDeleted -and -not $newDeleted) { 'RESTAURADA_LIXEIRA' } elseif ($oldActive -and -not $newActive) { 'EXCLUIDA' } elseif (-not $oldActive -and $newActive) { 'REATIVADA' } else { 'EDITADA' }
            [void]$changes.Add([ordered]@{
                ocorridoEm = if ($newItem.atualizadoEm) { [string]$newItem.atualizadoEm } else { $nowIso }
                acao = $action
                macroId = $id
                nome = [string]$newItem.nome
                anterior = $oldItem
                atual = $newItem
            })
        }
    }

    foreach ($id in $oldMap.Keys) {
        if (-not $newMap.ContainsKey($id)) {
            $oldItem = $oldMap[$id]
            [void]$changes.Add([ordered]@{
                ocorridoEm = $nowIso
                acao = 'EXCLUIDA'
                macroId = $id
                nome = [string]$oldItem.nome
                anterior = $oldItem
                atual = $null
            })
        }
    }

    return @($changes)
}

function Register-PendingMacroChanges($OldSnapshot, $NewSnapshot) {
    if ($null -eq $OldSnapshot) { return }
    $changes = @(Get-MacroChanges $OldSnapshot $NewSnapshot)
    if ($changes.Count -eq 0) { return }

    $pending = Read-JsonFile $PendingMacroChangesFile
    $nowIso = (Get-Date).ToString('o')
    if ($null -eq $pending) {
        $pending = [ordered]@{
            versao = 1
            primeiraAlteracaoEm = $nowIso
            ultimaAlteracaoEm = $nowIso
            alteracoes = @()
        }
    }

    $existing = @($pending.alteracoes)
    $pending.alteracoes = @($existing + $changes)
    $pending.ultimaAlteracaoEm = $nowIso
    Save-Utf8NoBom $PendingMacroChangesFile ($pending | ConvertTo-Json -Depth 50)
}

function Initialize-MacroHistory {
    if (Test-Path -LiteralPath $MacroHistoryFile -PathType Leaf) { return }

    $nowIso = (Get-Date).ToString('o')
    $current = Read-JsonFile $CurrentMacrosFile
    $legacy = Read-JsonFile $LegacyMacroBackupFile
    $baseSnapshot = if ($null -ne $current) { $current } elseif ($null -ne $legacy) { $legacy } else { $null }
    $currentMacros = if ($null -ne $baseSnapshot) { @(Get-MacroArray $baseSnapshot) } else { @() }

    $history = [ordered]@{
        versao = 1
        tipo = 'historico-acumulativo-macros'
        criadoEm = $nowIso
        ultimaConsolidacaoEm = $null
        macrosAtuais = $currentMacros
        historicoAlteracoes = @()
        origemMigracao = if ($null -ne $legacy) { 'macros-automatico.json' } else { $null }
        migradoEm = if ($null -ne $legacy) { $nowIso } else { $null }
        snapshotLegado = if ($null -ne $legacy) { $legacy } else { $null }
    }

    Save-Utf8NoBom $MacroHistoryFile ($history | ConvertTo-Json -Depth 50)
}

function Invoke-MacroHistoryBackup {
    Initialize-MacroHistory
    $pending = Read-JsonFile $PendingMacroChangesFile
    if ($null -eq $pending -or @($pending.alteracoes).Count -eq 0) { return }

    $firstChange = [DateTime]::MinValue
    if (-not [DateTime]::TryParse([string]$pending.primeiraAlteracaoEm, [ref]$firstChange)) { return }
    $age = (Get-Date) - $firstChange
    if ($age.TotalDays -lt $MacroBackupDays) { return }

    $history = Read-JsonFile $MacroHistoryFile
    if ($null -eq $history) {
        Remove-Item -LiteralPath $MacroHistoryFile -Force -ErrorAction SilentlyContinue
        Initialize-MacroHistory
        $history = Read-JsonFile $MacroHistoryFile
    }
    if ($null -eq $history) { throw 'Nao foi possivel inicializar o historico de macros.' }

    $existing = @($history.historicoAlteracoes)
    $history.historicoAlteracoes = @($existing + @($pending.alteracoes))
    $current = Read-JsonFile $CurrentMacrosFile
    $history.macrosAtuais = if ($null -ne $current) { @(Get-MacroArray $current) } else { @() }
    $history.ultimaConsolidacaoEm = (Get-Date).ToString('o')
    Save-Utf8NoBom $MacroHistoryFile ($history | ConvertTo-Json -Depth 50)
    Remove-Item -LiteralPath $PendingMacroChangesFile -Force -ErrorAction SilentlyContinue
}


function Get-AnnotationArray($Snapshot) {
    if ($null -eq $Snapshot -or $null -eq $Snapshot.anotacoes) { return @() }
    return @($Snapshot.anotacoes)
}

function Get-AnnotationChanges($OldSnapshot, $NewSnapshot) {
    $oldMap = @{}
    $newMap = @{}
    foreach ($item in (Get-AnnotationArray $OldSnapshot)) {
        if ($null -ne $item.id) { $oldMap[[string]$item.id] = $item }
    }
    foreach ($item in (Get-AnnotationArray $NewSnapshot)) {
        if ($null -ne $item.id) { $newMap[[string]$item.id] = $item }
    }

    $changes = New-Object System.Collections.ArrayList
    $nowIso = (Get-Date).ToString('o')

    foreach ($id in $newMap.Keys) {
        $newItem = $newMap[$id]
        if (-not $oldMap.ContainsKey($id)) {
            [void]$changes.Add([ordered]@{
                ocorridoEm = if ($newItem.atualizadoEm) { [string]$newItem.atualizadoEm } else { $nowIso }
                acao = 'CRIADA'
                anotacaoId = $id
                titulo = [string]$newItem.titulo
                anterior = $null
                atual = $newItem
            })
            continue
        }

        $oldItem = $oldMap[$id]
        $oldJson = $oldItem | ConvertTo-Json -Depth 20 -Compress
        $newJson = $newItem | ConvertTo-Json -Depth 20 -Compress
        if ($oldJson -ne $newJson) {
            $oldDeleted = -not [string]::IsNullOrWhiteSpace([string]$oldItem.excluidoEm)
            $newDeleted = -not [string]::IsNullOrWhiteSpace([string]$newItem.excluidoEm)
            $action = if (-not $oldDeleted -and $newDeleted) { 'MOVIDA_LIXEIRA' } elseif ($oldDeleted -and -not $newDeleted) { 'RESTAURADA_LIXEIRA' } else { 'EDITADA' }
            [void]$changes.Add([ordered]@{
                ocorridoEm = if ($newItem.atualizadoEm) { [string]$newItem.atualizadoEm } else { $nowIso }
                acao = $action
                anotacaoId = $id
                titulo = [string]$newItem.titulo
                anterior = $oldItem
                atual = $newItem
            })
        }
    }

    foreach ($id in $oldMap.Keys) {
        if (-not $newMap.ContainsKey($id)) {
            $oldItem = $oldMap[$id]
            [void]$changes.Add([ordered]@{
                ocorridoEm = $nowIso
                acao = 'EXCLUIDA'
                anotacaoId = $id
                titulo = [string]$oldItem.titulo
                anterior = $oldItem
                atual = $null
            })
        }
    }

    return @($changes)
}

function Register-PendingAnnotationChanges($OldSnapshot, $NewSnapshot) {
    if ($null -eq $OldSnapshot) { return }
    $changes = @(Get-AnnotationChanges $OldSnapshot $NewSnapshot)
    if ($changes.Count -eq 0) { return }

    $pending = Read-JsonFile $PendingAnnotationChangesFile
    $nowIso = (Get-Date).ToString('o')
    if ($null -eq $pending) {
        $pending = [ordered]@{
            versao = 1
            primeiraAlteracaoEm = $nowIso
            ultimaAlteracaoEm = $nowIso
            alteracoes = @()
        }
    }

    $existing = @($pending.alteracoes)
    $pending.alteracoes = @($existing + $changes)
    $pending.ultimaAlteracaoEm = $nowIso
    Save-Utf8NoBom $PendingAnnotationChangesFile ($pending | ConvertTo-Json -Depth 50)
}

function Initialize-AnnotationHistory {
    if (Test-Path -LiteralPath $AnnotationHistoryFile -PathType Leaf) { return }

    $nowIso = (Get-Date).ToString('o')
    $current = Read-JsonFile $CurrentAnnotationsFile
    $currentAnnotations = if ($null -ne $current) { @(Get-AnnotationArray $current) } else { @() }

    $history = [ordered]@{
        versao = 1
        tipo = 'historico-acumulativo-anotacoes'
        criadoEm = $nowIso
        ultimaConsolidacaoEm = $null
        anotacoesAtuais = $currentAnnotations
        historicoAlteracoes = @()
        observacaoAnexos = 'Imagens e PDFs nao sao incluidos neste arquivo de historico.'
    }

    Save-Utf8NoBom $AnnotationHistoryFile ($history | ConvertTo-Json -Depth 50)
}

function Invoke-AnnotationHistoryBackup {
    Initialize-AnnotationHistory
    $pending = Read-JsonFile $PendingAnnotationChangesFile
    if ($null -eq $pending -or @($pending.alteracoes).Count -eq 0) { return }

    $firstChange = [DateTime]::MinValue
    if (-not [DateTime]::TryParse([string]$pending.primeiraAlteracaoEm, [ref]$firstChange)) { return }
    $age = (Get-Date) - $firstChange
    if ($age.TotalDays -lt $AnnotationBackupDays) { return }

    $history = Read-JsonFile $AnnotationHistoryFile
    if ($null -eq $history) {
        Remove-Item -LiteralPath $AnnotationHistoryFile -Force -ErrorAction SilentlyContinue
        Initialize-AnnotationHistory
        $history = Read-JsonFile $AnnotationHistoryFile
    }
    if ($null -eq $history) { throw 'Nao foi possivel inicializar o historico de anotacoes.' }

    $existing = @($history.historicoAlteracoes)
    $history.historicoAlteracoes = @($existing + @($pending.alteracoes))
    $current = Read-JsonFile $CurrentAnnotationsFile
    $history.anotacoesAtuais = if ($null -ne $current) { @(Get-AnnotationArray $current) } else { @() }
    $history.ultimaConsolidacaoEm = (Get-Date).ToString('o')
    Save-Utf8NoBom $AnnotationHistoryFile ($history | ConvertTo-Json -Depth 50)
    Remove-Item -LiteralPath $PendingAnnotationChangesFile -Force -ErrorAction SilentlyContinue
}


# -----------------------------------------------------------------------------
# Backup binário de anexos e política de retenção
# -----------------------------------------------------------------------------
function Convert-ToSafeFileName([string]$Name, [string]$Fallback = 'arquivo') {
    $base = [System.IO.Path]::GetFileName([string]$Name)
    if ([string]::IsNullOrWhiteSpace($base)) { $base = $Fallback }
    $safe = $base -replace '[^A-Za-z0-9._-]', '_'
    if ($safe.Length -gt 120) { $safe = $safe.Substring(0, 120) }
    if ([string]::IsNullOrWhiteSpace($safe)) { $safe = $Fallback }
    return $safe
}

function Get-AttachmentBackupFolder([string]$BackupId) {
    if ($BackupId -notmatch '^\d{8}-\d{9}$') { throw 'Identificador de backup de anexos invalido.' }
    $candidate = [System.IO.Path]::GetFullPath((Join-Path $AttachmentBackupDir $BackupId))
    $rootFull = [System.IO.Path]::GetFullPath($AttachmentBackupDir + [System.IO.Path]::DirectorySeparatorChar)
    if (-not $candidate.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Caminho de backup de anexos invalido.' }
    return $candidate
}

function Get-LatestAttachmentManifest {
    $folders = @(Get-ChildItem -LiteralPath $AttachmentBackupDir -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending)
    foreach ($folder in $folders) {
        $manifestPath = Join-Path $folder.FullName 'manifest.json'
        $manifest = Read-JsonFile $manifestPath
        if ($null -ne $manifest -and $manifest.concluido -eq $true) {
            return @{ folder = $folder.FullName; manifest = $manifest }
        }
    }
    return $null
}

function Initialize-AttachmentBackup($Payload) {
    $backupId = Get-Date -Format 'yyyyMMdd-HHmmssfff'
    $folder = Get-AttachmentBackupFolder $backupId
    New-Item -ItemType Directory -Path $folder -Force | Out-Null
    $manifest = [ordered]@{
        versao = 1
        appVersion = '1.9.0-RC4.7'
        backupId = $backupId
        criadoEm = (Get-Date).ToString('o')
        concluido = $false
        concluidoEm = $null
        quantidade = 0
        totalBytes = 0
        quantidadeEsperada = [int]$Payload.quantidade
        totalBytesEsperado = [long]$Payload.totalBytes
        itens = @()
    }
    Save-Utf8NoBom (Join-Path $folder 'manifest.json') ($manifest | ConvertTo-Json -Depth 20)
    return $backupId
}

function Save-AttachmentBackupItem($Payload) {
    $folder = Get-AttachmentBackupFolder ([string]$Payload.backupId)
    $manifestPath = Join-Path $folder 'manifest.json'
    $manifest = Read-JsonFile $manifestPath
    if ($null -eq $manifest -or $manifest.concluido -eq $true) { throw 'Backup de anexos nao esta aberto para gravacao.' }
    $item = $Payload.item
    if ($null -eq $item -or [string]::IsNullOrWhiteSpace([string]$item.id)) { throw 'Item de anexo invalido.' }
    $mime = [string]$item.mimeType
    if (-not ($mime.StartsWith('image/') -or $mime -eq 'application/pdf')) { throw 'Tipo de anexo nao permitido.' }
    $bytes = [Convert]::FromBase64String([string]$Payload.dadosBase64)
    if ($bytes.Length -le 0 -or $bytes.Length -gt 25MB) { throw 'Tamanho de anexo invalido para backup.' }
    if ([long]$item.tamanho -ne $bytes.Length) { throw 'Tamanho do anexo diverge do manifesto.' }
    $safeId = ([string]$item.id) -replace '[^A-Za-z0-9_-]', '_'
    if ([string]::IsNullOrWhiteSpace($safeId)) { throw 'Identificador do anexo invalido.' }
    $originalName = Convert-ToSafeFileName ([string]$item.nome) 'anexo.bin'
    $extension = [System.IO.Path]::GetExtension($originalName).ToLowerInvariant()
    if (@('.png','.jpg','.jpeg','.gif','.webp','.bmp','.pdf') -notcontains $extension) {
        $extension = if ($mime -eq 'application/pdf') { '.pdf' } elseif ($mime -eq 'image/png') { '.png' } elseif ($mime -eq 'image/webp') { '.webp' } else { '.jpg' }
    }
    $storedName = "$safeId$extension"
    $filePath = Join-Path $folder $storedName
    [System.IO.File]::WriteAllBytes($filePath, $bytes)
    $existing = @($manifest.itens | Where-Object { [string]$_.id -ne [string]$item.id })
    $entry = [ordered]@{
        id = [string]$item.id
        ownerType = [string]$item.ownerType
        ownerId = [string]$item.ownerId
        nome = [string]$item.nome
        mimeType = $mime
        tamanho = [long]$bytes.Length
        criadoEm = [string]$item.criadoEm
        arquivo = $storedName
    }
    $manifest.itens = @($existing + $entry)
    Save-Utf8NoBom $manifestPath ($manifest | ConvertTo-Json -Depth 20)
}

function Complete-AttachmentBackup([string]$BackupId) {
    $folder = Get-AttachmentBackupFolder $BackupId
    $manifestPath = Join-Path $folder 'manifest.json'
    $manifest = Read-JsonFile $manifestPath
    if ($null -eq $manifest) { throw 'Manifesto do backup de anexos nao encontrado.' }
    $manifest.concluido = $true
    $manifest.concluidoEm = (Get-Date).ToString('o')
    $manifest.quantidade = @($manifest.itens).Count
    $sumResult = @($manifest.itens) | Measure-Object -Property tamanho -Sum
    $manifest.totalBytes = if ($null -ne $sumResult.Sum) { [long]$sumResult.Sum } else { [long]0 }
    Save-Utf8NoBom $manifestPath ($manifest | ConvertTo-Json -Depth 20)
    Invoke-BackupRetention
    return $manifest
}

function Invoke-BackupRetention {
    $now = Get-Date

    # Backups manuais: mantem arquivos dos ultimos 30 dias.
    $manualCutoff = $now.AddDays(-$ManualBackupRetentionDays)
    Get-ChildItem -LiteralPath $ManualBackupDir -Filter 'backup-manual-*.json' -File -ErrorAction SilentlyContinue | Where-Object {
        $_.LastWriteTime -lt $manualCutoff
    } | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
    }

    # Backups de anexos: mantem somente as 3 copias completas mais recentes.
    $completed = @()
    $incompleteCutoff = $now.AddHours(-$IncompleteAttachmentBackupRetentionHours)
    Get-ChildItem -LiteralPath $AttachmentBackupDir -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | ForEach-Object {
        $manifestPath = Join-Path $_.FullName 'manifest.json'
        $manifest = Read-JsonFile $manifestPath
        if ($null -ne $manifest -and $manifest.concluido -eq $true) {
            $completed += $_
        }
        elseif ($_.LastWriteTime -lt $incompleteCutoff) {
            Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    if ($completed.Count -gt $AttachmentBackupMaxCopies) {
        $completed | Select-Object -Skip $AttachmentBackupMaxCopies | ForEach-Object {
            Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

function Get-AttachmentItemPayload($Payload) {
    $folder = Get-AttachmentBackupFolder ([string]$Payload.backupId)
    $manifest = Read-JsonFile (Join-Path $folder 'manifest.json')
    if ($null -eq $manifest -or $manifest.concluido -ne $true) { throw 'Backup de anexos indisponivel.' }
    $id = [string]$Payload.id
    $item = @($manifest.itens | Where-Object { [string]$_.id -eq $id } | Select-Object -First 1)
    if ($item.Count -eq 0) { throw 'Anexo nao localizado no backup.' }
    $entry = $item[0]
    $fileName = Convert-ToSafeFileName ([string]$entry.arquivo)
    $filePath = [System.IO.Path]::GetFullPath((Join-Path $folder $fileName))
    $folderFull = [System.IO.Path]::GetFullPath($folder + [System.IO.Path]::DirectorySeparatorChar)
    if (-not $filePath.StartsWith($folderFull, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $filePath -PathType Leaf)) { throw 'Arquivo de anexo invalido no backup.' }
    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    return [ordered]@{ item = $entry; dadosBase64 = [Convert]::ToBase64String($bytes) }
}

# -----------------------------------------------------------------------------
# Agente de notificações em segundo plano
# -----------------------------------------------------------------------------
function Read-NotificationRegistry {
    $saved = Read-JsonFile $NotificationStateFile
    if ($null -eq $saved -or $null -eq $saved.notificados) {
        return [ordered]@{ versao = 1; notificados = @() }
    }
    return $saved
}

function Save-NotificationRegistry($Registry) {
    Save-Utf8NoBom $NotificationStateFile ($Registry | ConvertTo-Json -Depth 10)
}

function Get-SaoPauloNow {
    try {
        $tz = [System.TimeZoneInfo]::FindSystemTimeZoneById('E. South America Standard Time')
        return [System.TimeZoneInfo]::ConvertTime([DateTimeOffset]::Now, $tz)
    }
    catch {
        return [DateTimeOffset]::Now
    }
}

function Test-DayAllowedForAgenda([DateTimeOffset]$Value, $Agenda) {
    try {
        $tz = [System.TimeZoneInfo]::FindSystemTimeZoneById('E. South America Standard Time')
        $local = [System.TimeZoneInfo]::ConvertTime($Value, $tz)
    }
    catch {
        $local = $Value
    }
    $dayNumber = [int]$local.DayOfWeek
    $days = @()
    if ($null -ne $Agenda -and $null -ne $Agenda.diasSemana) {
        foreach ($d in @($Agenda.diasSemana)) {
            try {
                $n = [int]$d
                if ($n -ge 0 -and $n -le 6 -and $days -notcontains $n) { $days += $n }
            } catch {}
        }
    }
    if ($days.Count -eq 0) { $days = @(1,2,3,4,5) }
    return $days -contains $dayNumber
}

function Show-CaseTrackerNotification([string]$Title, [string]$Message) {
    if (-not $AgentAvailable) { return $false }
    try {
        $notify = New-Object System.Windows.Forms.NotifyIcon
        $notify.Icon = [System.Drawing.SystemIcons]::Information
        $notify.Visible = $true
        $notify.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
        $notify.BalloonTipTitle = $Title
        $notify.BalloonTipText = $Message
        $notify.ShowBalloonTip(5000)
        Start-Sleep -Milliseconds 2200
        $notify.Visible = $false
        $notify.Dispose()
        $script:LastAgentNotification = (Get-Date).ToString('o')
        return $true
    }
    catch {
        return $false
    }
}

function Invoke-BackgroundReminderNotifications {
    if (-not $AgentAvailable -or -not (Test-Path -LiteralPath $CurrentStateFile -PathType Leaf)) { return }
    $snapshot = Read-JsonFile $CurrentStateFile
    if ($null -eq $snapshot -or $null -eq $snapshot.dados) { return }
    $cases = @($snapshot.dados.cases)
    $ocorrencias = @($snapshot.dados.ocorrencias)
    $agendas = @($snapshot.dados.agendas)
    if ($cases.Count -eq 0 -or $ocorrencias.Count -eq 0) { return }
    $caseMap = @{}
    foreach ($case in $cases) { if ($case.id) { $caseMap[[string]$case.id] = $case } }
    $agendaMap = @{}
    foreach ($agenda in $agendas) { if ($agenda.id) { $agendaMap[[string]$agenda.id] = $agenda } }
    $registry = Read-NotificationRegistry
    $regMap = @{}
    foreach ($reg in @($registry.notificados)) { if ($reg.ocorrenciaId) { $regMap[[string]$reg.ocorrenciaId] = $reg } }
    $now = [DateTimeOffset]::Now
    $changed = $false
    $shown = 0
    foreach ($o in ($ocorrencias | Sort-Object previstoPara)) {
        if ($shown -ge 4) { break }
        $estado = [string]$o.estado
        if (@('Confirmada','Cancelada') -contains $estado) { continue }
        $case = $caseMap[[string]$o.caseId]
        if ($null -eq $case) { continue }
        if (@('Resolvido','Cancelado') -contains [string]$case.situacao) { continue }
        if (-not [string]::IsNullOrWhiteSpace([string]$case.excluidoEm)) { continue }
        $dueText = if ($estado -eq 'Adiada' -and -not [string]::IsNullOrWhiteSpace([string]$o.adiadoPara)) { [string]$o.adiadoPara } else { [string]$o.previstoPara }
        $due = [DateTimeOffset]::MinValue
        if (-not [DateTimeOffset]::TryParse($dueText, [ref]$due)) { continue }
        $agenda = $agendaMap[[string]$o.agendaId]
        if (-not (Test-DayAllowedForAgenda (Get-SaoPauloNow) $agenda)) { continue }
        if ($due -gt $now) { continue }
        $signature = "$([string]$o.id)|$dueText"
        $existing = $regMap[[string]$o.id]
        if ($null -ne $existing -and [string]$existing.assinatura -eq $signature) { continue }
        if (-not [string]::IsNullOrWhiteSpace([string]$o.notificadaEm)) {
            $entry = [ordered]@{ ocorrenciaId = [string]$o.id; assinatura = $signature; notificadoEm = [string]$o.notificadaEm; origem = 'navegador' }
        } else {
            $priority = if ($case.prioridade) { [string]$case.prioridade } else { 'Normal' }
            $ok = Show-CaseTrackerNotification "Case $($case.protocolo)" "$priority - atualizacao pendente"
            if (-not $ok) { continue }
            $entry = [ordered]@{ ocorrenciaId = [string]$o.id; assinatura = $signature; notificadoEm = (Get-Date).ToString('o'); origem = 'agente' }
            $shown += 1
        }
        $remaining = @($registry.notificados | Where-Object { [string]$_.ocorrenciaId -ne [string]$o.id })
        $registry.notificados = @($remaining + $entry)
        $regMap[[string]$o.id] = $entry
        $changed = $true
    }
    if ($changed) {
        if (@($registry.notificados).Count -gt 5000) {
            $registry.notificados = @($registry.notificados | Sort-Object notificadoEm -Descending | Select-Object -First 5000)
        }
        Save-NotificationRegistry $registry
    }
}

function Get-AgentStatusJson {
    return (@{
        ativo = [bool]$AgentAvailable
        processo = 'servidor-local.ps1'
        intervaloSegundos = 60
        snapshotDisponivel = (Test-Path -LiteralPath $CurrentStateFile -PathType Leaf)
        ultimaSincronizacao = if (Test-Path -LiteralPath $CurrentStateFile -PathType Leaf) { (Get-Item $CurrentStateFile).LastWriteTime.ToString('o') } else { $null }
        ultimaNotificacao = $LastAgentNotification
    } | ConvertTo-Json -Compress)
}

# -----------------------------------------------------------------------------
# Manutenção periódica e status de backup
# -----------------------------------------------------------------------------
function Invoke-AutomaticBackups {
    $now = Get-Date

    if (Test-Path -LiteralPath $CurrentStateFile -PathType Leaf) {
        $shouldBackup = -not (Test-Path -LiteralPath $AutoBackupFile -PathType Leaf)
        if (-not $shouldBackup) {
            $age = $now - (Get-Item -LiteralPath $AutoBackupFile).LastWriteTime
            $shouldBackup = $age.TotalHours -ge $AutoBackupHours
        }
        if ($shouldBackup) {
            Copy-Item -LiteralPath $CurrentStateFile -Destination $AutoBackupFile -Force
        }
    }

    if (Test-Path -LiteralPath $CurrentMacrosFile -PathType Leaf) {
        Invoke-MacroHistoryBackup
    }

    if (Test-Path -LiteralPath $CurrentAnnotationsFile -PathType Leaf) {
        Invoke-AnnotationHistoryBackup
    }
}

function Get-BackupStatusJson {
    try { Invoke-BackupRetention } catch {}
    $auto = if (Test-Path -LiteralPath $AutoBackupFile) { (Get-Item $AutoBackupFile).LastWriteTime.ToString('o') } else { $null }
    $macro = if (Test-Path -LiteralPath $MacroHistoryFile) { (Get-Item $MacroHistoryFile).LastWriteTime.ToString('o') } else { $null }
    $annotation = if (Test-Path -LiteralPath $AnnotationHistoryFile) { (Get-Item $AnnotationHistoryFile).LastWriteTime.ToString('o') } else { $null }

    $pendingMacros = Read-JsonFile $PendingMacroChangesFile
    $pendingMacroCount = if ($null -ne $pendingMacros) { @($pendingMacros.alteracoes).Count } else { 0 }
    $nextMacroUpdate = $null
    if ($null -ne $pendingMacros -and $pendingMacros.primeiraAlteracaoEm) {
        $firstChange = [DateTime]::MinValue
        if ([DateTime]::TryParse([string]$pendingMacros.primeiraAlteracaoEm, [ref]$firstChange)) {
            $nextMacroUpdate = $firstChange.AddDays($MacroBackupDays).ToString('o')
        }
    }

    $pendingAnnotations = Read-JsonFile $PendingAnnotationChangesFile
    $pendingAnnotationCount = if ($null -ne $pendingAnnotations) { @($pendingAnnotations.alteracoes).Count } else { 0 }
    $nextAnnotationUpdate = $null
    if ($null -ne $pendingAnnotations -and $pendingAnnotations.primeiraAlteracaoEm) {
        $firstAnnotationChange = [DateTime]::MinValue
        if ([DateTime]::TryParse([string]$pendingAnnotations.primeiraAlteracaoEm, [ref]$firstAnnotationChange)) {
            $nextAnnotationUpdate = $firstAnnotationChange.AddDays($AnnotationBackupDays).ToString('o')
        }
    }

    $manualCount = @(Get-ChildItem -LiteralPath $ManualBackupDir -Filter '*.json' -File -ErrorAction SilentlyContinue).Count
    $attachmentBackupCopies = @(Get-ChildItem -LiteralPath $AttachmentBackupDir -Directory -ErrorAction SilentlyContinue | Where-Object {
        $m = Read-JsonFile (Join-Path $_.FullName 'manifest.json')
        $null -ne $m -and $m.concluido -eq $true
    }).Count
    $latestAttachments = Get-LatestAttachmentManifest
    $attachmentCreated = if ($null -ne $latestAttachments) { [string]$latestAttachments.manifest.concluidoEm } else { $null }
    $attachmentCount = if ($null -ne $latestAttachments) { [int]$latestAttachments.manifest.quantidade } else { 0 }
    $attachmentBytes = if ($null -ne $latestAttachments) { [long]$latestAttachments.manifest.totalBytes } else { 0 }
    return (@{
        pasta = $BackupRoot
        ultimoAutomatico = $auto
        ultimoMacros = $macro
        macrosAlteracoesPendentes = $pendingMacroCount
        proximaAtualizacaoMacros = $nextMacroUpdate
        arquivoMacros = 'Macros\\macros-historico.json'
        ultimoAnotacoes = $annotation
        anotacoesAlteracoesPendentes = $pendingAnnotationCount
        proximaAtualizacaoAnotacoes = $nextAnnotationUpdate
        arquivoAnotacoes = 'Anotacoes\\anotacoes-historico.json'
        backupsManuais = $manualCount
        retencaoManuaisDias = $ManualBackupRetentionDays
        intervaloAutomaticoHoras = $AutoBackupHours
        intervaloMacrosDias = $MacroBackupDays
        intervaloAnotacoesDias = $AnnotationBackupDays
        ultimoBackupAnexos = $attachmentCreated
        anexosBackupQuantidade = $attachmentCount
        anexosBackupBytes = $attachmentBytes
        backupsAnexosCopias = $attachmentBackupCopies
        backupsAnexosMaxCopias = $AttachmentBackupMaxCopies
    } | ConvertTo-Json -Compress)
}

try {
    try { $listener.Start() }
    catch {
        if (Test-ExistingCaseTracker) {
            if ($OpenBrowser) { Open-DefaultBrowser $Url }
            return
        }
        throw
    }

    if ($OpenBrowser) { Open-DefaultBrowser $Url }

    while ($running) {
        if (((Get-Date) - $lastMaintenance).TotalSeconds -ge 60) {
            if ($StateReady) { try { Invoke-AutomaticBackups } catch {} }
            try { Invoke-BackupRetention } catch {}
            try { Invoke-BackgroundReminderNotifications } catch {}
            $lastMaintenance = Get-Date
        }

        if (-not $listener.Pending()) {
            Start-Sleep -Milliseconds 200
            continue
        }

        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 8192, $true)
            $requestLine = $reader.ReadLine()
            if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }

            $headers = @{}
            while ($true) {
                $line = $reader.ReadLine()
                if ([string]::IsNullOrEmpty($line)) { break }
                $separator = $line.IndexOf(':')
                if ($separator -gt 0) {
                    $name = $line.Substring(0, $separator).Trim().ToLowerInvariant()
                    $value = $line.Substring($separator + 1).Trim()
                    $headers[$name] = $value
                }
            }

            $parts = $requestLine.Split(' ')
            if ($parts.Length -lt 2) {
                Send-Text $stream 400 'Bad Request' 'Requisicao invalida.'
                continue
            }

            $method = $parts[0].ToUpperInvariant()
            $rawPath = $parts[1].Split('?')[0]

            if ($method -eq 'GET' -and $rawPath -eq '/__case_tracker_ping') {
                Send-Text $stream 200 'OK' 'CASE_TRACKER_OK'
                continue
            }

            if ($method -eq 'GET' -and $rawPath -eq '/__session') {
                Send-Text $stream 200 'OK' ('{"token":"' + $SessionToken + '"}') 'application/json; charset=utf-8'
                continue
            }

            if ($method -eq 'GET' -and $rawPath -eq '/__agent_status') {
                $token = $headers['x-case-tracker-token']
                if ([string]::IsNullOrWhiteSpace($token) -or $token -ne $SessionToken) {
                    Send-Text $stream 403 'Forbidden' 'Nao autorizado.'
                    continue
                }
                Send-Text $stream 200 'OK' (Get-AgentStatusJson) 'application/json; charset=utf-8'
                continue
            }

            if ($method -eq 'GET' -and $rawPath -eq '/__backup_status') {
                $token = $headers['x-case-tracker-token']
                if ([string]::IsNullOrWhiteSpace($token) -or $token -ne $SessionToken) {
                    Send-Text $stream 403 'Forbidden' 'Nao autorizado.'
                    continue
                }
                Send-Text $stream 200 'OK' (Get-BackupStatusJson) 'application/json; charset=utf-8'
                continue
            }

            if ($method -eq 'POST' -and @('/__encerrar','/__sync_estado','/__backup_manual','/__abrir_backups','/__test_notification','/__backup_anexos_iniciar','/__backup_anexo_item','/__backup_anexos_finalizar','/__restaurar_anexos_manifest','/__restaurar_anexo_item') -contains $rawPath) {
                $token = $headers['x-case-tracker-token']
                if ([string]::IsNullOrWhiteSpace($token) -or $token -ne $SessionToken) {
                    Send-Text $stream 403 'Forbidden' 'Solicitacao nao autorizada.'
                    continue
                }

                if ($rawPath -eq '/__encerrar') {
                    Send-Text $stream 200 'OK' '{"encerrado":true}' 'application/json; charset=utf-8'
                    $running = $false
                    continue
                }

                if ($rawPath -eq '/__abrir_backups') {
                    Start-Process explorer.exe -ArgumentList ('"' + $BackupRoot + '"')
                    Send-Text $stream 200 'OK' '{"aberto":true}' 'application/json; charset=utf-8'
                    continue
                }

                if ($rawPath -eq '/__test_notification') {
                    $ok = Show-CaseTrackerNotification 'Case Tracker' 'Alerta de teste do agente em segundo plano.'
                    if ($ok) { Send-Text $stream 200 'OK' '{"enviado":true}' 'application/json; charset=utf-8' }
                    else { Send-Text $stream 503 'Service Unavailable' '{"enviado":false}' 'application/json; charset=utf-8' }
                    continue
                }

                $bodyBase64 = Get-BodyText $reader $headers
                $jsonText = Decode-Base64Utf8 $bodyBase64

                if ($rawPath -eq '/__backup_anexos_iniciar') {
                    $payload = $jsonText | ConvertFrom-Json
                    $backupId = Initialize-AttachmentBackup $payload
                    Send-Text $stream 200 'OK' (@{ backupId = $backupId } | ConvertTo-Json -Compress) 'application/json; charset=utf-8'
                    continue
                }

                if ($rawPath -eq '/__backup_anexo_item') {
                    $payload = $jsonText | ConvertFrom-Json
                    Save-AttachmentBackupItem $payload
                    Send-Text $stream 200 'OK' '{"salvo":true}' 'application/json; charset=utf-8'
                    continue
                }

                if ($rawPath -eq '/__backup_anexos_finalizar') {
                    $payload = $jsonText | ConvertFrom-Json
                    $manifest = Complete-AttachmentBackup ([string]$payload.backupId)
                    Send-Text $stream 200 'OK' ($manifest | ConvertTo-Json -Depth 20 -Compress) 'application/json; charset=utf-8'
                    continue
                }

                if ($rawPath -eq '/__restaurar_anexos_manifest') {
                    $latest = Get-LatestAttachmentManifest
                    if ($null -eq $latest) { Send-Text $stream 404 'Not Found' 'Nenhum backup de anexos encontrado.'; continue }
                    Send-Text $stream 200 'OK' ($latest.manifest | ConvertTo-Json -Depth 20 -Compress) 'application/json; charset=utf-8'
                    continue
                }

                if ($rawPath -eq '/__restaurar_anexo_item') {
                    $payload = $jsonText | ConvertFrom-Json
                    $result = Get-AttachmentItemPayload $payload
                    Send-Text $stream 200 'OK' ($result | ConvertTo-Json -Depth 20 -Compress) 'application/json; charset=utf-8'
                    continue
                }

                if ($rawPath -eq '/__backup_manual') {
                    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmssfff'
                    $manualPath = Join-Path $ManualBackupDir ("backup-manual-$timestamp.json")
                    Save-Utf8NoBom $manualPath $jsonText
                    Invoke-BackupRetention
                    Send-Text $stream 200 'OK' ('{"salvo":true,"arquivo":"' + [System.IO.Path]::GetFileName($manualPath) + '"}') 'application/json; charset=utf-8'
                    continue
                }

                if ($rawPath -eq '/__sync_estado') {
                    $payload = $jsonText | ConvertFrom-Json
                    if ($null -eq $payload.backup -or $null -eq $payload.macros -or $null -eq $payload.anotacoes) { throw 'Payload de sincronizacao invalido.' }
                    $backupJson = $payload.backup | ConvertTo-Json -Depth 100
                    $macrosJson = $payload.macros | ConvertTo-Json -Depth 30
                    $annotationsJson = $payload.anotacoes | ConvertTo-Json -Depth 30
                    $previousMacros = Read-JsonFile $CurrentMacrosFile
                    $previousAnnotations = Read-JsonFile $CurrentAnnotationsFile
                    Register-PendingMacroChanges $previousMacros $payload.macros
                    Register-PendingAnnotationChanges $previousAnnotations $payload.anotacoes
                    Save-Utf8NoBom $CurrentStateFile $backupJson
                    Save-Utf8NoBom $CurrentMacrosFile $macrosJson
                    Save-Utf8NoBom $CurrentAnnotationsFile $annotationsJson
                    $StateReady = $true
                    Invoke-AutomaticBackups
                    Send-Text $stream 200 'OK' '{"sincronizado":true}' 'application/json; charset=utf-8'
                    continue
                }
            }

            if ($method -ne 'GET') {
                Send-Text $stream 405 'Method Not Allowed' 'Metodo nao suportado.'
                continue
            }

            $decodedPath = [System.Uri]::UnescapeDataString($rawPath).Replace('/', [System.IO.Path]::DirectorySeparatorChar).TrimStart([char[]]'\/')
            if ([string]::IsNullOrWhiteSpace($decodedPath)) { $decodedPath = 'index.html' }

            $candidate = [System.IO.Path]::GetFullPath((Join-Path $Root $decodedPath))
            $rootFull = [System.IO.Path]::GetFullPath($Root + [System.IO.Path]::DirectorySeparatorChar)

            if (-not $candidate.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
                Send-Text $stream 404 'Not Found' 'Arquivo nao encontrado.'
                continue
            }

            $body = [System.IO.File]::ReadAllBytes($candidate)
            Send-Response $stream 200 'OK' $body (Get-MimeType $candidate)
        }
        catch {
            try { Send-Text $stream 500 'Internal Server Error' ('Erro interno do servidor local: ' + $_.Exception.Message) } catch {}
        }
        finally { $client.Close() }
    }
}
finally {
    try { $listener.Stop() } catch {}
}
