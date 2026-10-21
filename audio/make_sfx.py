# 해설 영상 효과음: 실제 녹음(CC0·퍼블릭 도메인·CC BY)을 다듬어 public/sfx/ep/<이름>.wav 로 만든다
#   .venv/bin/python -I audio/make_sfx.py fetch      원본 받기 (audio/sfx-src/, git 제외 - setup.sh·setup.ps1이 부름)
#   .venv/bin/python -I audio/make_sfx.py            전부 다시 만들기 (같은 입력이면 같은 결과 - 난수 씨앗 고정)
#   .venv/bin/python -I audio/make_sfx.py gallop boom   몇 개만
#   .venv/bin/python -I audio/make_sfx.py takes <파일>  녹음 안의 조각(테이크) 위치 보기 - 레시피 고를 때
# 원본이 없으면(받기 전) 예전 합성 소리로 대신 만든다 (swish·whoosh·boom·impact·hit·tick·drum)
# 마감 기준: 48 kHz 16비트 스테레오, 최고점 -3 dBFS, 가장 큰 0.4초 구간 RMS -16 dBFS(배경 반복음은 -20) - 둘 중 먼저 닿는 쪽
# 출처·라이선스: public/sfx/credits.json (영상 설명란 표기가 필요한 CC BY 목록 포함), audio/sfx-src/credits.json
import hashlib, json, subprocess, sys, wave, zlib
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "audio/sfx-src"
EXT = SRC / "_x"          # 압축 푼 곳
CACHE = SRC / "_cache"    # 48k로 푼 wav
VSCO = ROOT / "audio/sf/vsco2"
OUT = ROOT / "public/sfx/ep"
CREDITS = ROOT / "public/sfx/credits.json"
sys.path.insert(0, str(ROOT / "scripts"))
import tools  # noqa: E402 - 외부 프로그램 위치 (맥·윈도우)

FF = tools.ffmpeg_dir()  # Remotion에 딸린 ffmpeg (scripts/loudness.py와 같은 것)
SR = 48000
PEAK_DB, RMS_DB, BED_RMS_DB = -3.0, -16.0, -20.0

CC0 = "CC0 1.0"
PD_US = "Public domain (미국 연방정부 저작물 - NPS)"
PD = "Public domain"
BY3, BY4 = "CC BY 3.0", "CC BY 4.0"

