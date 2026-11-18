param([switch]$Stop)
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$local = Join-Path $root '.local'
$data = Join-Path $local 'postgres'
$bin = if ($env:PULS_PG_BIN) { $env:PULS_PG_BIN } else { 'C:\Program Files\PostgreSQL\17\bin' }
$ctl = Join-Path $bin 'pg_ctl.exe'
if (-not (Test-Path -LiteralPath $ctl)) { throw 'Укажите PULS_PG_BIN: каталог bin установленного PostgreSQL 17.' }
if (-not ([System.IO.Path]::GetFullPath($data).StartsWith($root + [System.IO.Path]::DirectorySeparatorChar))) { throw 'Неверный путь локального кластера.' }
if ($Stop) {
  if (Test-Path -LiteralPath (Join-Path $data 'postmaster.pid')) {
    & $ctl -D $data -m fast -w stop
    if ($LASTEXITCODE -ne 0) { throw 'Не удалось остановить локальный PostgreSQL.' }
  }
  exit
}
New-Item -ItemType Directory -Path $local -Force | Out-Null
function Protect-Path([string]$path) {
  $isDirectory = Test-Path -LiteralPath $path -PathType Container
  $acl = if ($isDirectory) { [IO.Directory]::GetAccessControl($path) } else { [IO.File]::GetAccessControl($path) }
  $acl.SetAccessRuleProtection($true, $false)
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $flags = if ($isDirectory) { [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit' } else { [System.Security.AccessControl.InheritanceFlags]::None }
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', $flags, 'None', 'Allow')
  $acl.AddAccessRule($rule)
  if ($isDirectory) { [IO.Directory]::SetAccessControl($path, $acl) } else { [IO.File]::SetAccessControl($path, $acl) }
}
Protect-Path $local
function Secret {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes); $rng.Dispose()
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
}
$new = -not (Test-Path -LiteralPath (Join-Path $data 'PG_VERSION'))
if (-not $new) {
  # После прерванной первичной настройки наличие PG_VERSION ещё не означает,
  # что базы/роли и оба файла окружения были успешно подготовлены.
  foreach ($file in @('.env.local','.env.test.local')) {
    if (-not (Test-Path -LiteralPath (Join-Path $root $file) -PathType Leaf)) {
      throw 'Локальный кластер уже существует, но комплект файлов окружения неполон. Восстановите настройки вручную; повторная инициализация и смена паролей не выполняются.'
    }
  }
}
if ($new) {
  foreach ($file in @('.env.local','.env.test.local')) { if (Test-Path -LiteralPath (Join-Path $root $file)) { throw 'Файлы окружения уже существуют; автоматическая перезапись запрещена.' } }
  $ownerPassword = Secret; $webPassword = Secret
  $pwfile = Join-Path $local 'init-password.tmp'
  [IO.File]::WriteAllText($pwfile, $ownerPassword, (New-Object Text.UTF8Encoding($false)))
  try { & (Join-Path $bin 'initdb.exe') -D $data -U puls_owner --auth=scram-sha-256 --encoding=UTF8 --locale=C --pwfile=$pwfile | Out-Null; if ($LASTEXITCODE -ne 0) { throw 'Не удалось создать локальный кластер.' } }
  finally { Remove-Item -LiteralPath $pwfile -Force }
}
& $ctl -D $data status *> $null
if ($LASTEXITCODE -ne 0) {
  & $ctl -D $data -l (Join-Path $local 'postgres.log') -o '-p 55432 -h 127.0.0.1' -w start
  if ($LASTEXITCODE -ne 0) { throw 'Не удалось запустить PostgreSQL на 127.0.0.1:55432.' }
}
if ($new) {
  $previousPassword = $env:PGPASSWORD
  $env:PGPASSWORD = $ownerPassword
  try {
    $sql = "CREATE ROLE puls_web LOGIN PASSWORD '$webPassword';`nCREATE DATABASE puls_dev;`nCREATE DATABASE puls_test;"
    $sql | & (Join-Path $bin 'psql.exe') -h 127.0.0.1 -p 55432 -U puls_owner -d postgres -v ON_ERROR_STOP=1 -q
    if ($LASTEXITCODE -ne 0) { throw 'Не удалось создать отдельные базы проекта.' }
    foreach ($database in @('puls_dev','puls_test')) {
      'REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO puls_web; ALTER DEFAULT PRIVILEGES FOR ROLE puls_owner IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO puls_web; ALTER DEFAULT PRIVILEGES FOR ROLE puls_owner IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO puls_web;' | & (Join-Path $bin 'psql.exe') -h 127.0.0.1 -p 55432 -U puls_owner -d $database -v ON_ERROR_STOP=1 -q
      if ($LASTEXITCODE -ne 0) { throw 'Не удалось назначить права.' }
      $file = if ($database -eq 'puls_dev') { '.env.local' } else { '.env.test.local' }
      $origin = if ($database -eq 'puls_dev') { 'https://localhost:3443' } else { 'https://localhost:3444' }
      $content = "APP_ORIGIN=$origin`nDATABASE_URL=postgresql://puls_web:${webPassword}@127.0.0.1:55432/$database`nMIGRATION_DATABASE_URL=postgresql://puls_owner:${ownerPassword}@127.0.0.1:55432/$database`nAUTH_RATE_LIMIT_HMAC_KEY=$(Secret)`nTRUSTED_PROXY_KEY=$(Secret)`nSESSION_COOKIE_NAME=__Host-puls_session`n"
      $path = Join-Path $root $file
      [IO.File]::WriteAllText($path, $content, (New-Object Text.UTF8Encoding($false))); Protect-Path $path
    }
  } finally { $env:PGPASSWORD = $previousPassword; $ownerPassword=$null; $webPassword=$null; $sql=$null; $content=$null }
}
Write-Output 'Локальный PostgreSQL проекта запущен. Секреты сохранены только в исключённых из Git файлах окружения с ограниченными правами.'
