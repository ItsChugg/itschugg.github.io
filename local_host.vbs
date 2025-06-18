Set WshShell = CreateObject("WScript.Shell")
WshShell.Run chr(34) & "Z:\hosting_script.bat" & chr(34), 0
Set WshShell = Nothing