# ---------------------------------------------------------------- 원본 목록 (공식 배포처만)
# key: 원본 이름. file: audio/sfx-src 아래 경로. url: 받는 곳. page: 설명·라이선스 페이지
OGA = "https://opengameart.org/sites/default/files/"
NPS = "https://www.nps.gov/nps-audiovideo/legacy/mp3/"
SOURCES = {
    # Kenney (CC0)
    "kenney-impact": dict(file="kenney/kenney_impact-sounds.zip", url="https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip", page="https://kenney.nl/assets/impact-sounds", license=CC0, author="Kenney (kenney.nl)"),
    "kenney-rpg": dict(file="kenney/kenney_rpg-audio.zip", url="https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip", page="https://kenney.nl/assets/rpg-audio", license=CC0, author="Kenney (kenney.nl)"),
    # Still North Media (CC0, 전문 녹음 192 kHz/24비트) - OpenGameArt 배포
    "snm-weapons1": dict(file="oga/medieval_sfx_weapon_on_weapon_1_of_2.7z", url=OGA + "medieval_sfx_weapon_on_weapon_1_of_2.7z", page="https://opengameart.org/content/medieval-sound-effects-weapon-impacts", license=CC0, author="Still North Media"),
    "snm-weapons2": dict(file="oga/medieval_sfx_weapon_on_weapon_2_of_2.7z", url=OGA + "medieval_sfx_weapon_on_weapon_2_of_2.7z", page="https://opengameart.org/content/medieval-sound-effects-weapon-impacts", license=CC0, author="Still North Media"),
    "snm-textures1": dict(file="oga/medieval_sfx_textures_1_of_2.7z", url=OGA + "medieval_sfx_textures_1_of_2.7z", page="https://opengameart.org/content/medieval-sound-effects-weapon-textures", license=CC0, author="Still North Media"),
    "snm-textures2": dict(file="oga/medieval_sfx_textures_2_of_2.7z", url=OGA + "medieval_sfx_textures_2_of_2.7z", page="https://opengameart.org/content/medieval-sound-effects-weapon-textures", license=CC0, author="Still North Media"),
    "firearms": dict(file="oga/Prepared SFX Library.7z", url=OGA + "Prepared%20SFX%20Library.7z", page="https://opengameart.org/content/the-free-firearm-sound-library", license=CC0, author="The Free Firearm Sound Library (Still North Media)"),
    # OpenGameArt CC0
    "oga-wood": dict(file="oga/independent_nu_ljudbank-wood_crack_hit_destruction.7z", url=OGA + "independent_nu_ljudbank-wood_crack_hit_destruction.7z", page="https://opengameart.org/content/35-wooden-crackshitsdestructions", license=CC0, author="qubodup / independent.nu ljudbank"),
    "oga-breaking": dict(file="oga/sfx_breaking_and_falling.zip", url=OGA + "sfx_breaking_and_falling.zip", page="https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx", license=CC0, author="rubberduck"),
    "oga-swishes": dict(file="oga/swishes.zip", url=OGA + "swishes.zip", page="https://opengameart.org/content/swishes-sound-pack", license=CC0, author="artisticdude"),
    "oga-airmove": dict(file="oga/air_move.wav", url=OGA + "air_move.wav", page="https://opengameart.org/content/air-woosh-move", license=CC0, author="Almitory"),
    "oga-crowd": dict(file="oga/crowd_shouting_0.ogg", url=OGA + "crowd_shouting_0.ogg", page="https://opengameart.org/content/crowd-shoutingspeaking-ambience", license=CC0, author="StarNinjas"),
    "oga-books": dict(file="oga/book_flips_-_starninjas.zip", url=OGA + "book_flips_-_starninjas.zip", page="https://opengameart.org/content/10-book-page-flips", license=CC0, author="StarNinjas"),
    "oga-coins": dict(file="oga/coins_-_starninjas.zip", url=OGA + "coins_-_starninjas.zip", page="https://opengameart.org/content/12-coin-sound-effects", license=CC0, author="StarNinjas"),
    "oga-goldsack": dict(file="oga/gold_sack.wav", url=OGA + "gold_sack.wav", page="https://opengameart.org/content/sack-of-gold", license=CC0, author="Amarikah"),
    "oga-fire1": dict(file="oga/fire-1.wav", url=OGA + "fire-1.wav", page="https://opengameart.org/content/fire-crackling", license=CC0, author="AntumDeluge"),
    "oga-fireplace": dict(file="oga/fire.wav", url=OGA + "fire.wav", page="https://opengameart.org/content/fireplace-sound-loop", license=CC0, author="PagDev"),
    "oga-rainthunder": dict(file="oga/rain-thunder.ogg", url=OGA + "rain-thunder.ogg", page="https://opengameart.org/content/rain-long-thunder", license=CC0, author="WuxiaScrub"),
    "oga-cannon": dict(file="oga/cannon_fire_0.ogg", url=OGA + "cannon_fire_0.ogg", page="https://opengameart.org/content/cannon-fire", license=CC0, author="Thimras"),
    "oga-wardrums": dict(file="oga/horde_war_drums_by_william_hector.wav", url=OGA + "horde_war_drums_by_william_hector.wav", page="https://opengameart.org/content/horde-war-drums-loop", license=CC0, author="William Hector"),
    "oga-wind": dict(file="oga/wind.zip", url=OGA + "wind.zip", page="https://opengameart.org/content/wind", license=CC0, author="IgnasD"),
    # OpenGameArt CC BY (영상 설명란에 표기 필요)
    "oga-gallop": dict(file="oga-by/gallop.zip", url=OGA + "gallop.zip", page="https://opengameart.org/content/horse-gallop-loop", license=BY3, author="Alan McKinney (alanmcki), loop by AntumDeluge"),
    "oga-gallops": dict(file="oga-by/archive_2.zip", url=OGA + "archive_2.zip", page="https://opengameart.org/content/horse-gallop-on-different-surfaces", license=BY4, author="congusbongus (원본: D4XX·StephenSaldanha CC0 등 freesound)"),
    "oga-archers": dict(file="oga-by/Archers-shooting.flac", url=OGA + "Archers-shooting.flac", page="https://opengameart.org/content/archers-shooting", license=BY3, author="copyc4t (Paolo D'Emilio), from OpenGameArt"),
    "oga-explosions": dict(file="oga-by/explosions.7z", url=OGA + "explosions.7z", page="https://opengameart.org/content/2-high-quality-explosions", license=BY3, author="Michel Baradari (apollo-music.de), via qubodup"),
    "oga-engine": dict(file="oga-by/engine_heavy_loop_0.wav", url=OGA + "engine_heavy_loop_0.wav", page="https://opengameart.org/content/engine-loop-heavy-vehicletank", license=BY3, author="Nayckron"),
    "oga-paper": dict(file="oga-by/paper_pages.flac", url=OGA + "paper_pages.flac", page="https://opengameart.org/content/paper-pages-sounds", license=BY3, author="Vinrax"),
    "oga-footsteps": dict(file="oga-by/footsteps_0.zip", url=OGA + "footsteps_0.zip", page="https://opengameart.org/content/footsteps-on-different-surfaces", license=BY3, author="congusbongus (gravel: Ali_6868 CC0)"),
    # 미국 국립공원관리청 NPS (연방정부 저작물 = 퍼블릭 도메인)
    "nps-battle": dict(file="nps/nri-battlesounds.mp3", url=NPS + "nri/avElement/nri-battlesounds.mp3", page="https://www.nps.gov/subjects/sound/sounds-battle.htm", license=PD_US, author="NPS (Cedar Creek 전투 재현)"),
    "nps-musket": dict(file="nps/nri-MusketFireMIMA.mp3", url=NPS + "nri/avElement/nri-MusketFireMIMA.mp3", page="https://www.nps.gov/subjects/sound/sounds-musket.htm", license=PD_US, author="NPS"),
    "nps-thunder": dict(file="nps/nri-Thunder.mp3", url=NPS + "nri/avElement/nri-Thunder.mp3", page="https://www.nps.gov/subjects/sound/sounds-thunder.htm", license=PD_US, author="NPS"),
    "nps-wolf": dict(file="nps/nri-WolfDENA.mp3", url=NPS + "nri/avElement/nri-WolfDENA.mp3", page="https://www.nps.gov/subjects/sound/sounds-wolf.htm", license=PD_US, author="NPS"),
    "nps-wolves": dict(file="nps/yell-YELLWolvesDec252013.mp3", url=NPS + "imr/avElement/yell-YELLWolvesDec252013.mp3", page="https://www.nps.gov/yell/learn/photosmultimedia/sounds-wolves.htm", license=PD_US, author="NPS / Yellowstone"),
    "nps-fire": dict(file="nps/yell-YELLMapleFire20160814T08ms.mp3", url=NPS + "imr/avElement/yell-YELLMapleFire20160814T08ms.mp3", page="https://www.nps.gov/yell/learn/photosmultimedia/sounds-fire.htm", license=PD_US, author="NPS / Yellowstone (Maple Fire 2016)"),
    "nps-thunder2": dict(file="nps/yell-Thunderandbirds140704.mp3", url=NPS + "imr/avElement/yell-Thunderandbirds140704.mp3", page="https://www.nps.gov/yell/learn/photosmultimedia/sounds-thunder.htm", license=PD_US, author="NPS / Yellowstone"),
    # Wikimedia Commons (CC0·PD 확인한 것만, freesound CC0 옮긴 것 포함)
    "wc-wolf": dict(file="commons/Wolf_howls.ogg", url="https://upload.wikimedia.org/wikipedia/commons/8/87/Wolf_howls.ogg", page="https://commons.wikimedia.org/wiki/File:Wolf_howls.ogg", license=PD, author="Wikimedia Commons"),
    "wc-neigh": dict(file="commons/Wiehern.ogg", url="https://upload.wikimedia.org/wikipedia/commons/d/db/Wiehern.ogg", page="https://commons.wikimedia.org/wiki/File:Wiehern.ogg", license=PD, author="Hü. (Wikimedia Commons)"),
    "wc-notredame": dict(file="commons/2011_Christmas_bells_at_Notre-Dame_de_Paris_(excerpt).wav", url="https://upload.wikimedia.org/wikipedia/commons/0/04/2011_Christmas_bells_at_Notre-Dame_de_Paris_%28excerpt%29.wav", page="https://commons.wikimedia.org/wiki/File:2011_Christmas_bells_at_Notre-Dame_de_Paris_(excerpt).wav", license=CC0, author="Mxsmanic"),
    "wc-glocke": dict(file="commons/Große-Glocke-nm.flac", url="https://upload.wikimedia.org/wikipedia/commons/1/12/Gro%C3%9Fe-Glocke-nm.flac", page="https://commons.wikimedia.org/wiki/File:Gro%C3%9Fe-Glocke-nm.flac", license=CC0, author="Rockhunt2000"),
    "wc-gong": dict(file="commons/240382_the-very-real-horst_chinese-gong-finish-session-2014-06-10-29-143.wav", url="https://upload.wikimedia.org/wikipedia/commons/1/16/240382_the-very-real-horst_chinese-gong-finish-session-2014-06-10-29-143.wav", page="https://commons.wikimedia.org/wiki/File:240382_the-very-real-horst_chinese-gong-finish-session-2014-06-10-29-143.wav", license=CC0, author="the_very_Real_Horst (freesound 240382)"),
    "wc-crowd": dict(file="commons/360703_eguobyte_large-crowd-medium-distance-stereo.wav", url="https://upload.wikimedia.org/wikipedia/commons/a/a9/360703_eguobyte_large-crowd-medium-distance-stereo.wav", page="https://commons.wikimedia.org/wiki/File:360703_eguobyte_large-crowd-medium-distance-stereo.wav", license=CC0, author="eguobyte (freesound 360703)"),
    "wc-war": dict(file="commons/Dragout_-_War_sounds_(cc0)_(freesound).ogg", url="https://upload.wikimedia.org/wikipedia/commons/1/11/Dragout_-_War_sounds_%28cc0%29_%28freesound%29.ogg", page="https://commons.wikimedia.org/wiki/File:Dragout_-_War_sounds_(cc0)_(freesound).ogg", license=CC0, author="Dragout (freesound)"),
    "wc-lubeck": dict(file="commons/200830_bigben12345_lubeck-domglocken.wav", url="https://upload.wikimedia.org/wikipedia/commons/5/5a/200830_bigben12345_lubeck-domglocken.wav", page="https://commons.wikimedia.org/wiki/File:200830_bigben12345_lubeck-domglocken.wav", license=CC0, author="BIGBEN12345 (freesound 200830)"),
    "wc-braam": dict(file="commons/647712_unfa_braam.flac", url="https://upload.wikimedia.org/wikipedia/commons/1/1c/647712_unfa_braam.flac", page="https://commons.wikimedia.org/wiki/File:647712_unfa_braam.flac", license=CC0, author="unfa (freesound 647712)"),
    "wc-wind": dict(file="commons/Joseph_SARDIN_-_Vent.ogg", url="https://upload.wikimedia.org/wikipedia/commons/b/be/Joseph_SARDIN_-_Vent.ogg", page="https://commons.wikimedia.org/wiki/File:Joseph_SARDIN_-_Vent.ogg", license=CC0, author="Joseph SARDIN (LaSonotheque.org / BigSoundBank)"),
    "wc-horseshoes": dict(file="commons/WWS_Clatterofhorseshoesonthepavement.ogg", url="https://upload.wikimedia.org/wikipedia/commons/6/60/WWS_Clatterofhorseshoesonthepavement.ogg", page="https://commons.wikimedia.org/wiki/File:WWS_Clatterofhorseshoesonthepavement.ogg", license=BY4, author="Work With Sounds / Museum of Municipal Engineering (Kraków)"),
    # 브금과 같은 오케스트라 녹음 VSCO 2 CE (CC0) - setup.sh가 audio/sf/vsco2 에 받음
    "vsco": dict(file=None, url="https://github.com/sgossner/VSCO-2-CE", page="https://github.com/sgossner/VSCO-2-CE", license=CC0, author="Versilian Studios (VSCO 2 Community Edition)"),
}
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) RMW-sfx/1.0 (+https://historymapworld.com)"


def fetch():
    for key, s in SOURCES.items():
        if not s["file"]:
            continue
        p = SRC / s["file"]
        if p.exists() and p.stat().st_size > 0:
            continue
        p.parent.mkdir(parents=True, exist_ok=True)
        print("받는 중", key, s["url"])
        r = subprocess.run(["curl", "-fsSL", "-A", UA, "-o", str(p), s["url"]])
        if r.returncode:
            p.unlink(missing_ok=True)
            print("  못 받음 - 이 원본을 쓰는 소리는 건너뜀(또는 합성으로 대신)")
    # 받은 원본 목록 + 라이선스
    SRC.mkdir(parents=True, exist_ok=True)
    (SRC / "credits.json").write_text(json.dumps({k: {kk: v for kk, v in s.items()} for k, s in SOURCES.items()}, ensure_ascii=False, indent=1))


# ---------------------------------------------------------------- 읽기
def _extract(key):
    s = SOURCES[key]
    p = SRC / s["file"]
    if not p.exists():
        raise FileNotFoundError(p)
    if p.suffix.lower() not in (".zip", ".7z"):
        return p
    d = EXT / key
    if not d.exists():
        d.mkdir(parents=True)
        z = tools.sevenzip() if p.suffix.lower() == ".7z" else None  # 윈도우 10 tar.exe는 7z를 못 풀 수 있어 7-Zip으로
        if z:
            subprocess.run([str(z), "x", "-y", f"-o{d}", str(p)], check=True, stdout=subprocess.DEVNULL)
        else:
            subprocess.run([tools.tar(), "-xf", str(p), "-C", str(d)], check=True)  # macOS bsdtar는 zip·7z 모두 품
    return d


def path(key, name=None):
    if key == "vsco":
        return VSCO / name
    base = _extract(key)
    if name is None:
        return base
    hits = sorted(q for q in base.rglob("*") if q.is_file() and q.name == name)
    if not hits:
        raise FileNotFoundError(f"{key}: {name}")
    return hits[0]


def load(key, name=None):
    """원본을 48 kHz 스테레오 float로"""
    return load_path(path(key, name))


def load_path(p):
    """아무 소리 파일이나 ffmpeg로 48 kHz 24비트로 풀어 _cache에 두고 읽음"""
    CACHE.mkdir(parents=True, exist_ok=True)
    h = hashlib.sha1(f"{p}:{p.stat().st_size}".encode()).hexdigest()[:16]
    c = CACHE / f"{h}.wav"
    if not c.exists():
        subprocess.run([str(tools.ffmpeg()), "-v", "error", "-y", "-i", str(p), "-c:a", "pcm_s24le", "-ac", "2", "-ar", str(SR), str(c)], cwd=FF, check=True)
    with wave.open(str(c)) as w:
        b = np.frombuffer(w.readframes(w.getnframes()), np.uint8).reshape(-1, 3).astype(np.int32)
    v = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)
    v = np.where(v >= 1 << 23, v - (1 << 24), v)
    return (v / float(1 << 23)).reshape(-1, 2)


