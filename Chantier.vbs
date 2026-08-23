' ---------------------------------------------------------------------------
'  Chantier — lanceur de l'application
'
'  1. démarre le serveur local (sans fenêtre noire) s'il ne tourne pas déjà
'  2. ouvre l'app dans sa propre fenêtre Chrome, sans barre d'adresse
'
'  C'est ce fichier que vise le raccourci du Bureau.
' ---------------------------------------------------------------------------

Option Explicit

Dim shell, fso, racine, python, serveur, url, chrome, chemins, c
Set shell = CreateObject("WScript.Shell")
Set fso   = CreateObject("Scripting.FileSystemObject")

racine  = fso.GetParentFolderName(WScript.ScriptFullName)
python  = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\Python\Python312\pythonw.exe"
serveur = racine & "\scripts\serveur-local.py"
url     = "http://localhost:5199"

If Not fso.FileExists(python) Then
  MsgBox "Python est introuvable :" & vbCrLf & python, vbCritical, "Chantier"
  WScript.Quit 1
End If

' 0 = fenêtre masquée, False = on n'attend pas la fin du serveur
shell.Run """" & python & """ """ & serveur & """", 0, False

' Laisser au serveur le temps d'ouvrir son port avant d'y envoyer Chrome
WScript.Sleep 1200

chemins = Array( _
  shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\Google\Chrome\Application\chrome.exe", _
  shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Google\Chrome\Application\chrome.exe", _
  shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Google\Chrome\Application\chrome.exe")

chrome = ""
For Each c In chemins
  If chrome = "" And fso.FileExists(c) Then chrome = c
Next

If chrome = "" Then
  ' Pas de Chrome : le navigateur par défaut fera l'affaire, avec sa barre d'adresse.
  shell.Run url, 1, False
Else
  ' --app = fenêtre dédiée, sans onglets ni barre d'adresse : ça ressemble à une app.
  shell.Run """" & chrome & """ --app=" & url, 1, False
End If
