Option Explicit

' Entrada amigavel do instalador: chama o PowerShell sem manter console visivel.

Dim shell, fso, base, powershellPath, setupPath, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

base = fso.GetParentFolderName(WScript.ScriptFullName)
setupPath = fso.BuildPath(base, "CONFIGURAR_CASE_TRACKER.ps1")

If Not fso.FileExists(setupPath) Then
    MsgBox "Arquivo CONFIGURAR_CASE_TRACKER.ps1 nao encontrado. Extraia novamente o pacote completo e tente outra vez.", vbCritical, "Case Tracker"
    WScript.Quit 1
End If

powershellPath = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
command = Chr(34) & powershellPath & Chr(34) & " -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & setupPath & Chr(34)

shell.Run command, 0, False