# ---------------------------------------------------------------- 다듬기 도구
def sec(t):
    return int(round(t * SR))


def cut(x, a, b=None):
    return x[sec(a): (sec(b) if b is not None else None)].copy()


def db(v):
    return 10 ** (v / 20)


def mono(x):
    return x.mean(1) if x.ndim == 2 else x


def stereo(x):
    return np.stack([x, x], 1) if x.ndim == 1 else x


def env_rms(x, win=0.01):
    m = mono(x) ** 2
    w = max(1, sec(win))
    n = len(m) // w
    return np.sqrt(m[: n * w].reshape(n, w).mean(1) + 1e-20)


def takes(x, thr=-38, gap=0.12, pre=0.01, tail=-58):
    """녹음 안의 조각들: 최고점 기준 thr dB 넘는 곳에서 시작, tail dB 밑으로 gap초 이상 떨어지면 끝"""
    e = env_rms(x)
    ref = e.max()
    loud = 20 * np.log10(e / ref) > thr
    quiet = 20 * np.log10(e / ref) < tail
    out, i, n = [], 0, len(e)
    g = int(gap / 0.01)
    while i < n:
        if not loud[i]:
            i += 1
            continue
        a = max(0, i - int(pre / 0.01))
        j = i
        while j < n and not (quiet[j: j + g].all() and len(quiet[j: j + g]) == g):
            j += 1
        out.append((a * 0.01, min(n, j) * 0.01))
        i = j + g
    return out


def take(x, k, **kw):
    t = takes(x, **kw)
    a, b = t[k % len(t)]
    return cut(x, a, b)


def trim(x, thr=-60):
    e = env_rms(x, 0.005)
    keep = np.nonzero(20 * np.log10(e / e.max()) > thr)[0]
    if len(keep) == 0:
        return x
    a, b = keep[0] * sec(0.005), (keep[-1] + 1) * sec(0.005)
    return x[max(0, a - sec(0.003)): b]


def fade(x, fi=0.004, fo=0.05):
    x = stereo(x).copy()
    a, b = min(len(x), sec(fi)), min(len(x), sec(fo))
    if a:
        x[:a] *= np.linspace(0, 1, a)[:, None] ** 2
    if b:
        x[-b:] *= np.linspace(1, 0, b)[:, None] ** 2
    return x


def _shape(x, H):
    x = stereo(x)
    n = len(x) + sec(0.5)
    n = 1 << int(np.ceil(np.log2(n)))
    X = np.fft.rfft(x, n, axis=0)
    return np.fft.irfft(X * H[:, None], n, axis=0)[: len(x)]


def lp(x, fc, order=2):
    n = 1 << int(np.ceil(np.log2(len(x) + sec(0.5))))
    f = np.fft.rfftfreq(n, 1 / SR)
    return _shape(x, 1 / np.sqrt(1 + (f / fc) ** (2 * order)))


def hp(x, fc, order=2):
    n = 1 << int(np.ceil(np.log2(len(x) + sec(0.5))))
    f = np.fft.rfftfreq(n, 1 / SR) + 1e-6
    return _shape(x, 1 / np.sqrt(1 + (fc / f) ** (2 * order)))


def shelf(x, fc, gain_db):
    """fc 아래를 gain_db만큼 (낮은 소리 두껍게·얇게)"""
    n = 1 << int(np.ceil(np.log2(len(x) + sec(0.5))))
    f = np.fft.rfftfreq(n, 1 / SR)
    w = 1 / np.sqrt(1 + (f / fc) ** 4)
    return _shape(x, 1 + (db(gain_db) - 1) * w)


def speed(x, r):
    """r배 빠르게 (음높이도 같이 - 테이프처럼). r<1이면 낮고 길어짐"""
    x = stereo(x)
    if r > 1:
        x = lp(x, 0.45 * SR / r, 4)
    n = int(len(x) / r)
    t = np.arange(n) * r
    return np.stack([np.interp(t, np.arange(len(x)), x[:, c]) for c in range(2)], 1)


def pan(x, p):
    """p: -1(왼쪽) ~ 1(오른쪽), 같은 힘 팬"""
    m = mono(x)
    a = (p + 1) * np.pi / 4
    return np.stack([m * np.cos(a), m * np.sin(a)], 1) * np.sqrt(2)


def width(x, w):
    """스테레오 폭 (0=모노, 1=그대로, 1.5=넓게)"""
    x = stereo(x)
    mid, side = x.mean(1), (x[:, 0] - x[:, 1]) / 2
    return np.stack([mid + side * w, mid - side * w], 1)


