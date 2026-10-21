# 새 윈도우 PC에서 한 번: 도구 설치 → 패키지 → 파이썬 → 악기 소리 모음 → 열쇠 확인 (맥 setup.sh와 같은 순서·같은 결과)
# 실행: 저장소 폴더의 setup.cmd (더블클릭 또는 명령 프롬프트·PowerShell에서 .\setup.cmd) - 이 스크립트만 실행 정책을 우회
# 공장 초기 PC면: winget(앱 설치 관리자)으로 git 설치 → git clone → setup.cmd. 중간에 관리자 권한(UAC) 창이 몇 번 뜸
# 다시 돌려도 됨 - 이미 있는 건 건너뜀. 공식 배포처에서만 받음 (winget, GitHub 릴리스, Hugging Face, MuseScore 미러)
# 이 파일은 UTF-8(BOM 있음)로 둘 것 - 윈도우 PowerShell 5.1은 BOM이 없으면 한글을 cp949로 읽어 깨짐
#   setup.cmd -BuildSfizz  sfizz를 맥처럼 소스에서 빌드 (MSVC Build Tools 약 5GB 설치, 브금 소리를 맥과 맞출 때)
#Requires -Version 5.1
param([switch]$BuildSfizz)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'  # PS 5.1 진행 막대가 내려받기를 몇 배 느리게 함
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location $PSScriptRoot
$SRC = Join-Path $HOME 'src'  # 직접 받은 도구 (scripts/tools.mjs·tools.py가 여기서 찾음)
$TMP = Join-Path $env:TEMP 'rmw-setup'
New-Item -ItemType Directory -Force $SRC, $TMP | Out-Null

# 외부 프로그램을 돌리고 실패하면 멈춤 (PowerShell은 exe의 종료 코드로는 안 멈춰서)
function Run([string]$exe, [string[]]$argv) {
  & $exe @argv
  if ($LASTEXITCODE -ne 0) { throw "실패 ($LASTEXITCODE): $exe $($argv -join ' ')" }
}
# 방금 설치한 프로그램이 이 창에서도 보이게 PATH 다시 읽기
function Update-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
# winget 패키지: 이미 있으면 건너뜀 ($have가 참이거나 winget 목록에 있으면)
function Need([string]$id, [scriptblock]$have = { $false }, [string[]]$extra = @()) {
  $ErrorActionPreference = 'Continue'  # PS 5.1은 리디렉트한 exe의 오류 출력 한 줄에도 멈춰서, 이 함수 안에서만
  if (& $have) { return }
  winget list --id $id -e --accept-source-agreements *> $null
  if ($LASTEXITCODE -eq 0) { return }
  Write-Host "설치: $id"
  Run winget (@('install', '--id', $id, '-e', '--silent', '--accept-source-agreements', '--accept-package-agreements') + $extra)
  Update-Path
}
# 내려받기: 윈도우 10 1803+에 든 curl.exe (PowerShell의 curl 별칭이 아니라)
function Get-File([string]$url, [string]$out) {
  Run curl.exe @('-fL', '--retry', '3', '-o', $out, $url)
}

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  throw "winget이 없음 - Microsoft Store에서 '앱 설치 관리자'(App Installer)를 설치하고 다시 실행"
}
Need 'Git.Git' { Get-Command git -ErrorAction SilentlyContinue }
Need 'OpenJS.NodeJS.LTS'
Need 'Python.Python.3.13'
Need 'Google.Chrome' { (Test-Path "$env:ProgramFiles\Google\Chrome\Application\chrome.exe") -or (Test-Path "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") }  # 렌더·캡처에 씀
Need 'Microsoft.VCRedist.2015+.x64'  # sfizz_render·rhubarb·fluidsynth가 쓰는 MSVC 런타임
Need '7zip.7zip' { Test-Path "$env:ProgramFiles\7-Zip\7z.exe" }  # 효과음 원본 .7z (윈도우 10 tar.exe가 못 풀 때, audio/make_sfx.py)
Update-Path

