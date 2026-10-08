param([Parameter(Mandatory=$true)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId)
$ErrorActionPreference = 'Stop'
$nativeDir = $PSScriptRoot
$windowsDir = Join-Path $nativeDir 'windows'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (!(Test-Path $compiler)) { $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (!(Test-Path $compiler)) { throw 'Compiler .NET Framework tidak tersedia. Instal .NET Framework 4.8 dari Microsoft.' }
$executable = Join-Path $windowsDir 'tab-lock-auth.exe'
$sources = @('Main.cs', 'WindowsAuth.cs', 'BlankPassword.cs') | ForEach-Object { Join-Path $windowsDir $_ }
& $compiler /nologo /optimize+ /target:exe /platform:anycpu "/out:$executable" /reference:System.Runtime.Serialization.dll $sources
if ($LASTEXITCODE -ne 0) { throw 'Kompilasi helper gagal. Registrasi Chrome tidak diubah.' }
$origin = "chrome-extension://$ExtensionId/"
$utf8 = New-Object System.Text.UTF8Encoding($false)
$config = @{ allowed_origin = $origin } | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $windowsDir 'auth-config.json'), $config, $utf8)
$manifest = @{ name = 'org.simpletablock.auth'; description = 'Simple Tab Lock device authentication';
    path = $executable; type = 'stdio'; allowed_origins = @($origin) } | ConvertTo-Json
$manifestPath = Join-Path $windowsDir 'org.simpletablock.auth.json'
[IO.File]::WriteAllText($manifestPath, $manifest, $utf8)
$registryPath = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\org.simpletablock.auth'
New-Item -Path $registryPath -Force | Out-Null
Set-Item -Path $registryPath -Value $manifestPath
Write-Host 'Helper Windows terpasang untuk akun ini. Reload ekstensi dan halaman pengelola di Chrome.'