def reverb(x, t60=1.6, mix=0.25, pre=0.02, seed=1, bright=5000):
    """공간 울림: 왼·오른쪽이 서로 다른 감쇠 잡음으로 컨볼루션 (모노 녹음도 자연스럽게 퍼짐)"""
    x = stereo(x)
    g = np.random.default_rng(seed)
    n = sec(t60 * 1.2)
    t = np.arange(n) / SR
    decay = np.exp(-6.9 * t / t60)
    ir = g.standard_normal((n, 2)) * decay[:, None]
    ir = lp(ir, bright, 1)
    ir = np.concatenate([np.zeros((sec(pre), 2)), ir])
    ir /= np.sqrt((ir ** 2).sum(0, keepdims=True)) + 1e-9
    m = len(x) + len(ir)
    N = 1 << int(np.ceil(np.log2(m)))
    wet = np.fft.irfft(np.fft.rfft(x, N, axis=0) * np.fft.rfft(ir, N, axis=0), N, axis=0)[:m]
    dry = np.concatenate([x, np.zeros((len(ir), 2))])
    return dry * (1 - mix) + wet * mix * 1.4


def norm(x, peak=0.0):
    return x / (np.abs(x).max() + 1e-12) * db(peak)


def mix(*parts, length=None):
    """parts: (소리, 시작초, 크기dB) 를 겹친다"""
    end = max(sec(t) + len(stereo(s)) for s, t, _ in parts)
    out = np.zeros((length and sec(length) or end, 2))
    for s, t, g in parts:
        s = stereo(s)
        a = sec(t)
        b = min(len(out), a + len(s))
        if b > a:
            out[a:b] += s[: b - a] * db(g)
    return out


def loop(x, xf=0.6):
    """끝과 처음을 xf초 겹쳐서 이음매 없이 반복되게 (길이는 xf만큼 짧아짐)"""
    x = stereo(x)
    k = sec(xf)
    a = np.sin(np.linspace(0, np.pi / 2, k))[:, None]
    head, body, tail = x[:k], x[k:-k], x[-k:]
    return np.concatenate([body, tail * np.cos(np.linspace(0, np.pi / 2, k))[:, None] + head * a])


def rng(name):
    return np.random.default_rng(zlib.crc32(name.encode()))


# ---------------------------------------------------------------- 마감·저장
def finish(x, bed=False, looped=False, fi=0.003, fo=0.08):
    x = stereo(x)
    x = x - x.mean(0, keepdims=True)
    if not looped:
        x = fade(trim(x), fi, fo)
    w = sec(0.4)
    m = mono(x)
    if len(m) > w:
        c = np.cumsum(np.concatenate([[0], m ** 2]))
        rms = np.sqrt((c[w:] - c[:-w]).max() / w)
    else:
        rms = np.sqrt((m ** 2).mean())
    g = min(db(PEAK_DB) / (np.abs(x).max() + 1e-12), db(BED_RMS_DB if bed else RMS_DB) / (rms + 1e-12))
    return x * g


def save(name, x):
    OUT.mkdir(parents=True, exist_ok=True)
    x = stereo(x)
    d = rng(name).triangular(-1, 0, 1, x.shape) / 32768  # TPDF 디더
    y = np.clip(np.round((x + d) * 32767), -32768, 32767).astype("<i2")
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(y.tobytes())
    m = mono(x)
    print(f"{name:14s} {len(x) / SR:6.2f}s  최고 {20 * np.log10(np.abs(x).max() + 1e-12):5.1f} dBFS  RMS {20 * np.log10(np.sqrt((m ** 2).mean()) + 1e-12):6.1f} dBFS")


# ---------------------------------------------------------------- 레시피 (이름 -> 만드는 법)
# 각 레시피는 @sfx(이름, 한국어 설명, 쓰는 원본들, 배경음 여부)로 등록. 반환값은 다듬기 전 소리
RECIPES = {}


def sfx(name, ko, uses, bed=False, looped=False):
    def deco(f):
        RECIPES[name] = dict(f=f, ko=ko, uses=uses, bed=bed, looped=looped)
        return f
    return deco


def V(rel):
    return load("vsco", rel)


BD = "VSCO 1 Percussion/drums/bass/"
GONG = "VSCO 1 Percussion/varMetal/Gong/"
PERC = "Percussion/"
TIMP = "Percussion/Timpani/"


def periodic(L, place, tail=4.0):
    """L초마다 똑같이 되풀이되는 소리: place(buf, offset)로 한 주기를 세 번 깔고 가운데 주기만 남김 → 울림 꼬리까지 이어지는 반복음"""
    buf = np.zeros((sec(3 * L + tail), 2))
    for k in range(3):
        place(buf, k * L)
    return buf


def add(buf, x, t, g=0.0):
    x = stereo(x)
    a = sec(t)
    if a < 0:
        x, a = x[-a:], 0
    b = min(len(buf), a + len(x))
    if b > a:
        buf[a:b] += x[: b - a] * db(g)


def bend(x, r0, r1, dur):
    """처음 dur초 동안 빠르기를 r0 -> r1 로 (금관이 음을 밀어 올리는 느낌)"""
    x = stereo(x)
    n = sec(dur)
    rate = np.concatenate([np.linspace(r0, r1, n), np.full(max(0, len(x)), r1)])
    pos = np.cumsum(rate)
    pos = pos[pos < len(x) - 1]
    return np.stack([np.interp(pos, np.arange(len(x)), x[:, c]) for c in range(2)], 1)


def cap(x, dur, fo=None):
    """dur초에서 끝냄 (끝 fo초는 부드럽게 줄임)"""
    x = stereo(x)[: sec(dur)]
    return fade(x, 0, fo or min(1.0, dur * 0.35))


def env(x, pts):
    """pts=[(초, dB)...] 사이를 이은 크기 곡선"""
    x = stereo(x)
    t = np.arange(len(x)) / SR
    a, b = zip(*pts)
    return x * db(np.interp(t, a, b))[:, None]


# ----- 기존 이름 (장면 기본 효과음 - Episode.tsx SFX 표)
@sfx("swish", "부드러운 바람 휙 (지도·그림 전환)", ["oga-swishes", "oga-airmove"])
def _():
    a = trim(load("oga-swishes", "swish-1.wav"))
    b = trim(load("oga-airmove"))
    x = mix((hp(a, 180), 0, 0), (hp(speed(b, 0.85), 120), 0.02, -6))
    return reverb(lp(x, 9000), 0.7, 0.18, seed=2)


@sfx("whoosh", "큰 바람 휘익 (장소·시대가 크게 바뀔 때)", ["snm-textures1", "oga-swishes"])
def _():
    a = speed(trim(load("snm-textures1", "Scythian Recurve Heavy Arrow Passby.wav")), 0.62)
    b = speed(trim(load("oga-swishes", "swish-9.wav")), 0.8)
    x = mix((hp(a, 90), 0, 0), (hp(b, 150), 0.25, -8))
    return cap(reverb(width(x, 1.2), 1.1, 0.25, seed=3), 3.2, 1.2)


@sfx("boom", "제목 쾅: 오케스트라 큰북·팀파니·징 + 브람 + 낮은 울림", ["vsco", "wc-braam"])
def _():
    braam = load("wc-braam")
    braam = cut(braam, max(0, takes(braam)[0][0] - 0.01))
    x = mix(
        (V(BD + "bdrum_fff_1.wav"), 0, 0),
        (V(TIMP + "Timpani1_Hit_v3_rr1_Sum.wav"), 0.005, -4),
        (V(GONG + "gong_hit_ff_hard.wav"), 0.01, -9),
        (V("VSCO 1 Percussion/drums/bass/bdrum3_fff_1.wav"), 0.0, -3),
        (braam, 0.0, -5),
    )
    x = shelf(x, 90, 4)
    return env(reverb(x, 2.8, 0.3, seed=4), [(0, 0), (3.2, 0), (4.6, -40)])[: sec(4.6)]


