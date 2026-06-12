# Reload the dev Void editor window
# Find Electron/Code process and send Ctrl+Shift+P then type reload
$procs = Get-Process | Where-Object { $_.ProcessName -match 'electron|code|Code' -and $_.MainWindowTitle -ne '' }
Write-Host "Found processes:"
$procs | Format-Table Id, ProcessName, MainWindowTitle -AutoSize

if ($procs.Count -gt 0) {
    $wshell = New-Object -ComObject wscript.shell
    $wshell.AppActivate($procs[0].MainWindowTitle)
    Start-Sleep -Milliseconds 300
    $wshell.SendKeys('^+p')
    Start-Sleep -Milliseconds 500
    $wshell.SendKeys('Developer: Reload Window')
    Start-Sleep -Milliseconds 300
    $wshell.SendKeys('{ENTER}')
    Write-Host "Reload command sent."
} else {
    Write-Host "No Void/Code window found."
}
