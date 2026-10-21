# 검사기 공용 (check-text·length·pacing·screen·voice): 장면표 읽기(파일 또는 표준 입력), 실제 목소리 길이, 어림 길이, 결과 출력
#   python3 scripts/check-<x>.py episodes/<편>/ep.json            글로 보고, 오류면 종료 코드 1 (게이트)
#   ... --json                                                    [{scene, lang, field, rule, group, level, msg, span, match, suggest, source}]
#   ... --stdin                                                   장면표 내용은 표준 입력에서 (편집기가 저장 안 한 상태를 검사). 경로는 편 이름·목소리 찾기에만 씀
import json
import re
import sys
from pathlib import Path

CODE = Path(__file__).resolve().parent.parent
EST = json.loads((CODE / "scripts/estimate.json").read_text())
NARRATOR = re.compile(r"^narrator")


class Ctx:
    def __init__(self, argv=None):
        a = sys.argv[1:] if argv is None else argv
        self.flags = {x for x in a if x.startswith("--")}
        pos = [x for x in a if not x.startswith("--")]
        if not pos:
            sys.exit("장면표 경로가 필요함")
        self.path = Path(pos[0])
        self.args = pos[1:]
        self.json = "--json" in self.flags
        self.ep = json.loads(sys.stdin.read() if "--stdin" in self.flags else self.path.read_text())
        self.scenes = self.ep.get("scenes") or []
        self.id = self.path.parent.name
        self.base = CODE / "public/ep" / self.id / self.path.stem  # 목소리·timeline·qa
        tl = self.base / "timeline.json"
        self.tl = json.loads(tl.read_text()) if tl.exists() else None
        self.langs = [l for l in self.ep.get("langs", ["en"]) if l != "en"]
        meta = self.path.parent / "meta.json"
        self.uploaded = bool(json.loads(meta.read_text()).get("uploaded")) if meta.exists() else False
        self._match = None

    def show(self, i):
        return self.scenes[i].get("show") or {}

    # 장면 i ↔ timeline 장면: 같은 자리에 같은 영어면 그것, 아니면 같은 영어의 다른 자리(순서 바꿈·복제), 없으면 같은 자리
    # (언어마다 대사가 같은지는 쓰는 쪽에서 다시 확인 - 순서가 바뀐 남의 목소리를 쓰지 않게)
    def match(self):
        if self._match is None:
            ts = (self.tl or {}).get("scenes") or []
            by_text = {}
            for j, t in enumerate(ts):
                by_text.setdefault(t.get("text"), j)
            self._match = []
            for i, s in enumerate(self.scenes):
                if i < len(ts) and ts[i].get("text") == s.get("text"):
                    self._match.append(i)
                else:
                    self._match.append(by_text.get(s.get("text"), i if i < len(ts) else None))
        return self._match

    def tl_scene(self, i):
        j = self.match()[i]
        return None if j is None else self.tl["scenes"][j]

    # 실제 목소리 길이(초): timeline의 dur, 없으면 wav 헤더. 대사가 목소리 만든 뒤 바뀌었으면 None
    def real_secs(self, i, lang):
        t = self.tl_scene(i)
        if not t:
            return None
        s = self.scenes[i]
        text = s.get("text") if lang == "en" else (s.get("i18n") or {}).get(lang)
        voiced = t.get("text") if lang == "en" else (t.get("i18n") or {}).get(lang)
        if not text or voiced != text:
            return None
        d = (t.get("dur") or {}).get(lang)
        if d:
            return d
        vo = t.get("vo") if lang == "en" else (t.get("vo_i18n") or {}).get(lang)
        return wav_secs(CODE / "public" / vo) if vo else None

    def secs(self, i, lang):
        """(초, 실제?)"""
        r = self.real_secs(i, lang)
        if r:
            return r, True
        s = self.scenes[i]
        return est(s.get("text") if lang == "en" else (s.get("i18n") or {}).get(lang), lang), False


_wav = {}


def wav_secs(f):
    f = Path(f)
    if f in _wav:
        return _wav[f]
    out = None
    try:
        with open(f, "rb") as fh:
            b = fh.read(1 << 16)
        if b[:4] == b"RIFF":
            off, rate = 12, 0
            size_all = f.stat().st_size
            while off + 8 <= len(b):
                cid, size = b[off : off + 4], int.from_bytes(b[off + 4 : off + 8], "little")
                if cid == b"fmt ":
                    rate = int.from_bytes(b[off + 16 : off + 20], "little")
                if cid == b"data":
                    out = round(min(size, size_all - off - 8) / rate, 3) if rate else None
                    break
                off += 8 + size + (size % 2)
    except OSError:
        pass
    _wav[f] = out
    return out


def est(text, lang):  # editor/app.tsx estimate와 같은 식 (계수는 scripts/estimate.json)
    if not text:
        return 0
    t = text.replace("...", "…")
    pauses = sum(t.count(c) for c in EST["pause_chars"]) * EST["pause"]
    if any(lang.startswith(l) for l in EST["cjk_langs"]):
        return len(re.sub(r"[\s.,!?…\"'“”]", "", t)) / EST["cjk_chars_per_sec"] + pauses
    if lang == "en":
        return len(t.split()) / EST["en_words_per_sec"] + pauses
    return len(re.sub(r"\s", "", t)) / EST["chars_per_sec"] + pauses


def is_narr(s):
    return bool(NARRATOR.match(s.get("role") or "narrator"))


def item(scene, msg, *, source, rule, level="error", lang=None, field=None, group=None, span=None, match=None, suggest=None, **extra):
    d = {"scene": scene, "lang": lang, "field": field, "rule": rule, "group": group, "level": level, "msg": msg, "span": span, "match": match, "suggest": suggest or None, "source": source}
    d.update(extra)
    return d


def report(ctx, items, name, tail=""):
    """--json이면 목록만 (종료 0 - 검사기가 죽으면 0이 아님), 아니면 글로 보고하고 오류가 있으면 1"""
    gate = [x for x in items if x["level"] == "error" and not x.get("nogate")]
    if ctx.json:
        print(json.dumps(items, ensure_ascii=False))
        sys.exit(0)
    for title, lv in (("오류", "error"), ("경고", "warn")):
        xs = [x for x in items if x["level"] == lv]
        if not xs:
            continue
        print(f"[{title} {len(xs)}]")
        for x in xs:
            at = f"#{x['scene']} " if x["scene"] is not None else ""
            where = f"{x['field']} " if x.get("field") else ""
            print(f"  {at}{where}{x['msg']}")
            if x.get("scene") is not None and x.get("text"):
                print(f"    {x['text'][:110]}")
    errs = sum(1 for x in items if x["level"] == "error")
    print(f"{name}: 오류 {errs}, 경고 {len(items) - errs}{tail}")
    sys.exit(1 if gate else 0)