@sfx("impact", "도장·충격 쿵 (짧고 단단함)", ["vsco", "kenney-impact", "oga-wood"])
def _():
    x = mix(
        (V(BD + "bdrum_muted_fff_1.wav"), 0, 0),
        (load("kenney-impact", "impactPunch_heavy_000.ogg"), 0.0, -6),
        (hp(trim(load("oga-wood", "impactwood01.mp3.flac")), 200), 0.0, -9),
        (V(TIMP + "Timpani2_Hit_v4_rr1_Sum.wav"), 0.003, -8),
    )
    return env(reverb(x, 1.2, 0.15, seed=5), [(0, 0), (1.0, 0), (1.8, -40)])[: sec(1.8)]


@sfx("hit", "인물 등장 탁 (낮고 짧은 북)", ["vsco"])
def _():
    x = mix(
        (V(BD + "bdrum_muted_ff_1.wav"), 0, 0),
        (V(TIMP + "Timpani1_Hit_v1_rr1_Sum.wav"), 0.0, -7),
    )
    x = lp(x, 3500)
    return env(reverb(x, 0.9, 0.12, seed=6), [(0, 0), (0.6, 0), (1.2, -40)])[: sec(1.2)]


@sfx("drum", "전쟁 북 한 번 (큰북 + 통나무 북 + 팀파니)", ["vsco"])
def _():
    x = mix(
        (V(BD + "bdrum_fff_2.wav"), 0, 0),
        (V(PERC + "LogDrumLo_MedM_v3_rr1_Sum.wav"), 0.0, -5),
        (V(TIMP + "Timpani2_Hit_v4_rr2_Sum.wav"), 0.003, -6),
    )
    return env(reverb(shelf(x, 100, 3), 1.8, 0.22, seed=7), [(0, 0), (1.6, 0), (2.4, -40)])[: sec(2.4)]


@sfx("tick", "나무 토막 똑 (연도 넘김)", ["vsco"])
def _():
    x = cut(V(PERC + "TB_hit_G4_v4_rr1.wav"), 0, 0.5)
    return env(reverb(x, 0.4, 0.1, seed=8), [(0, 0), (0.25, 0), (0.5, -40)])[: sec(0.5)]


# ----- 말·기병
def _strides():
    """말발굽 한 걸음(4박) 조각들: Alan McKinney 녹음 2개 + CC0 질주 한 걸음"""
    out = []
    for nm in ("gallop_01.ogg", "gallop_02.ogg"):
        x = load("oga-gallop", nm)
        out += [cut(x, a, b) for a, b in takes(x)]
    for nm in ("ground.mp3", "grass.mp3"):
        out.append(trim(load("oga-gallops", nm)))
    return out


@sfx("gallop", "말 한 마리 달리는 소리 (반복 가능 6초)", ["oga-gallop"], looped=True)
def _():
    st = _strides()[:21]
    g = rng("gallop")
    L, step = 6.0, 0.6
    ev = [(hp(st[g.integers(len(st))], 70), k * step + g.normal(0, 0.004), g.uniform(-1.5, 0)) for k in range(int(L / step))]

    def place(buf, o):
        for s, t, gdb in ev:
            add(buf, s, o + t, gdb)
    buf = periodic(L, place)
    buf = reverb(buf, 0.8, 0.12, seed=9)
    return cut(buf, L, 2 * L)


@sfx("cavalry", "기병 돌격 - 말 떼 질주 + 땅 울림 (반복 가능 8초)", ["oga-gallop", "oga-gallops"], looped=True)
def _():
    st = _strides()
    g = rng("cavalry")
    L = 8.0
    horses = []
    for h in range(18):
        per = L / g.integers(12, 15)            # 한 주기에 걸음 수가 정수 → 이음매 없음
        horses.append(dict(per=per, ph=g.uniform(0, per), p=g.uniform(-0.9, 0.9), d=g.uniform(0.2, 1.0), r=g.uniform(0.85, 1.08),
                           seq=[int(g.integers(len(st))) for _ in range(20)]))

    def place(buf, o):
        for hz in horses:
            n = int(round(L / hz["per"]))
            for k in range(n):
                s = speed(st[hz["seq"][k % 20]], hz["r"])
                s = lp(s, 9000 - 6000 * hz["d"])
                add(buf, pan(s, hz["p"]), o + hz["ph"] + k * hz["per"], -4 - 9 * hz["d"])
    buf = periodic(L, place)
    rumble = lp(buf, 160, 2)
    buf = buf + rumble * 1.6
    buf = reverb(buf, 1.6, 0.22, seed=10)
    return cut(buf, L, 2 * L)


@sfx("hooves", "편자 박은 말이 돌길을 달려 지나감", ["wc-horseshoes"])
def _():
    x = load("wc-horseshoes")
    a, b = takes(x, thr=-30)[0]
    return reverb(cut(x, a, min(b, a + 6)), 0.9, 0.12, seed=11)


@sfx("neigh", "말 울음 (히히힝)", ["wc-neigh"])
def _():
    x = hp(load("wc-neigh"), 180)
    return reverb(width(x, 0), 1.4, 0.2, seed=12)


# ----- 활·칼·방패
@sfx("arrows", "화살 일제 사격 - 시위 소리 + 화살 떼 휘익", ["oga-archers", "snm-textures1"])
def _():
    g = rng("arrows")
    shoot = trim(load("snm-textures1", "Scythian Recurve Shoot.wav"))
    passes = [trim(load("snm-textures1", n)) for n in ("Scythian Recurve Arrow Passby.wav", "Scythian Recurve Heavy Arrow Passby.wav", "Scythian Recurve Arrow Approach.wav", "Scythian Recurve Heavy Arrow Approach.wav")]
    parts = [(load("oga-archers"), 0, -2)]
    for k in range(7):
        parts.append((pan(speed(shoot, g.uniform(0.92, 1.1)), g.uniform(-0.8, 0.8)), g.uniform(0, 0.3), -8))
    for k in range(16):
        s = passes[k % 4]
        s = speed(s, g.uniform(0.85, 1.2))
        s = s[sec(g.uniform(0, 0.4)):]
        parts.append((pan(s, g.uniform(-1, 1)), 0.35 + g.uniform(0, 0.9), -7 + g.uniform(-4, 0)))
    x = mix(*parts)
    return env(reverb(hp(x, 120), 1.4, 0.22, seed=13), [(0, 0), (3.0, 0), (4.2, -40)])[: sec(4.2)]


@sfx("arrow_hit", "화살이 나무 방패·땅에 퍽 꽂힘", ["oga-wood", "kenney-impact"])
def _():
    a = hp(trim(load("oga-wood", "impactwood05.mp3.flac")), 300)
    b = hp(trim(load("kenney-impact", "impactWood_heavy_002.ogg")), 250)
    x = mix((a, 0, 0), (b, 0, -5))
    return env(reverb(x, 0.6, 0.12, seed=14), [(0, 0), (0.35, 0), (0.7, -40)])[: sec(0.7)]


@sfx("arrow_rain", "화살 비 - 여러 발이 사방에 꽂힘", ["oga-wood", "kenney-impact", "snm-textures1"])
def _():
    g = rng("arrow_rain")
    hits = [hp(trim(load("oga-wood", f"impactwood{k:02d}.mp3.flac")), 300) for k in (2, 3, 5, 6, 9, 12, 15, 18)]
    hits += [hp(trim(load("kenney-impact", f"impactWood_heavy_00{k}.ogg")), 250) for k in range(5)]
    fly = trim(load("snm-textures1", "Scythian Recurve Arrow Passby.wav"))
    parts = [(pan(speed(fly, g.uniform(0.9, 1.1)), g.uniform(-1, 1)), g.uniform(0, 0.3), -10) for _ in range(6)]
    for k in range(22):
        parts.append((pan(speed(hits[g.integers(len(hits))], g.uniform(0.9, 1.15)), g.uniform(-1, 1)), 0.5 + g.gamma(2, 0.22), -3 - g.uniform(0, 10)))
    return cap(reverb(mix(*parts), 1.0, 0.18, seed=15), 4.0)


