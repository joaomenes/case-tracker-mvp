Option Explicit

' Copia a rotina interna para TEMP para permitir remover a propria pasta instalada.

Dim shell, fso, base, sourcePs1, tempFolder, tempPs1, powershellPath, command, installPath
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

base = fso.GetParentFolderName(WScript.ScriptFullName)
sourcePs1 = fso.BuildPath(fso.BuildPath(base, "scripts"), "DESINSTALADOR_INTERNO.ps1")
installPath = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\CaseTracker"

If Not fso.FileExists(sourcePs1) Then
    MsgBox "Arquivo interno do desinstalador nao encontrado. Extraia novamente o pacote completo e tente outra vez.", vbCritical, "Case Tracker"
    WScript.Quit 1
End If

tempFolder = shell.ExpandEnvironmentStrings("%TEMP%")
tempPs1 = fso.BuildPath(tempFolder, "CaseTracker-Uninstall-" & Replace(Replace(Replace(CStr(Now), "/", "-"), ":", "-"), " ", "-") & ".ps1")
fso.CopyFile sourcePs1, tempPs1, True

powershellPath = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
command = Chr(34) & powershellPath & Chr(34) & " -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & tempPs1 & Chr(34) & " -InstallPath " & Chr(34) & installPath & Chr(34)

shell.Run command, 0, False
