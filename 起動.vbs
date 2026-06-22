' 文章生成サポート を黒い画面を出さずに静かに起動するランチャー
Set sh = CreateObject("WScript.Shell")
appDir = "C:\Users\info\文章生成サポート"
electronExe = appDir & "\node_modules\electron\dist\electron.exe"
sh.CurrentDirectory = appDir
sh.Run """" & electronExe & """ """ & appDir & """", 0, False