def _clashes():
    out = []
    for key, nm in (("snm-weapons1", "Sabre Norse Sword Blade on Blade.wav"), ("snm-weapons1", "Axe Norse Sword Blade on Blade.wav"),
                    ("snm-weapons2", "Norse Sword Katana Blade on Blade.wav"), ("snm-weapons2", "Sabre Katana Blade on Blade.wav"),
                    ("snm-weapons2", "Spear Norse Sword Blade on Blade.wav"), ("snm-weapons1", "Mace Norse Sword Blade.wav")):
        try:
            x = load(key, nm)
        except FileNotFoundError:
            continue
        out += [cut(x, a, b) for a, b in takes(x)]
    return out


@sfx("sword", "칼 부딪힘 챙 (한 번)", ["snm-weapons1", "snm-weapons2"])
def _():
    c = _clashes()
    x = mix((c[0], 0, 0), (c[12 % len(c)], 0.004, -9))
    return reverb(x, 0.9, 0.16, seed=16)


@sfx("swords", "칼싸움 - 여러 번 챙챙 (3초)", ["snm-weapons1", "snm-weapons2"])
def _():
    c = _clashes()
    g = rng("swords")
    t, parts = 0.0, []
    while t < 2.6:
        parts.append((pan(c[g.integers(len(c))], g.uniform(-0.6, 0.6)), t, g.uniform(-6, 0)))
        t += g.uniform(0.12, 0.45)
    return reverb(mix(*parts), 1.0, 0.18, seed=17)


@sfx("shield", "방패로 밀어 치기 쿵 (나무 + 쇠 테)", ["oga-wood", "kenney-impact", "vsco"])
def _():
    x = mix(
        (trim(load("oga-wood", "impactwood10.mp3.flac")), 0, 0),
        (load("kenney-impact", "impactPlate_heavy_001.ogg"), 0.0, -9),
        (V(BD + "bdrum_muted_mf_1.wav"), 0.0, -4),
    )
    return env(reverb(x, 0.8, 0.14, seed=18), [(0, 0), (0.6, 0), (1.1, -40)])[: sec(1.1)]


# ----- 전투·함성
def _crowd_layers(seed_name, n=4):
    g = rng(seed_name)
    c = load("oga-crowd")
    out = []
    for k in range(n):
        s = speed(c, g.uniform(0.86, 1.08))
        s = s[sec(g.uniform(0, 6)):]
        out.append(pan(s, g.uniform(-0.8, 0.8)))
    return out


@sfx("battle", "가까운 백병전 - 함성 + 칼·방패 + 화살 (반복 가능 10초)", ["oga-crowd", "snm-weapons1", "snm-weapons2", "oga-wood", "snm-textures1", "vsco"], bed=True, looped=True)
def _():
    g = rng("battle")
    L = 10.0
    cl = _clashes()
    hits = [trim(load("oga-wood", f"impactwood{k:02d}.mp3.flac")) for k in (10, 11, 13, 16, 20)]
    fly = trim(load("snm-textures1", "Scythian Recurve Arrow Passby.wav"))
    crowd = [loop(cut(c, 0, L + 1), 1.0) for c in _crowd_layers("battle")]
    ev = []
    for k in range(34):
        ev.append((cl[g.integers(len(cl))], g.uniform(0, L), g.uniform(-1, 1), g.uniform(-12, -3)))
    for k in range(12):
        ev.append((hits[g.integers(len(hits))], g.uniform(0, L), g.uniform(-1, 1), g.uniform(-14, -5)))
    for k in range(5):
        ev.append((fly, g.uniform(0, L), g.uniform(-1, 1), -14))

    def place(buf, o):
        for c in crowd:
            add(buf, c, o, -6)
        for s, t, p, gdb in ev:
            add(buf, pan(s, p), o + t, gdb)
    buf = periodic(L, place)
    buf = reverb(buf, 1.5, 0.22, seed=19)
    out = cut(buf, L, 2 * L)
    return out


@sfx("battle_far", "멀리서 들리는 전투 (낮고 흐릿하게, 반복 가능 10초)", ["oga-crowd", "snm-weapons1", "snm-weapons2", "oga-wood", "snm-textures1", "vsco"], bed=True, looped=True)
def _():
    x = RECIPES["battle"]["f"]()
    x = lp(hp(x, 120), 1400, 2)
    L = len(x) / SR
    y = reverb(np.concatenate([x, x, x]), 2.8, 0.55, pre=0.06, seed=20)
    return cut(y, L, 2 * L)


@sfx("battle_musket", "화약 시대 전투 재현 (소총 일제 사격·함성)", ["nps-battle"])
def _():
    return reverb(load("nps-battle"), 1.4, 0.2, seed=21)


@sfx("war_cry", "군대 함성 와아 (5초)", ["oga-crowd"])
def _():
    layers = _crowd_layers("war_cry", 5)
    x = mix(*[(cut(c, 0, 5.5), 0, -4) for c in layers])
    x = env(x, [(0, -20), (0.6, 0), (4.4, 0), (5.5, -40)])
    return reverb(x, 1.8, 0.25, seed=22)


@sfx("crowd", "큰 군중 웅성웅성 (도시·궁정, 반복 가능 20초)", ["wc-crowd"], bed=True, looped=True)
def _():
    x = cut(load("wc-crowd"), 5, 26.5)
    return loop(x, 1.5)


@sfx("war_horn", "전쟁 뿔나팔 부우- (낮은 호른·트롬본·튜바 녹음을 겹침)", ["vsco"])
def _():
    parts = []
    for rel, g0, d in (("Brass/F Horn/sus/MOHorn_sus_D2_v3_1.wav", 0, 0.0), ("Brass/F Horn/sus/MOHorn_sus_D2_v2_1.wav", -3, 0.03),
                       ("Brass/Tenor Trombone/sus/tenortbn_sus_D2_v3_1.wav", -4, 0.01), ("Brass/Tuba/sus/Tuba3_sus_D#1_v3_rr1_Mid.wav", -9, 0.02)):
        try:
            x = trim(V(rel))
        except FileNotFoundError:
            continue
        x = bend(x, 0.94, 1.0, 0.35)
        parts.append((x, d, g0))
    x = mix(*parts)
    x = env(x, [(0, -14), (0.45, 0), (2.6, 0), (3.6, -40)])[: sec(3.6)]
    return reverb(width(x, 0.3), 3.2, 0.35, pre=0.05, seed=23)


@sfx("war_drums", "전쟁 북 장단 (큰북·통나무 북·팀파니, 반복 가능 약 6.3초)", ["vsco"], looped=True)
def _():
    bpm = 76
    beat = 60 / bpm
    L = beat * 8
    big = [V(BD + n) for n in ("bdrum_fff_1.wav", "bdrum_fff_2.wav", "bdrum_ff_1.wav", "bdrum_f_1.wav")]
    log = [V(PERC + f"LogDrumLo_MedM_v{v}_rr{r}_Sum.wav") for v in (2, 3) for r in (1, 2)]
    tim = [V(TIMP + n) for n in ("Timpani2_Hit_v4_rr1_Sum.wav", "Timpani2_Hit_v3_rr1_Sum.wav")]
    # 3+3+2 강세 (8분음표 16칸)
    pat = [(0, big[0], 0), (3, big[2], -4), (6, big[1], -1), (8, big[0], 0), (11, big[2], -4), (14, big[3], -6), (15, big[3], -5)]
    pat += [(k, log[k % 4], -9 if k % 2 else -6) for k in range(16) if k not in (0, 8)]
    pat += [(0, tim[0], -6), (8, tim[1], -7)]
    g = rng("war_drums")
    ev = [(pan(s, g.uniform(-0.3, 0.3)), k * beat / 2 + g.normal(0, 0.003), gdb) for k, s, gdb in pat]

    def place(buf, o):
        for s, t, gdb in ev:
            add(buf, s, o + t, gdb)
    buf = periodic(L, place)
    buf = reverb(shelf(buf, 100, 3), 2.0, 0.24, seed=24)
    return cut(buf, L, 2 * L)


