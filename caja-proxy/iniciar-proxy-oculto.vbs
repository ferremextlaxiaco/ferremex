' Ferremex - Lanza el proxy Caddy SIN ventana visible.
' Usado por la tarea programada (instalar-inicio-automatico.bat).
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
carpeta = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = carpeta
' El 0 = ventana oculta; False = no esperar a que termine.
sh.Run """" & carpeta & "\caddy.exe"" run --config """ & carpeta & "\Caddyfile"" --adapter caddyfile", 0, False
