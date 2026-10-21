# 업로드 정보 만들기: 제목·설명(장 구분 타임스탬프 + 그림 출처)·태그를 언어별로 → uploads/<편>.json + hwm/<meta.folder>/<한글 이름>_업로드 정보.html
# python3 scripts/upload-info.py episodes/mongol-01/meta.json
import html, json, os, sys
from pathlib import Path

CODE = Path(__file__).resolve().parent.parent
LANG_KO = {"ko": "한국어", "es": "스페인어"}  # 업로드 정보에 보이는 언어 이름
HOME = Path(os.environ.get("HWM", Path.home() / "hwm"))  # 산출물 폴더 (저장소 위치와 상관없이)
meta_path = Path(sys.argv[1])
meta = json.loads(meta_path.read_text())
ep = meta_path.parent.name
tl = json.loads((CODE / "public/ep" / ep / "ep/timeline.json").read_text())
credits = json.loads((CODE / "public/art/mongol/credits.json").read_text())

# 장면 번호 → 시작 초
starts, t = [], 0
for sc in tl["scenes"]:
    starts.append(t / tl["fps"])
    t += sc["frames"]


def stamp(sec):
    sec = int(sec)
    return f"{sec // 60}:{sec % 60:02d}"


used = sorted({sc["show"]["img"].split("/")[-1].rsplit(".", 1)[0] for sc in tl["scenes"] if sc["show"].get("img", "").startswith("art/")})
art_lines = [f"- {credits[k]['title'].rsplit('.', 1)[0]} ({credits[k]['license']}): {credits[k]['page']}" for k in used if k in credits]

out = {}
for lang, m in meta["langs"].items():
    chapters = "\n".join(f"{stamp(starts[i])} {name}" for i, name in zip(meta["chapters"], m["chapters"]))
    desc = (
        m["hook"] + "\n\n" + chapters + "\n\n" + m["more"] + "\n\n" + m["site"] + "\n\n" + m["sources_title"] + "\n"
        + "\n".join(meta["sources"]) + "\n" + "\n".join(art_lines) + "\n\n" + m["ai_note"] + "\n\n" + " ".join(m["hashtags"])
    )
    out[lang] = {"title": m["title"], "description": desc, "tags": m.get("tags", [])}

up = {"video": meta["video"], "thumbs": meta["thumbs"], "categoryId": "27", "defaultLanguage": "en", "localizations": out}
(CODE / "uploads" / f"{ep}.json").write_text(json.dumps(up, ensure_ascii=False, indent=1))

# 사람이 보는 정리 페이지 (복사 버튼)
def box(text):
    return f'<div class="copy"><button>복사</button>{html.escape(text)}</div>'


rows = []
for lang, label in (("en", "영어 (기본)"), ("ko", "한국어"), ("es", "스페인어")):
    o = out[lang]
    rows.append(f"<h2>{label}</h2><h3>제목</h3>{box(o['title'])}<h3>설명</h3>{box(o['description'])}")
    if o["tags"]:
        rows.append(f"<h3>태그</h3>{box(', '.join(o['tags']))}")
page = f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{html.escape(meta['name'])} 업로드 정보</title>
<style>:root{{--bg:#faf6ec;--card:#fffdf7;--ink:#2b2418;--muted:#6f6450;--line:#e4dcc8;--accent:#c2410c}}
@media (prefers-color-scheme: dark){{:root{{--bg:#0b1220;--card:#111a2c;--ink:#e5e7eb;--muted:#94a3b8;--line:#22304a;--accent:#f59e0b}}}}
body{{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,"Apple SD Gothic Neo",sans-serif}}main{{max-width:860px;margin:0 auto;padding:28px 16px 80px}}
h1{{font-size:26px}}h2{{margin-top:34px;border-top:1px solid var(--line);padding-top:12px}}h3{{font-size:15px;color:var(--muted);margin:16px 0 4px}}
.copy{{position:relative;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;white-space:pre-wrap;font:14px/1.6 ui-monospace,Menlo,monospace}}
.copy button{{position:absolute;top:8px;right:8px;font:12px sans-serif;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:6px;padding:3px 8px;cursor:pointer}}
li{{margin:4px 0}}</style></head><body><main>
<h1>{html.escape(meta['name'])} 업로드 정보</h1>
<ol><li>스튜디오 → 만들기 → 동영상 업로드: <code>{html.escape(meta['video'])}</code></li>
<li>제목·설명·태그: 아래 영어(기본) 붙여 넣기. 카테고리 교육, 언어 영어</li>
<li>썸네일: <code>{html.escape(meta['thumbs'][0])}</code> 기본, 나머지 2개는 "테스트 및 비교"</li>
<li>변경되거나 합성된 콘텐츠: <b>예</b> (인물 목소리가 AI)</li>
<li>재생목록: The Mongol Empire</li>
<li>업로드 후 → 언어 → 한국어·스페인어 추가: 제목·설명은 아래, 더빙은 이 폴더의 <code>_한국어 더빙.wav</code> · <code>_스페인어 더빙.wav</code>, 자막은 <code>_언어 자막.srt</code></li>
{''.join(f'<li>언어별 썸네일: 언어 → {html.escape(LANG_KO.get(l, l))} 줄의 썸네일 칸에 <code>{html.escape(t[0])}</code> (더빙을 올린 뒤에 칸이 열림)</li>' for l, t in meta.get('thumbs_i18n', {}).items())}
<li>최종 화면: 마지막 20초 점선 자리에 다음 영상 + 구독</li></ol>
{''.join(rows)}
</main><script>document.querySelectorAll(".copy button").forEach(b=>b.addEventListener("click",()=>{{const x=b.parentElement.cloneNode(true);x.querySelector("button").remove();navigator.clipboard.writeText(x.textContent.trim()).then(()=>{{b.textContent="복사됨";setTimeout(()=>b.textContent="복사",1500)}})}}))</script></body></html>"""
dest = HOME / meta["folder"] / f"{meta['name']}_업로드 정보.html"
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(page)
print("→", dest)