@sfx("march", "군대 행군 발소리 (수십 명, 반복 가능 4초)", ["oga-footsteps", "kenney-rpg"], looped=True)
def _():
    g = rng("march")
    steps = []
    for d in ("boots", "gravel"):
        for k in range(9):
            try:
                steps.append(trim(_step(d, k)))
            except StopIteration:
                pass
    gear = [trim(load("kenney-rpg", n)) for n in ("clothBelt.ogg", "clothBelt2.ogg", "beltHandle1.ogg", "beltHandle2.ogg", "metalLatch.ogg")]
    L, step = 4.0, 0.5   # 1분에 120걸음
    men = [dict(p=g.uniform(-1, 1), d=g.uniform(0, 1), j=g.normal(0, 0.012), seq=[int(g.integers(len(steps))) for _ in range(8)]) for _ in range(36)]

    def place(buf, o):
        for m in men:
            for k in range(int(L / step)):
                s = lp(steps[m["seq"][k]], 8000 - 5000 * m["d"])
                add(buf, pan(s, m["p"]), o + k * step + m["j"], -6 - 10 * m["d"])
        for k in range(10):
            add(buf, pan(gear[k % len(gear)], (k * 0.37) % 2 - 1), o + (k * 0.41) % L, -16)
    buf = periodic(L, place)
    buf = reverb(buf, 1.2, 0.2, seed=25)
    return cut(buf, L, 2 * L)


def _step(d, k):
    base = path("oga-footsteps")
    p = next(base.rglob(f"{d}/{k}.ogg"))
    return load_path(p)


# ----- 공성
@sfx("gate", "성문 부수기 - 공성추 쾅 + 나무 쪼개짐 + 파편", ["vsco", "oga-wood", "oga-breaking"])
def _():
    x = mix(
        (V(BD + "bdrum_fff_1.wav"), 0, 0),
        (trim(load("oga-wood", "crack01.mp3.flac")), 0.0, -3),
        (trim(load("oga-breaking", "bfh1_wood_breaking_01.ogg")), 0.02, -4),
        (trim(load("oga-breaking", "bfh1_wood_breaking_03.ogg")), 0.15, -8),
        (trim(load("oga-breaking", "bfh1_rock_falling_02.ogg")), 0.35, -10),
        (V(TIMP + "Timpani1_Hit_v3_rr1_Sum.wav"), 0.0, -6),
    )
    return cap(reverb(shelf(x, 120, 3), 2.2, 0.28, seed=26), 4.0)


@sfx("catapult", "투석기 발사 - 나무 삐걱 + 탁 풀림 + 돌이 날아감", ["kenney-rpg", "oga-wood", "snm-textures1"])
def _():
    creak = trim(load("kenney-rpg", "creak1.ogg"))
    rel = trim(load("oga-wood", "crack03.mp3.flac"))
    fly = speed(trim(load("snm-textures1", "Scythian Recurve Heavy Arrow Passby.wav")), 0.42)
    x = mix((speed(creak, 0.8), 0, -4), (rel, len(creak) / SR / 0.8 - 0.05, 0), (hp(fly, 60), len(creak) / SR / 0.8, -3))
    return cap(reverb(x, 1.6, 0.22, seed=27), 4.5)


@sfx("catapult_hit", "투석기 돌이 성벽에 쾅 - 돌 깨짐·무너짐", ["vsco", "oga-breaking"])
def _():
    x = mix(
        (V(BD + "bdrum_fff_2.wav"), 0, 0),
        (trim(load("oga-breaking", "bfh1_rock_breaking_01.ogg")), 0.0, -2),
        (trim(load("oga-breaking", "bfh1_rock_falling_01.ogg")), 0.12, -6),
        (trim(load("oga-breaking", "bfh1_rock_falling_04.ogg")), 0.4, -9),
        (trim(load("oga-breaking", "bfh1_rock_falling_07.ogg")), 0.8, -12),
    )
    return cap(reverb(shelf(x, 120, 4), 2.4, 0.3, seed=28), 4.5)


# ----- 불·자연
@sfx("fire", "불타는 도시 - 큰불 + 장작 튀는 소리 + 무너짐 + 먼 비명 (반복 가능 16초)", ["nps-fire", "oga-fireplace", "oga-breaking", "oga-crowd"], bed=True, looped=True)
def _():
    L = 16.0
    big = cut(load("nps-fire"), 10, 10 + L + 2)
    crack = cut(load("oga-fireplace"), 2, 2 + L + 2)
    far = lp(cut(_crowd_layers("fire", 1)[0], 0, L + 2), 1200)
    x = mix((big, 0, 0), (crack, 0, -2), (far, 0, -20))
    x = loop(x, 2.0)
    g = rng("fire")
    for k in range(3):
        add(x, cap(lp(trim(load("oga-breaking", f"bfh1_wood_breaking_0{k + 2}.ogg")), 3000), 3.0), g.uniform(1, L - 4), -14)
    return x


@sfx("campfire", "모닥불 타닥타닥 (반복 가능 20초)", ["oga-fireplace"], bed=True, looped=True)
def _():
    x = load("oga-fireplace")
    return loop(cut(x, 3, 25), 2.0)


@sfx("wind", "초원 바람 (반복 가능 24초)", ["wc-wind"], bed=True, looped=True)
def _():
    x = mono(load("wc-wind"))
    a, b = x[sec(4): sec(30)], x[sec(40): sec(66)]   # 왼·오른쪽을 다른 구간으로 → 자연스러운 넓이
    y = np.stack([a, b], 1)
    return loop(hp(y, 40), 2.0)


@sfx("wolf", "늑대 한 마리 울음 (아우우-)", ["nps-wolf"])
def _():
    return cap(reverb(load("nps-wolf"), 2.0, 0.15, seed=29), 9.5, 1.5)


@sfx("wolves", "늑대 무리 울음 (밤, 12초)", ["wc-wolf"])
def _():
    x = cut(load("wc-wolf"), 0, 12.5)
    return reverb(width(x, 1.0), 2.2, 0.2, seed=30)


@sfx("thunder", "천둥 우르릉 쾅", ["nps-thunder"])
def _():
    x = load("nps-thunder")
    e = env_rms(x, 0.05)
    k = int(np.argmax(e)) * 0.05
    y = cut(x, max(0, k - 0.6), k + 8)
    return reverb(width(hp(y, 25), 0), 2.5, 0.25, seed=31)


@sfx("rain_thunder", "비 + 먼 천둥 (14초)", ["oga-rainthunder"], bed=True)
def _():
    return cut(load("oga-rainthunder"), 16, 30)


@sfx("rumble", "땅 울림 (지진·대군 접근 긴장)", ["nps-thunder"])
def _():
    x = load("nps-thunder")
    e = env_rms(x, 0.05)
    k = int(np.argmax(e)) * 0.05
    y = speed(cut(x, max(0, k - 1), k + 5), 0.5)
    y = lp(y, 180, 2)
    return env(reverb(width(y, 0), 2.0, 0.3, seed=32), [(0, -30), (1.5, 0), (8, 0), (12, -40)])[: sec(12)]


# ----- 종·징
@sfx("bell", "큰 교회 종 뎅- 뎅- (조종)", ["wc-glocke"])
def _():
    x = cut(load("wc-glocke"), 0, 8)
    return reverb(width(env(x, [(0, 0), (5.5, 0), (8, -40)]), 0), 2.0, 0.2, seed=33)


@sfx("bells", "여러 종이 울림 - 노트르담 (축제·대관, 반복 가능 20초)", ["wc-notredame"], bed=True, looped=True)
def _():
    return loop(cut(load("wc-notredame"), 8, 30), 2.0)


@sfx("gong", "큰 징 - 동아시아 궁정·의식", ["wc-gong"])
def _():
    x = load("wc-gong")
    a = takes(x)[0][0]
    y = cut(x, a, a + 5.2)
    return env(y, [(0, 0), (4.0, 0), (5.2, -40)])


# ----- 화약·근대
@sfx("musket", "머스킷 소총 일제 사격 (화약 시대)", ["nps-musket"])
def _():
    return reverb(load("nps-musket"), 1.5, 0.2, seed=34)


@sfx("cannon", "대포 한 발 쾅", ["oga-cannon"])
def _():
    return cap(reverb(load("oga-cannon"), 2.2, 0.2, seed=35), 4.0)


