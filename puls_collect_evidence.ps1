# Собирает конкурсные материалы ПУЛЬС для передачи в ChatGPT.
# НЕ загружает ничего в сеть. НЕ изменяет исходные файлы проекта.
$ErrorActionPreference = 'Stop'
$project = (Get-Location).Path
$required = Join-Path $project 'package.json'
if (-not (Test-Path -LiteralPath $required)) {
    throw 'Запустите скрипт из корня репозитория ПУЛЬС (рядом с package.json).'
}

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$staging = Join-Path $env:TEMP ("PULS_submission_bundle_" + $timestamp)
$archive = Join-Path $project ("PULS_for_ChatGPT_" + $timestamp + '.zip')
New-Item -ItemType Directory -Path $staging -Force | Out-Null

$allowed = @('.png', '.jpg', '.jpeg', '.webp', '.svg', '.pdf', '.tex', '.md')
$dirs = @('contest-final-evidence', 'contest-report-assets', 'contest-submission')
$entries = New-Object 'System.Collections.Generic.List[string]'
$copies = 0

function Copy-SelectedFile([string]$fullPath, [string]$relative) {
    $dest = Join-Path $staging $relative
    $parent = Split-Path -Parent $dest
    if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    Copy-Item -LiteralPath $fullPath -Destination $dest -Force
    $script:copies++
    $script:entries.Add($relative)
}

foreach ($d in $dirs) {
    $source = Join-Path $project $d
    if (-not (Test-Path -LiteralPath $source -PathType Container)) { continue }
    Get-ChildItem -LiteralPath $source -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
        $file = $_
        $rel = $file.FullName.Substring($project.Length).TrimStart('\')
        $ext = $file.Extension.ToLowerInvariant()
        # Не копируем архивы, .env, JSON-доступы, логи, видео, трассировки Playwright, cookies.
        if ($allowed -contains $ext -and $rel -notmatch '(?i)(password|secret|credential|token|cookie|session)') {
            Copy-SelectedFile $file.FullName $rel
        }
    }
}

$docs = @('PULS_AI_DEVELOPMENT_HISTORY.md',
          'PULS_CONTEST_REPORT_DRAFT.md',
          'PULS_SELECTED_AI_PROMPTS.md',
          'PULS_EVIDENCE_CHECKLIST.md')
foreach ($d in $docs) {
    $f = Join-Path $project $d
    if (Test-Path -LiteralPath $f -PathType Leaf) {
        Copy-SelectedFile $f $d
    }
}

# Подготовленный Codex генератор полезен для продолжения работы,
# но не должен автоматически включать жестко записанные демо-пароли.
$generator = Join-Path $project '.local\build-contest-report.py'
if (Test-Path -LiteralPath $generator -PathType Leaf) {
    $contents = Get-Content -LiteralPath $generator -Raw -Encoding UTF8
    if ($contents -match 'Puls-[AB]-[a-zA-Z0-9_-]{6,}') {
        Write-Warning 'Генератор содержит похожее на пароль значение: не включаю в архив.'
    } else {
        Copy-SelectedFile $generator '.local\build-contest-report.py'
    }
}

# Дополнительные готовые скриншоты E2E — только изображения (без tracing.zip).
$testDir = Join-Path $project 'test-results'
if (Test-Path -LiteralPath $testDir -PathType Container) {
    Get-ChildItem -LiteralPath $testDir -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
        $file = $_
        $ext = $file.Extension.ToLowerInvariant()
        if ($ext -in @('.png','.jpg','.jpeg','.webp')) {
            $rel = $file.FullName.Substring($project.Length).TrimStart('\')
            if ($rel -notmatch '(?i)(password|secret|credential|token|cookie|session)') {
                Copy-SelectedFile $file.FullName $rel
            }
        }
    }
}

$manifest = Join-Path $staging 'FILE_LIST.txt'
$entries | Sort-Object | Set-Content -LiteralPath $manifest -Encoding UTF8
if ($copies -eq 0) { throw 'Не найдено ни одного материала для упаковки.' }
Compress-Archive -LiteralPath (Get-ChildItem -LiteralPath $staging | ForEach-Object FullName) -DestinationPath $archive -CompressionLevel Optimal -Force
Write-Host "`nГотово! Файлов: $copies" -ForegroundColor Green
Write-Host "Архив: $archive"
Write-Host 'Перед отправкой проверьте содержимое архива; не прикладывайте личные секреты.'
