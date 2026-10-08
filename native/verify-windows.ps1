$ErrorActionPreference = 'Stop'
$hostDir = Join-Path $PSScriptRoot 'windows'
$hostExe = Join-Path $hostDir 'tab-lock-auth.exe'
$config = Get-Content (Join-Path $hostDir 'auth-config.json') -Raw | ConvertFrom-Json
function Invoke-HostCheck([string]$Origin, [hashtable]$Message) {
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $hostExe
    $start.Arguments = $Origin
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $start
    [void]$process.Start()
    $inputStream = $process.StandardInput.BaseStream
    $bytes = [Text.Encoding]::UTF8.GetBytes(($Message | ConvertTo-Json -Compress))
    $inputStream.Write([BitConverter]::GetBytes([uint32]$bytes.Length), 0, 4)
    $inputStream.Write($bytes, 0, $bytes.Length)
    $inputStream.Flush()
    $process.StandardInput.Close()
    $reader = New-Object IO.BinaryReader($process.StandardOutput.BaseStream)
    $length = $reader.ReadUInt32()
    if ($length -gt 1048576) { throw 'Respons host terlalu besar.' }
    $response = $reader.ReadBytes($length)
    if ($response.Length -ne $length) { throw 'Respons host terpotong.' }
    $result = [Text.Encoding]::UTF8.GetString($response) | ConvertFrom-Json
    $process.WaitForExit()
    $process.Dispose()
    return $result
}
$denied = Invoke-HostCheck 'chrome-extension://unauthorized/' @{ action = 'status' }
if (!$denied.error) { throw 'FAIL: origin asing tidak ditolak.' }
$invalid = Invoke-HostCheck $config.allowed_origin @{ action = 'authenticate'; count = 0 }
if (!$invalid.error) { throw 'FAIL: permintaan autentikasi tidak valid diterima.' }
$status = Invoke-HostCheck $config.allowed_origin @{ action = 'status' }
if ($status.error -or $status.passwordRequired -isnot [bool]) { throw 'FAIL: status autentikasi tidak tersedia.' }
if ($status.passwordRequired) {
    Write-Host 'Selesaikan dialog password Windows. Tidak ada kunci yang akan dihapus.'
    $auth = Invoke-HostCheck $config.allowed_origin @{ action = 'authenticate'; count = 1 }
    if ($auth.authenticated -ne $true) { throw 'FAIL: autentikasi dibatalkan atau gagal.' }
} else {
    $auth = Invoke-HostCheck $config.allowed_origin @{ action = 'confirm-no-password' }
    if ($auth.noPassword -ne $true) { throw 'FAIL: status tanpa password tidak terverifikasi.' }
}
Write-Host 'PASS: origin, validasi pesan, status akun, dan autentikasi Windows. Tidak ada kunci yang dihapus.'