@sfx("explosion", "폭발 (근현대)", ["oga-explosions", "vsco", "oga-breaking"])
def _():
    x = mix(
        (load("oga-explosions", "explode.wav"), 0, 0),
        (speed(V(BD + "bdrum_fff_1.wav"), 0.6), 0, -4),
        (trim(load("oga-breaking", "bfh1_rock_falling_03.ogg")), 0.5, -12),
    )
    return cap(reverb(shelf(x, 90, 3), 2.6, 0.25, seed=36), 5.0)


@sfx("gunfire_far", "멀리서 총격전 - 소총·기관단총 (2차 대전, 반복 가능 12초)", ["firearms"], bed=True, looped=True)
def _():
    g = rng("gunfire_far")
    L = 12.0
    lib = path("firearms")
    files = ["PPSh/P_16P.wav", "PPSh/P_18P.wav", "PPSh/P_22P.wav", "Mosin Nagant/M_26P.wav", "Arisaka/E_18P.wav", "1917/B_16P.wav", "Carl Gustav M45/G_22P.wav"]
    shots = []
    for f in files:
        x = load_path(next(lib.rglob(f)))
        shots += [cut(x, a, b) for a, b in takes(x, thr=-30)][:6]
    ev = [(shots[g.integers(len(shots))], g.uniform(0, L), g.uniform(-1, 1), g.uniform(0.3, 1.0)) for _ in range(26)]

    def place(buf, o):
        for s, t, p, d in ev:
            add(buf, pan(lp(s, 4000 - 2600 * d), p), o + t, -4 - 10 * d)
    buf = periodic(L, place)
    buf = reverb(hp(buf, 80), 3.0, 0.5, pre=0.08, seed=37)
    return cut(buf, L, 2 * L)


@sfx("artillery_far", "먼 포격 - 쿵쿵 울리는 포성 + 총격 (반복 가능 12초)", ["oga-cannon", "wc-war"], bed=True, looped=True)
def _():
    g = rng("artillery_far")
    L = 12.0
    can = load("oga-cannon")
    war = load("wc-war")
    ev = [(speed(can, g.uniform(0.6, 0.85)), g.uniform(0, L), g.uniform(-1, 1), g.uniform(-6, 0)) for _ in range(7)]
    bed = lp(loop(cut(war, 0, L + 1.5), 1.5), 1500)

    def place(buf, o):
        add(buf, bed, o, -10)
        for s, t, p, gdb in ev:
            add(buf, pan(lp(s, 700), p), o + t, gdb)
    buf = periodic(L, place)
    buf = reverb(buf, 3.5, 0.45, pre=0.1, seed=38)
    return cut(buf, L, 2 * L)


@sfx("tank", "전차 엔진 + 궤도 철컥철컥 (반복 가능)", ["oga-engine", "vsco"], looped=True)
def _():
    eng = load("oga-engine")
    L = len(eng) / SR
    ch = V("Miscellania Raw/Misc 1/chain_loop.wav")
    chain = cut(ch, 0, min(len(ch) / SR, L))
    if len(chain) < len(eng):
        chain = np.concatenate([chain] * int(np.ceil(len(eng) / len(chain))))[: len(eng)]
    x = stereo(eng) + lp(hp(chain[: len(eng)], 300), 5000) * db(-8)
    return loop(np.concatenate([x, x[: sec(0.3)]]), 0.3)


# ----- 종이·보물
@sfx("page", "책장 넘김 사락", ["oga-books"])
def _():
    return trim(load("oga-books", "book_flip.3.ogg"))


@sfx("map", "지도 펼침 - 종이 바스락", ["oga-paper", "kenney-rpg"])
def _():
    x = load("oga-paper")
    t = takes(x, thr=-30)
    parts = [(cut(x, a, b), k * 0.22, -k * 2) for k, (a, b) in enumerate(t[:3])]
    parts.append((trim(load("kenney-rpg", "cloth3.ogg")), 0.05, -10))
    return reverb(mix(*parts), 0.6, 0.1, seed=39)


@sfx("coins", "금화 짤랑 (보물·세금·교역)", ["oga-goldsack", "kenney-rpg"])
def _():
    x = mix((load("oga-goldsack"), 0, 0), (trim(load("kenney-rpg", "handleCoins.ogg")), 0.1, -8))
    return reverb(x, 0.7, 0.1, seed=40)


# ---------------------------------------------------------------- 합성 대체 (원본이 없을 때만)
def _band_noise(g, seconds, lo, hi):
    n = int(seconds * SR)
    X = np.fft.rfft(g.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, n)


def _synth_whoosh(seconds=0.7, rise=0.55):
    g = np.random.default_rng(3)
    n = int(seconds * SR)
    out = np.zeros(n)
    steps = 14
    for k in range(steps):
        a, b = k * n // steps, (k + 1) * n // steps
        c = 300 + 2600 * (k / steps) ** 1.5
        out[a:b] += _band_noise(g, (b - a) / SR + 0.05, c * 0.6, c * 1.8)[: b - a] * np.hanning(b - a)
    return out * np.interp(np.arange(n), [0, rise * n, n], [0, 1, 0]) ** 1.6


def _synth_hit(f0, seconds, noise=0.3):
    g = np.random.default_rng(4)
    t = np.arange(int(seconds * SR)) / SR
    x = np.sin(2 * np.pi * f0 * t * (1 + 0.5 * np.exp(-t * 30))) * np.exp(-t * 5) + noise * _band_noise(g, seconds, 80, 3000) * np.exp(-t * 25)
    return x


FALLBACK = {
    "whoosh": lambda: _synth_whoosh(0.75),
    "swish": lambda: _synth_whoosh(0.45, 0.4) * 0.7,
    "boom": lambda: reverb(_synth_hit(45, 3.0, 0.5), 2.5, 0.3),
    "impact": lambda: _synth_hit(60, 1.5, 0.6),
    "hit": lambda: _synth_hit(70, 1.0, 0.2),
    "drum": lambda: reverb(_synth_hit(55, 1.5, 0.4), 1.5, 0.2),
    "tick": lambda: _synth_hit(900, 0.25, 0.1),
}


# ---------------------------------------------------------------- 실행
def build(names):
    credits = json.loads(CREDITS.read_text()) if CREDITS.exists() else {}
    for name in names:
        r = RECIPES[name]
        try:
            x = r["f"]()
            src = [dict(key=k, page=SOURCES[k]["page"], license=SOURCES[k]["license"], author=SOURCES[k]["author"],
                        attribution=SOURCES[k]["license"].startswith("CC BY")) for k in r["uses"]]
        except (FileNotFoundError, StopIteration, subprocess.CalledProcessError) as e:
            if name not in FALLBACK:
                print(f"{name:14s} 건너뜀 - 원본 없음 ({e}). 먼저: make_sfx.py fetch")
                continue
            print(f"{name:14s} 원본 없음 → 합성으로 대신")
            x, src = FALLBACK[name](), [dict(key="synth", license="자체 합성", author="RMW", attribution=False)]
        x = finish(x, bed=r["bed"], looped=r["looped"])
        save(name, x)
        credits[name] = dict(ko=r["ko"], file=f"sfx/ep/{name}.wav", seconds=round(len(x) / SR, 2), loop=r["looped"], sources=src)
    credits = {k: credits[k] for k in RECIPES if k in credits}
    CREDITS.write_text(json.dumps(credits, ensure_ascii=False, indent=1))
    by = sorted({(s["author"], s["license"], s["page"]) for v in credits.values() for s in v["sources"] if s.get("attribution")})
    if by:
        print("\n영상 설명란 표기 필요 (CC BY):")
        for a, l, p in by:
            print(f"  {a} - {l} - {p}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["fetch"]:
        fetch()
    elif args[:1] == ["takes"]:
        key, *names = args[1:]
        for nm in names or [None]:
            x = load(key, nm)
            t = takes(x)
            print(nm, f"{len(x) / SR:.1f}s", len(t), "조각:", " ".join(f"{a:.2f}-{b:.2f}" for a, b in t[:40]))
    else:
        bad = [a for a in args if a not in RECIPES]
        if bad:
            sys.exit(f"모르는 이름: {bad}. 있는 이름: {' '.join(RECIPES)}")
        build(args or list(RECIPES))
