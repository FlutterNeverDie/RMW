# 윈도우 전용: setup.ps1이 .venv\Lib\site-packages\sitecustomize.py 로 복사한다 (맥에는 안 깔림)
# 윈도우 파이썬은 파일·파이프를 기본으로 cp949(한국어 윈도우)로 읽고 써서, 한글 장면표·JSON 출력이 깨진다
# UTF-8 모드(-X utf8)가 아니면 같은 인자에 -X utf8을 붙여 한 번 다시 띄우고 그 종료 코드로 끝낸다
# (-I로 돌려도 PYTHONUTF8 환경 변수는 무시되지만 sitecustomize는 읽힘. os.execv는 윈도우에서 부모가 먼저 끝나 게이트가 깨져서 안 씀)
import os
import subprocess
import sys

if os.name == "nt":
    if sys.flags.utf8_mode:
        os.environ.pop("RMW_UTF8_REEXEC", None)  # 이 프로세스가 띄우는 파이썬도 다시 검사하게
    elif not os.environ.get("RMW_UTF8_REEXEC"):  # 표시가 있는데도 UTF-8 모드가 아니면 그냥 진행 (무한 반복 방지)
        try:
            rc = subprocess.run([sys.executable, "-X", "utf8", *sys.orig_argv[1:]], env={**os.environ, "RMW_UTF8_REEXEC": "1"}).returncode
        except KeyboardInterrupt:
            rc = 130
        os._exit(rc)