Run npm @('ci')
# 파이썬은 3.13으로 (맥과 같은 판)
if (-not (Test-Path .venv)) {
  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) { Run py @('-3.13', '-m', 'venv', '.venv') }
  else { Run "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe" @('-m', 'venv', '.venv') }
}
$VPY = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
Run $VPY @('-m', 'pip', 'install', '-q', 'numpy', 'onnxruntime', 'opencv-python-headless', 'pillow')
# 한글 파일·파이프를 UTF-8로 (윈도우 기본 cp949) - .venv 파이썬이 늘 -X utf8로 돌게 (scripts/win-sitecustomize.py 설명)
Copy-Item scripts\win-sitecustomize.py .venv\Lib\site-packages\sitecustomize.py -Force
# .venv 밖 파이썬(py scripts/pipeline.py 등)도 UTF-8로
[Environment]::SetEnvironmentVariable('PYTHONUTF8', '1', 'User'); $env:PYTHONUTF8 = '1'

# 옛 그림 2.5D 깊이 모델 (Depth Anything V2 Small, Apache-2.0, 약 100MB) - scripts/parallax.py
New-Item -ItemType Directory -Force models | Out-Null
if (-not (Test-Path models\depth-anything-v2-small.onnx)) {
  Get-File 'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx' models\depth-anything-v2-small.onnx
}
# 입 모양 Rhubarb Lip Sync (MIT) - audio/characters.py mouth → ~/src/rhubarb/rhubarb.exe
if (-not (Test-Path "$SRC\rhubarb\rhubarb.exe")) {
  Get-File 'https://github.com/DanielSWolf/rhubarb-lip-sync/releases/download/v1.14.0/Rhubarb-Lip-Sync-1.14.0-Windows.zip' "$TMP\rhubarb.zip"
  Expand-Archive "$TMP\rhubarb.zip" $TMP -Force
  if (Test-Path "$SRC\rhubarb") { Remove-Item "$SRC\rhubarb" -Recurse -Force }
  Move-Item "$TMP\Rhubarb-Lip-Sync-1.14.0-Windows" "$SRC\rhubarb"
}
New-Item -ItemType Directory -Force audio\sf | Out-Null
# 오케스트라 음원 VSCO 2 CE (CC0, 약 5GB, SFZ 가지) + SFZ 렌더러 sfizz (브금, audio/make_bgm.py)
if (-not (Test-Path audio\sf\vsco2)) {
  Run git @('-c', 'core.longpaths=true', 'clone', '--depth', '1', '--branch', 'SFZ', 'https://github.com/sgossner/VSCO-2-CE.git', 'audio/sf/vsco2')
}
# sfizz: 맥은 소스 빌드(최신), 윈도우는 공식 릴리스 1.2.3의 sfizz_render.exe (빌드 도구 없이) → ~/src/sfizz/bin/Release/
# 같은 곡이 맥과 소리까지 같아야 하면 MSVC Build Tools로 소스 빌드해서 SFIZZ_RENDER 환경 변수로 지정 (docs/guide/03 윈도우)
if (-not (Test-Path "$SRC\sfizz\bin\Release\sfizz_render.exe")) {
  Get-File 'https://github.com/sfztools/sfizz/releases/download/1.2.3/sfizz-1.2.3-win64.zip' "$TMP\sfizz.zip"
  Expand-Archive "$TMP\sfizz.zip" "$SRC\sfizz" -Force
}
# 합창·타이코·샤쿠하치용 fluidsynth (LGPL) - 공식 릴리스 → ~/src/fluidsynth/bin/fluidsynth.exe
if (-not (Test-Path "$SRC\fluidsynth\bin\fluidsynth.exe")) {
  Get-File 'https://github.com/FluidSynth/fluidsynth/releases/download/v2.6.1/fluidsynth-v2.6.1-win10-x64-cpp11.zip' "$TMP\fluidsynth.zip"
  Expand-Archive "$TMP\fluidsynth.zip" $TMP -Force
  if (Test-Path "$SRC\fluidsynth") { Remove-Item "$SRC\fluidsynth" -Recurse -Force }
  Move-Item "$TMP\fluidsynth-v2.6.1-win10-x64-cpp11" "$SRC\fluidsynth"
}
if ($BuildSfizz -and -not (Test-Path "$SRC\sfizz-src\build\library\bin\Release\sfizz_render.exe")) {
  Need 'Kitware.CMake'
  Need 'Microsoft.VisualStudio.2022.BuildTools' { $false } @('--override', '--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended')
  if (-not (Test-Path "$SRC\sfizz-src")) { Run git @('clone', '--depth', '1', '--recursive', 'https://github.com/sfztools/sfizz.git', "$SRC\sfizz-src") }
  Run cmake @('-S', "$SRC\sfizz-src", '-B', "$SRC\sfizz-src\build", '-G', 'Visual Studio 17 2022', '-A', 'x64', '-DSFIZZ_RENDER=ON', '-DSFIZZ_JACK=OFF', '-DSFIZZ_LV2=OFF', '-DSFIZZ_VST=OFF', '-DSFIZZ_AU=OFF', '-DSFIZZ_TESTS=OFF', '-DSFIZZ_BENCHMARKS=OFF', '-DSFIZZ_DEMOS=OFF', '-DSFIZZ_DEVTOOLS=OFF')
  Run cmake @('--build', "$SRC\sfizz-src\build", '--config', 'Release', '--target', 'sfizz_render', '-j', '8')
}
if ($BuildSfizz) {  # 빌드한 것을 쓰게 (scripts/tools.*가 SFIZZ_RENDER를 먼저 봄)
  $exe = "$SRC\sfizz-src\build\library\bin\Release\sfizz_render.exe"
  if (-not (Test-Path $exe)) { throw "sfizz 빌드 결과가 없음: $exe (빌드 출력에서 sfizz_render.exe 위치 확인 후 SFIZZ_RENDER 환경 변수로)" }
  [Environment]::SetEnvironmentVariable('SFIZZ_RENDER', $exe, 'User'); $env:SFIZZ_RENDER = $exe
}
if (-not (Test-Path audio\sf\MuseScore_General.sf2)) {
  Get-File 'https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf2' audio\sf\MuseScore_General.sf2
}
$HWM = if ($env:HWM) { $env:HWM } else { Join-Path $HOME 'hwm' }
foreach ($d in '영상', '쇼츠', '배너', '홍보', '브금', 'tts') { New-Item -ItemType Directory -Force (Join-Path $HWM $d) | Out-Null }
Write-Host ''
foreach ($f in 'client_secret.json', 'token.json', 'tts_key.txt', 'gemini_key.txt') {
  if (Test-Path "secrets\$f") { Write-Host "열쇠 있음: secrets\$f" } else { Write-Host "열쇠 없음: secrets\$f  ← 받은 파일을 넣을 것 (git에 안 올림)" }
}
# 채널 브금 14곡 렌더 (git에 안 올림)
if (-not (Get-ChildItem public\bgm\*.wav -ErrorAction SilentlyContinue)) { Run $VPY @('-I', 'audio/make_bgm.py') }
# 시네마틱 장면(실제 지형 위 비행, blender/render_shot.py) - Blender (무료, GPL)
Need 'BlenderFoundation.Blender' { Test-Path "$env:ProgramFiles\Blender Foundation\Blender*\blender.exe" }
# 효과음 원본 녹음 (CC0·퍼블릭 도메인·CC BY, 약 600MB, git 제외) - audio/make_sfx.py
Run $VPY @('-I', 'audio/make_sfx.py', 'fetch')
# 시네마틱 근경 고도·하늘 HDRI는 처음 렌더 때 blender/가 받아 data/geo/에 둔다
Write-Host ''
Write-Host '찾은 도구 위치 (없음이 있으면 docs/guide/03 윈도우 참고):'
Run node @('scripts/tools.mjs')
Run $VPY @('-I', 'scripts/tools.py')
Write-Host "지도 캡처가 필요하면 사이트 저장소(chronomap)를 받아 'npx next dev' 후 SITE=http://localhost:3000 으로 scripts/clean.mjs 실행"
Write-Host '준비 끝 - docs/guide/ 부터 읽기. 새 PowerShell 창을 열어야 PATH가 모두 반영됨'
