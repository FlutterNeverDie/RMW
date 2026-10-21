# 외부 프로그램 위치 - OS마다(맥·윈도우) 기본 자리, 환경 변수로 덮어쓰기. Node 쪽은 scripts/tools.mjs (같은 규칙)
#   python3 scripts/tools.py      찾은 위치와 있는지 표 (새 PC 확인용)
# 쓰는 쪽: sys.path.insert(0, <scripts 폴더>) 후 import tools  (-I로 돌면 스크립트 폴더가 경로에 없어서)
# 환경 변수: HWM RMW_PYTHON CHROME BLENDER SFIZZ_RENDER RHUBARB FLUIDSYNTH
import os
import platform
import shutil
import sys
from pathlib import Path

WIN = os.name == "nt"
MAC = sys.platform == "darwin"
CODE = Path(__file__).resolve().parent.parent
SRC = Path.home() / "src"  # 직접 받은·빌드한 도구 (setup.sh·setup.ps1)


def _env(k):
    return os.environ.get(k) or None


def _first(*c):
    """후보 중 있는 첫 자리, 없으면 첫 후보 (없다는 오류가 그 경로로 나오게)"""
    c = [Path(p) for p in c if p]
    return next((p for p in c if p.exists()), c[0] if c else None)


def _which(name):
    p = shutil.which(name)
    return Path(p) if p else None


def _win_roots():
    """윈도우 Program Files 아래 (64비트·32비트·사용자 설치)"""
    return [Path(r) for r in (_env("ProgramFiles"), _env("ProgramFiles(x86)"), _env("LOCALAPPDATA")) if r]


def hwm_home():
    return Path(_env("HWM") or Path.home() / "hwm")  # 산출물 폴더 (저장소 위치와 상관없이)


def python():
    return Path(_env("RMW_PYTHON") or CODE / (".venv/Scripts/python.exe" if WIN else ".venv/bin/python"))


def node():
    return str(_which("node") or "node")


def remotion(*a):
    """npx remotion 대신 노드로 바로 (윈도우 npx.cmd는 cmd를 거쳐 따옴표·한글 경로가 깨짐)"""
    return [node(), str(CODE / "node_modules/@remotion/cli/remotion-cli.js"), *map(str, a)]


def chrome():
    if _env("CHROME"):
        return Path(_env("CHROME"))
    if WIN:
        return _first(*(r / "Google/Chrome/Application/chrome.exe" for r in _win_roots()))
    if MAC:
        return Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    return _first("/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium")


def _ver(p):
    """'Blender 4.5' → (4, 5) - 가장 새 버전 고르기"""
    return tuple(int(x) for x in "".join(ch if ch.isdigit() else " " for ch in p.parent.name).split())


def blender():
    if _env("BLENDER"):
        return Path(_env("BLENDER"))
    if MAC:
        return Path("/Applications/Blender.app/Contents/MacOS/Blender")
    if WIN:  # "Blender Foundation/Blender 4.5/blender.exe"처럼 버전 폴더 - 가장 새 것
        found = [p for r in _win_roots() for p in (r / "Blender Foundation").glob("Blender*/blender.exe")]
        if found:
            return max(found, key=_ver)
        return _which("blender") or Path(_env("ProgramFiles") or "C:/Program Files") / "Blender Foundation/Blender/blender.exe"
    return _which("blender") or Path("blender")


def sfizz_render():
    """맥은 ~/src/sfizz 소스 빌드, 윈도우는 공식 릴리스 zip을 ~/src/sfizz 에 (bin/Release/sfizz_render.exe)"""
    if _env("SFIZZ_RENDER"):
        return Path(_env("SFIZZ_RENDER"))
    if WIN:
        return _first(SRC / "sfizz/bin/Release/sfizz_render.exe", SRC / "sfizz/build/library/bin/Release/sfizz_render.exe", _which("sfizz_render"))
    return SRC / "sfizz/build/library/bin/sfizz_render"


def rhubarb():
    return Path(_env("RHUBARB") or SRC / "rhubarb" / ("rhubarb.exe" if WIN else "rhubarb"))


def fluidsynth():
    """맥은 Homebrew(PATH), 윈도우는 공식 릴리스 zip을 ~/src/fluidsynth 에, 없으면 PATH"""
    if _env("FLUIDSYNTH"):
        return _env("FLUIDSYNTH")
    if WIN:
        return str(_first(SRC / "fluidsynth/bin/fluidsynth.exe", _which("fluidsynth")))
    return "fluidsynth"


def _arch():
    m = platform.machine().lower()
    return {"amd64": "x64", "x86_64": "x64", "aarch64": "arm64"}.get(m, m)


def ffmpeg_dir():
    """Remotion에 든 ffmpeg 폴더 - compositor-darwin-arm64, compositor-win32-x64-msvc, compositor-linux-x64-gnu"""
    pre = f"compositor-{sys.platform}-{_arch()}"
    base = CODE / "node_modules/@remotion"
    return next((d for d in sorted(base.glob(pre + "*")) if d.name == pre or d.name.startswith(pre + "-")), None)


def ffmpeg(tool="ffmpeg"):
    """Remotion에 든 ffmpeg·ffprobe 실행 파일 (없으면 None) - 맥은 옆의 libav*.dylib를 찾게 cwd=ffmpeg_dir()로 돌린다"""
    d = ffmpeg_dir()
    b = d / (tool + ".exe" if WIN else tool) if d else None
    return b if b and b.exists() else None


def tar():
    """zip·7z 풀기: 맥 bsdtar. 윈도우도 System32\\tar.exe가 bsdtar (Git의 GNU tar가 PATH에 앞서 있어도 이걸로)"""
    if WIN:
        t = Path(_env("SystemRoot") or "C:/Windows") / "System32/tar.exe"
        return str(t) if t.exists() else "tar"
    return "tar"


def sevenzip():
    """윈도우 10의 tar.exe가 7z를 못 풀 때 쓰는 7-Zip (setup.ps1이 설치), 없으면 None"""
    if not WIN:
        return None
    p = _first(*(r / "7-Zip/7z.exe" for r in _win_roots()), _which("7z"))
    return p if p and p.exists() else None


if __name__ == "__main__":
    rows = {"hwm_home": hwm_home(), "python": python(), "node": node(), "remotion": remotion()[1], "chrome": chrome(), "blender": blender(),
            "sfizz_render": sfizz_render(), "rhubarb": rhubarb(), "fluidsynth": fluidsynth(), "ffmpeg": ffmpeg(), "tar": tar()}
    if WIN:
        rows["7z"] = sevenzip()
    for k, v in rows.items():
        ok = v is not None and (Path(v).exists() or shutil.which(str(v)))
        print(f"{'있음' if ok else '없음'}  {k:12} {v}")
