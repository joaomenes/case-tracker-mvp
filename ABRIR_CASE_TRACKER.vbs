Option Explicit

' Inicializador silencioso: reutiliza o servidor existente ou inicia o PowerShell oculto.

Dim shell, shellApp, fso, base, powershellPath, serverPath, command, url, http, serverOnline
Set shell = CreateObject("WScript.Shell")
Set shellApp = CreateObject("Shell.Application")
Set fso = CreateObject("Scripting.FileSystemObject")

base = fso.GetParentFolderName(WScript.ScriptFullName)
serverPath = fso.BuildPath(base, "servidor-local.ps1")
url = "http://localhost:8765/?v=1.9.0-RC4.7"
serverOnline = False

If Not fso.FileExists(serverPath) Then
    MsgBox "Arquivo servidor-local.ps1 nao encontrado. Execute novamente o INSTALAR_CASE_TRACKER.vbs para reparar a instalacao.", vbCritical, "Case Tracker"
    WScript.Quit 1
End If

On Error Resume Next
Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
http.setTimeouts 700, 700, 700, 700
http.Open "GET", "http://127.0.0.1:8765/__case_tracker_ping", False
http.Send
If Err.Number = 0 Then
    If http.Status = 200 Then
        If Trim(http.responseText) = "CASE_TRACKER_OK" Then serverOnline = True
    End If
End If
Err.Clear
On Error GoTo 0

If serverOnline Then
    shellApp.ShellExecute url, "", "", "open", 1
    WScript.Quit 0
End If

powershellPath = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
command = Chr(34) & powershellPath & Chr(34) & " -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & serverPath & Chr(34) & " -OpenBrowser"
shell.Run command, 0, False
