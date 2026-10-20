// 편집기 화면 (캡컷식): 가운데 영상, 아래 트랙, 왼쪽 타이밍·검사, 오른쪽 장면/소리. scripts/editor.mjs가 esbuild로 묶음
// 영상은 실제 렌더와 같은 Episode를 Remotion Player로 재생
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Player, type PlayerRef } from "@remotion/player";
import { Episode, sceneSfx, timelineFrames, type Cue, type Scene, type Timeline } from "../src/episode/Episode";
import { charForSpeaker, POSES, POSE_NAME } from "../src/episode/Character";

const FPS = 30;
const GAP = 0.18; // audio/voice_episode.py와 같게
type EpScene = Omit<Scene, "frames" | "vo"> & { i18n?: Record<string, string>; cues?: Cue[]; [k: string]: unknown };
type Ep = { bgm?: string; langs?: string[]; scenes: EpScene[]; [k: string]: unknown };
type TlScene = { text?: string; i18n?: Record<string, string>; vo: string | null; vo_i18n?: Record<string, string>; frames: number };
type Data = { ep: Ep; locked: string | null; tl: TlScene[] | null; durs: Record<string, number>[] | null; bgm: string[]; sfx: string[]; roles: Record<string, string>; chars: Record<string, string> };
type EpInfo = { id: string; playlist: string; title: string };
type Issue = { kind: string; msg: string };
type Sound = { src: string; name: string; group: string; secs: number | null };
type Sounds = { sfx: Sound[]; bgm: Sound[] };
type CueSel = { scene: number; k: number } | null;

const api = async <T,>(path: string, opt?: RequestInit): Promise<T> => {
  const r = await fetch(path, opt);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.status);
  return j;
};

// ---------- 아이콘 (Lucide 모양, 선 1.8) ----------
const PATHS: Record<string, string> = {
  play: "M7 4v16l13-8z",
  pause: "M7 4h4v16H7zM14 4h4v16h-4z",
  prev: "M19 20 9 12l10-8zM5 5v14",
  next: "m5 4 10 8-10 8zM19 5v14",
  plus: "M12 5v14M5 12h14",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  up: "m6 15 6-6 6 6",
  down: "m6 9 6 6 6-6",
  copy: "M8 8h12v12H8zM4 16V4h12",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  music: "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  wave: "M2 12h2l2-6 3 12 3-14 3 16 3-10 2 2h2",
  speaker: "M11 5 6 9H2v6h4l5 4zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12",
  upload: "M12 16V4M6 10l6-6 6 6M4 20h16",
  x: "M6 6l12 12M18 6 6 18",
  undo: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  redo: "m15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5",
};
const Icon = ({ n, s = 16 }: { n: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={n === "play" || n === "pause" || n === "prev" || n === "next" ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={PATHS[n]} />
  </svg>
);
const IconBtn = ({ n, label, onClick, className = "" }: { n: string; label: string; onClick: () => void; className?: string }) => (
  <button className={"icon " + className} onClick={onClick} aria-label={label} data-tip={label}><Icon n={n} /></button>
);

// 목소리 만들기 전 어림 (내레이터 속도 1.07 기준)
const estimate = (text: string | undefined, lang: string) => {
  if (!text) return 0;
  const t = text.replace(/\.\.\./g, "…");
  const pauses = (t.match(/[.,!?…;:]/g) || []).length * 0.18;
  if (/^(ko|ja|zh)/.test(lang)) return t.replace(/[\s.,!?…"'“”]/g, "").length / 6.3 + pauses;
  if (lang === "en") return t.split(/\s+/).filter(Boolean).length / 2.7 + pauses;
  return t.replace(/\s/g, "").length / 14.5 + pauses;
};

type Timing = { langs: string[]; per: { lang: string; secs: number; real: boolean; stale: boolean }[][]; frames: number[]; starts: number[] };

// 장면 길이 = 가장 긴 언어 + 숨 고르기 + hold (voice_episode.py와 같은 규칙)
const computeTiming = (d: Data): Timing => {
  const langs = ["en", ...(d.ep.langs || ["en"]).filter((l) => l !== "en")];
  const per = d.ep.scenes.map((sc, i) => {
    const t = d.tl?.[i];
    return langs.map((lang) => {
      const text = lang === "en" ? sc.text : sc.i18n?.[lang];
      const tlText = lang === "en" ? t?.text : t?.i18n?.[lang];
      const realDur = d.durs?.[i]?.[lang];
      if (realDur && tlText === text) return { lang, secs: realDur, real: true, stale: false };
      return { lang, secs: estimate(text, lang), real: false, stale: !!realDur };
    });
  });
  const frames = d.ep.scenes.map((sc, i) => {
    if (d.locked && d.tl?.[i]) return d.tl[i].frames; // 업로드한 편: 장면 길이 고정
    const longest = Math.max(0, ...per[i].map((p) => p.secs));
    const secs = Math.max((sc.show as { seconds?: number }).seconds || 0, sc.text ? longest + GAP : 0) + (Number(sc.hold) || 0);
    return Math.max(15, Math.round(secs * FPS));
  });
  const starts: number[] = [];
  frames.reduce((a, f) => (starts.push(a), a + f), 0);
  return { langs, per, frames, starts };
};

const TYPE_COLOR: Record<string, string> = { map: "#33475b", art: "#474747", line: "#6a2c2e", title: "#463c5e", stamp: "#625632", lapse: "#2d4b58", units: "#3b4733", endcard: "#333" };
const MUSIC_COLOR: Record<string, string> = { main: "#33475b", battle: "#6a2c2e", tension: "#5a4f2c", lament: "#433d5c", triumph: "#585130" };
const LANG_NAME: Record<string, string> = { en: "영어", ko: "한국어", es: "스페인어", ja: "일본어", pt: "포르투갈어", fr: "프랑스어", de: "독일어", hi: "힌디어", zh: "중국어", id: "인도네시아어", ar: "아랍어" };
const tc = (f: number) => {
  const s = f / FPS;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${Math.floor((s % 1) * 10)}`;
};
const fillState = (secs: number, sceneSecs: number) => {
  const silence = sceneSecs - secs - GAP;
  if (secs === 0) return { tone: "none", silence: 0 };
  if (silence < -0.05) return { tone: "bad", silence }; // 장면보다 김 (업로드한 편은 장면을 못 늘림)
  if (silence > 2.5 && secs / sceneSecs < 0.6) return { tone: "bad", silence };
  if (silence > 1.2) return { tone: "warn", silence };
  return { tone: "ok", silence };
};
const AUDIO_EXT = /\.(wav|mp3|m4a|aac|ogg|flac|aif|aiff)$/i;

// 미리듣기: 화면 전체에서 소리 하나만
const preview = { el: null as HTMLAudioElement | null, src: "" };
const usePreview = () => {
  const [playing, setPlaying] = useState("");
  const toggle = (src: string) => {
    if (preview.el) { preview.el.pause(); preview.el = null; }
    if (preview.src === src) { preview.src = ""; setPlaying(""); return; }
    const a = new Audio("/" + src);
    a.onended = () => { preview.src = ""; setPlaying(""); };
    a.play();
    preview.el = a; preview.src = src; setPlaying(src);
  };
  return { playing, toggle };
};

function App() {
  const [eps, setEps] = useState<EpInfo[]>([]);
  const [epId, setEpId] = useState("");
  const [d, setD] = useState<Data | null>(null);
  const [sel, setSel] = useState(0);
  const [cue, setCue] = useState<CueSel>(null);
  const [tab, setTab] = useState<"line" | "screen" | "sound" | "char">("line");
  const [lang, setLang] = useState("en");
  const [frame, setFrame] = useState(0);
  const [zoom, setZoom] = useState(28);
  const [dirty, setDirty] = useState(false);
  const [issues, setIssues] = useState<{ byScene: Record<string, Issue[]>; general: Issue[]; summary?: string }>({ byScene: {}, general: [] });
  const [sounds, setSounds] = useState<Sounds>({ sfx: [], bgm: [] });
  const [toast, setToast] = useState("");
  const [gallery, setGallery] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [overPlayer, setOverPlayer] = useState(false);
  const [studioId, setStudioId] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const player = useRef<PlayerRef>(null);

  const say = (t: string) => { setToast(t); window.setTimeout(() => setToast((x) => (x === t ? "" : x)), 2600); };
  const loadSounds = useCallback(() => api<Sounds>("/api/sounds").then(setSounds), []);
  useEffect(() => {
    loadSounds();
    api<EpInfo[]>("/api/episodes").then((list) => {
      setEps(list);
      let last = "";
      try { last = localStorage.getItem("ep") || ""; } catch {}
      setEpId(list.some((e) => e.id === last) ? last : list[0]?.id);
    });
  }, [loadSounds]);

  const runCheck = useCallback(async (id: string) => setIssues(await api(`/api/check?e=${id}`)), []);
  useEffect(() => {
    if (!epId) return;
    try { localStorage.setItem("ep", epId); } catch {}
    api<Data>(`/api/ep?e=${epId}`).then((x) => { hist.current = { past: [], future: [], last: 0 }; setD(x); setSel(0); setCue(null); setDirty(false); setLang("en"); runCheck(epId); });
  }, [epId, runCheck]);

  const timing = useMemo(() => (d ? computeTiming(d) : null), [d]);
  const timeline = useMemo<Timeline | null>(() => {
    if (!d || !timing) return null;
    return {
      fps: FPS,
      bgm: d.ep.bgm,
      scenes: d.ep.scenes.map((sc, i) => {
        const t = d.tl?.[i];
        const okFor = (l: string) => timing.per[i].find((p) => p.lang === l)?.real;
        const vo_i18n = Object.fromEntries(Object.entries(t?.vo_i18n || {}).filter(([l]) => okFor(l)));
        // 업로드한 편은 캐릭터 없이 렌더됐으므로 미리보기도 그대로 (char "none" = 인물 안 그림)
        return { ...(sc as Scene), ...(d.locked ? { char: "none" } : {}), frames: timing.frames[i], vo: t?.vo && okFor("en") ? t.vo : null, vo_i18n };
      }),
    };
  }, [d, timing]);
  const total = timeline ? timelineFrames(timeline) : 1;
  const inputProps = useMemo(() => ({ timeline, lang }), [timeline, lang]);

  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const h = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    const on = () => setPlaying(true), off = () => setPlaying(false);
    p.addEventListener("frameupdate", h);
    p.addEventListener("play", on);
    p.addEventListener("pause", off);
    p.addEventListener("ended", off);
    return () => { p.removeEventListener("frameupdate", h); p.removeEventListener("play", on); p.removeEventListener("pause", off); p.removeEventListener("ended", off); };
  }, [timeline]);
  useEffect(() => {
    if (!timing || !player.current?.isPlaying()) return;
    const i = timing.starts.findIndex((s, k) => frame >= s && frame < s + timing.frames[k]);
    if (i >= 0 && i !== sel) setSel(i);
  }, [frame, timing, sel]);

  // 되돌리기: 고치기 전 장면표를 쌓아 둠 (0.5초 안에 이어진 입력은 한 번으로)
  const hist = useRef<{ past: Ep[]; future: Ep[]; last: number }>({ past: [], future: [], last: 0 });
  const undo = (redo = false) => {
    if (!d) return;
    const h = hist.current;
    const from = redo ? h.future : h.past, to = redo ? h.past : h.future;
    const prev = from.pop();
    if (!prev) return say(redo ? "다시 할 것이 없음" : "되돌릴 것이 없음");
    to.push(d.ep);
    h.last = 0;
    setD({ ...d, ep: prev, ...(prev.scenes.length !== d.ep.scenes.length ? { tl: null, durs: null } : {}) });
    setSel((x) => Math.min(x, prev.scenes.length - 1)); setCue(null); setDirty(true);
  };
  const edit = (fn: (ep: Ep) => void, keepTiming = true) => {
    if (!d) return;
    const h = hist.current;
    if (Date.now() - h.last > 500) { h.past.push(d.ep); if (h.past.length > 200) h.past.shift(); }
    h.last = Date.now();
    h.future = [];
    const ep = structuredClone(d.ep);
    fn(ep);
    setD(keepTiming ? { ...d, ep } : { ...d, ep, tl: null, durs: null });
    setDirty(true);
  };
  const update = (fn: (sc: EpScene) => void) => edit((ep) => fn(ep.scenes[sel]));
  const reorder = (fn: (s: EpScene[]) => number) => {
    let next = sel;
    edit((ep) => { next = fn(ep.scenes); }, false); // 순서가 바뀌면 실제 목소리 짝이 안 맞음 → 어림으로
    setSel(next); setCue(null);
  };

  // 전체 시간(초) → 장면 번호 + 장면 안 초
  const locate = (sec: number) => {
    if (!timing) return { i: 0, at: 0 };
    const f = Math.max(0, Math.round(sec * FPS));
    let i = timing.starts.findIndex((s, k) => f >= s && f < s + timing.frames[k]);
    if (i < 0) i = timing.starts.length - 1;
    return { i, at: Math.max(0, Math.round(((f - timing.starts[i]) / FPS) * 100) / 100) };
  };
  const addCue = (src: string, sec: number) => {
    const { i, at } = locate(sec);
    let k = 0;
    edit((ep) => { const sc = ep.scenes[i]; sc.cues = [...(sc.cues || []), { src, at, vol: 0.6 }]; k = sc.cues.length - 1; });
    setSel(i); setCue({ scene: i, k }); setTab("sound");
  };
  const setMusicAt = (name: string, sec: number) => {
    const { i } = locate(sec);
    edit((ep) => { ep.scenes[i].music = name; });
    setSel(i); setCue(null);
    say(`#${i}부터 브금 ${name}`);
  };
  const moveCue = (c: NonNullable<CueSel>, sec: number) => {
    const { i, at } = locate(sec);
    let k = 0;
    edit((ep) => {
      const [x] = ep.scenes[c.scene].cues!.splice(c.k, 1);
      if (!ep.scenes[c.scene].cues!.length) delete ep.scenes[c.scene].cues;
      const dst = ep.scenes[i];
      dst.cues = [...(dst.cues || []), { ...x, at }];
      k = dst.cues.length - 1;
    });
    setSel(i); setCue({ scene: i, k });
  };
  const removeCue = (c: NonNullable<CueSel>) => {
    edit((ep) => { ep.scenes[c.scene].cues!.splice(c.k, 1); if (!ep.scenes[c.scene].cues!.length) delete ep.scenes[c.scene].cues; });
    setCue(null);
  };
  const upload = async (files: File[], kind: "sfx" | "bgm") => {
    const out: string[] = [];
    for (const f of files.filter((f) => AUDIO_EXT.test(f.name))) {
      say(`${f.name} 넣는 중`);
      const r = await api<{ src: string; name: string }>(`/api/upload?kind=${kind}&name=${encodeURIComponent(f.name)}`, { method: "POST", body: f });
      out.push(r.src);
    }
    await loadSounds();
    if (out.length) say(`${out.length}개 추가`);
    return out;
  };

  // 저장: 이름을 받아 장면표 저장 + 영상 폴더 "편집"에 MMDDhhmm-이름.json 편집본
  const [saveAsk, setSaveAsk] = useState(false);
  const [busy, setBusy] = useState("");
  const save = useCallback(async (name: string) => {
    if (!d) return;
    setSaveAsk(false);
    setBusy("저장 중");
    try {
      const t0 = Date.now();
      const r = await api<{ file?: string }>(`/api/ep?e=${epId}&name=${encodeURIComponent(name)}`, { method: "POST", body: JSON.stringify(d.ep) });
      await runCheck(epId);
      await new Promise((ok) => setTimeout(ok, Math.max(0, 450 - (Date.now() - t0)))); // 너무 빨리 사라지지 않게
      setDirty(false);
      say(r.file ? `저장됨 · ${r.file.split("/").slice(-3).join("/")}` : "저장됨");
    } catch (e) { say("저장 실패: " + (e as Error).message); }
    setBusy("");
  }, [d, epId, runCheck]);
  const seekScene = (i: number) => { setSel(i); setCue(null); if (timing) player.current?.seekTo(timing.starts[i] + 1); };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === "s") { ev.preventDefault(); if (dirty && !busy) setSaveAsk(true); return; }
      // ⌘Z / ⇧⌘Z: 글자 칸 안에선 그 칸의 되돌리기, 밖에선 편집 되돌리기
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "z" && !/TEXTAREA|INPUT/.test((document.activeElement as HTMLElement)?.tagName)) { ev.preventDefault(); undo(ev.shiftKey); return; }
      if (ev.key === "Escape") setGallery(false);
      if (/TEXTAREA|INPUT|SELECT/.test((document.activeElement as HTMLElement)?.tagName)) return;
      if (ev.key === " ") { ev.preventDefault(); player.current?.toggle(); }
      if ((ev.key === "Delete" || ev.key === "Backspace") && cue) { ev.preventDefault(); removeCue(cue); }
      if (ev.key === "ArrowRight" && d) { ev.preventDefault(); seekScene(Math.min(d.ep.scenes.length - 1, sel + 1)); }
      if (ev.key === "ArrowLeft") { ev.preventDefault(); seekScene(Math.max(0, sel - 1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  if (!d || !timing || !timeline) return <div className="empty">불러오는 중</div>;
  const groups: Record<string, EpInfo[]> = {};
  eps.forEach((e) => (groups[e.playlist] ??= []).push(e));
  const m = issues.summary?.match(/오류 (\d+), 경고 (\d+)/);

  return (
    <div className="app">
      <header>
        <select aria-label="편" data-tip="편 고르기" value={epId} onChange={(e) => { if (!dirty || window.confirm("저장하지 않은 수정을 버릴까요?")) setEpId(e.target.value); }}>
          {Object.entries(groups).map(([pl, list]) => <optgroup key={pl} label={pl}>{list.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</optgroup>)}
        </select>
        {!d.tl && <span className="badge warn" data-tip="이 컴퓨터에 이 편 목소리 파일(public/ep/<편>/)이 없음 - 다른 컴에서 복사하거나 목소리를 만들면 언어별로 들림. 길이도 지금은 글자 수 어림">목소리 없음 · 브금·효과음만 들림</span>}
        {d.locked && <span className="badge" data-tip="유튜브에 올린 편 - 화면·장면 순서·영어 대사·인물 배치는 잠금. 더빙 대사·효과음·브금만 수정">업로드됨 {d.locked}</span>}
        <IconBtn n="undo" label="되돌리기 (⌘Z)" onClick={() => undo()} />
        <IconBtn n="redo" label="다시 하기 (⇧⌘Z)" onClick={() => undo(true)} />
        <button data-tip="저장 내역 보기·되돌리기 (저장할 때마다 이전 상태가 남음)" onClick={() => setHistoryOpen(true)}>내역</button>
        <button className="primary" data-tip="장면표 저장 (⌘S) - 저장 전 상태는 내역에 남음" disabled={!dirty || !!busy} onClick={() => setSaveAsk(true)}>저장</button>
        <button data-tip="대본 검사 다시 하기" onClick={() => runCheck(epId)}>검사</button>
        {m && <span className="counts"><b className={+m[1] ? "err" : "ok"}>{m[1]}</b> 오류 · <b className="warn">{m[2]}</b> 경고</span>}
        <span className="grow" />
      </header>

      <aside className="left">
        <TimingSummary d={d} timing={timing} onPick={seekScene}
          onSrt={async () => { try { const r = await api<{ files: string[]; stale: string[] }>(`/api/srt?e=${epId}`); r.files.forEach((f) => window.open(f)); if (r.stale.length) say(`목소리 만든 뒤 바뀐 대사 ${r.stale.length}곳 - 자막 시간이 어긋남 (장면 ${r.stale.slice(0, 5).join(", ")}…)`); } catch (e) { say((e as Error).message); } }} />
        <IssueList issues={issues} onPick={seekScene} />
      </aside>

      <section className="stage">
        <div className={"playerWrap" + (overPlayer ? " over" : "")}
          onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); setOverPlayer(true); } }}
          onDragLeave={() => setOverPlayer(false)}
          onDrop={(e) => {
            e.preventDefault(); setOverPlayer(false);
            const snd = e.dataTransfer.getData(DRAG_TYPE);
            if (snd) { const { src, kind } = JSON.parse(snd); if (kind === "bgm") setMusicAt(src.replace(/^bgm\/|\.wav$/g, ""), frame / FPS); else addCue(src, frame / FPS); }
          }}>
          <Player ref={player} component={Episode as never} inputProps={inputProps} durationInFrames={total} fps={FPS}
            compositionWidth={1920} compositionHeight={1080} style={{ width: "100%", aspectRatio: "16/9", background: "#000" }}
            acknowledgeRemotionLicense numberOfSharedAudioTags={12} />
        </div>
        <div className="transport">
          <IconBtn n="prev" label="이전 장면 (←)" onClick={() => seekScene(Math.max(0, sel - 1))} />
          <button className="icon play" data-tip={playing ? "멈춤 (Space)" : "재생 (Space)"} aria-label={playing ? "멈춤" : "재생"} onClick={() => player.current?.toggle()}><Icon n={playing ? "pause" : "play"} s={18} /></button>
          <IconBtn n="next" label="다음 장면 (→)" onClick={() => seekScene(Math.min(d.ep.scenes.length - 1, sel + 1))} />
          <span className="time">{tc(frame)} <span className="dim">/ {tc(total)}</span></span>
          <span className="grow" />
          <select aria-label="재생 언어" data-tip="들을 더빙 언어" value={lang} onChange={(e) => setLang(e.target.value)}>
            {timing.langs.map((l) => <option key={l} value={l}>{LANG_NAME[l] || l}</option>)}
          </select>
          <input aria-label="확대" data-tip="트랙 확대·축소" type="range" min={8} max={120} value={zoom} onChange={(e) => setZoom(+e.target.value)} />
        </div>
      </section>

      <aside className="right">
        <div className="tabs" role="tablist">
          {([["line", "대사", "대사·목소리·언어별 길이"], ["screen", "화면", "화면·브금·인물·포즈"], ["sound", "소리", "효과음·브금 넣기"], ["char", "인물", "채널 캐릭터 목록 (보기·모습 고치기)"]] as const).map(([k, label, tip]) => (
            <button key={k} role="tab" data-tip={tip} aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
        {tab === "char" ? (
          <CharList ep={d.ep} onPick={seekScene} onEdit={(id) => { setStudioId(id); setGallery(true); }} />
        ) : tab !== "sound" ? (
          <Inspector part={tab} d={d} sel={sel} cue={cue} timing={timing} issues={issues.byScene[sel] || []} sounds={sounds}
            update={update} reorder={reorder} edit={edit} removeCue={removeCue} />
        ) : (
          <>
            <Inspector part="sound" d={d} sel={sel} cue={cue} timing={timing} issues={[]} sounds={sounds} update={update} reorder={reorder} edit={edit} removeCue={removeCue} />
            <SoundPanel sounds={sounds} upload={upload}
              onAdd={(s, kind) => (kind === "bgm" ? setMusicAt(s.name, frame / FPS) : addCue(s.src, frame / FPS))} />
          </>
        )}
      </aside>

      <Tracks d={d} timeline={timeline} timing={timing} sel={sel} cue={cue} frame={frame} zoom={zoom} lang={lang} issues={issues.byScene}
        onSeek={(f) => player.current?.seekTo(f)} onPick={seekScene}
        onPickCue={(c) => { setSel(c.scene); setCue(c); setTab("sound"); }}
        onMoveCue={moveCue} onDropSound={(src, kind, sec) => (kind === "bgm" ? setMusicAt(src.replace(/^bgm\/|\.wav$/g, ""), sec) : addCue(src, sec))}
        onDropFiles={async (files, row, sec) => { const kind = row === "bgm" ? "bgm" : "sfx"; const added = await upload(files, kind); added.forEach((src) => (kind === "bgm" ? setMusicAt(src.replace(/^bgm\/|\.wav$/g, ""), sec) : addCue(src, sec))); }}
        onRemoveCue={removeCue}
        onCharEdit={(id) => { setStudioId(id); setGallery(true); }}
        locked={!!d.locked}
        onSfxOff={(i) => { edit((ep) => { ep.scenes[i].sfx = null; }); say(`장면 ${i} 전환음 끔`); }}
        onMusicClear={(i) => { edit((ep) => { delete ep.scenes[i].music; }); say(`장면 ${i} 브금 바꾸기 해제`); }}
        onSceneDup={(i) => { edit((ep) => { ep.scenes.splice(i + 1, 0, structuredClone(ep.scenes[i])); }, false); setSel(i + 1); setCue(null); }}
        onSceneDel={(i) => { if (!window.confirm(`장면 ${i}을 지울까요?`)) return; edit((ep) => { ep.scenes.splice(i, 1); }, false); setSel(Math.max(0, Math.min(i, d.ep.scenes.length - 2))); setCue(null); }}
        onHold={(i, hold) => edit((ep) => { const v = Math.round(hold * 10) / 10; if (v > 0) ep.scenes[i].hold = v; else delete ep.scenes[i].hold; })} />

      {toast && <div className="toast" role="status">{toast}</div>}
      {saveAsk && <SaveDialog epId={epId} onCancel={() => setSaveAsk(false)} onSave={save} />}
      {busy && <div className="busy" role="status" aria-live="polite"><div className="spinner" /><span>{busy}</span></div>}
      {historyOpen && (
        <HistoryPanel epId={epId} current={d.ep} dirty={dirty} onClose={() => setHistoryOpen(false)}
          onRestore={(ep, label) => { edit(() => {}, false); setD({ ...d, ep, ...(ep.scenes.length !== d.ep.scenes.length ? { tl: null, durs: null } : {}) }); setDirty(true); setSel(0); setCue(null); setHistoryOpen(false); say(`${label} - 확인하고 저장하면 적용`); }}
          onDiscard={() => { api<Data>(`/api/ep?e=${epId}`).then((x) => { setD(x); setDirty(false); setSel(0); setCue(null); setHistoryOpen(false); say("저장 안 한 변경을 버림"); }); }} />
      )}
      {gallery && <Studio initialId={studioId} onClose={(changed) => { setGallery(false); if (changed && !dirty) location.reload(); else if (changed) say("저장 후 새로고침하면 영상에 반영"); }} />}
    </div>
  );
}

// ---------- 아래 트랙 ----------
const DRAG_TYPE = "application/x-rwm-sound";
function Tracks(props: {
  d: Data; timeline: Timeline; timing: Timing; sel: number; cue: CueSel; frame: number; zoom: number; lang: string; issues: Record<string, Issue[]>;
  onSeek: (f: number) => void; onPick: (i: number) => void; onPickCue: (c: NonNullable<CueSel>) => void; onMoveCue: (c: NonNullable<CueSel>, sec: number) => void;
  onDropSound: (src: string, kind: string, sec: number) => void; onDropFiles: (files: File[], row: string, sec: number) => void; onHold: (i: number, hold: number) => void;
  onRemoveCue: (c: NonNullable<CueSel>) => void; locked: boolean; onCharEdit: (id: string) => void; onSfxOff: (i: number) => void; onMusicClear: (i: number) => void; onSceneDup: (i: number) => void; onSceneDel: (i: number) => void;
}) {
  const { d, timeline, timing, sel, cue, frame, zoom, lang, issues } = props;
  // 우클릭 메뉴
  const [menu, setMenu] = useState<{ x: number; y: number; items: { label: string; run: () => void; danger?: boolean; disabled?: boolean }[] } | null>(null);
  const { toggle: listen } = usePreview();
  const openMenu = (e: React.MouseEvent, items: NonNullable<typeof menu>["items"]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - items.length * 32 - 12), items });
  };
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const down = (e: MouseEvent) => e.button !== 2 && close(); // 오른쪽 버튼은 새 메뉴를 여는 중
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("mousedown", down);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("mousedown", down); window.removeEventListener("keydown", key); window.removeEventListener("resize", close); };
  }, [menu]);
  const px = (f: number) => (f / FPS) * zoom;
  const total = timing.starts.at(-1)! + timing.frames.at(-1)!;
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: "hold"; i: number; x: number; hold: number } | { kind: "cue"; c: NonNullable<CueSel>; x: number; sec: number } | null>(null);
  const [ghost, setGhost] = useState<{ x: number; row: string } | null>(null);
  const [cueGhost, setCueGhost] = useState<number | null>(null);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const x = px(frame) + 110;
    if (x < el.scrollLeft + 110 || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = x - el.clientWidth / 3;
  }, [frame, zoom]);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const g = drag.current;
      if (!g) return;
      if (g.kind === "hold") props.onHold(g.i, Math.max(0, g.hold + (e.clientX - g.x) / zoom));
      else setCueGhost(Math.max(0, g.sec + (e.clientX - g.x) / zoom));
    };
    const up = (e: MouseEvent) => {
      const g = drag.current;
      drag.current = null;
      if (g?.kind === "cue") {
        setCueGhost(null);
        if (Math.abs(e.clientX - g.x) > 2) props.onMoveCue(g.c, Math.max(0, g.sec + (e.clientX - g.x) / zoom));
      }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  });

  // 트랙 위 x → 전체 초
  const secAt = (clientX: number) => {
    const lane = scroller.current!.querySelector(".lane") as HTMLElement;
    return Math.max(0, (clientX - lane.getBoundingClientRect().left) / zoom);
  };
  const rowAt = (target: EventTarget) => ((target as HTMLElement).closest("[data-row]") as HTMLElement | null)?.dataset.row || "sfx";
  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(DRAG_TYPE) && !e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setGhost({ x: secAt(e.clientX) * zoom, row: rowAt(e.target) });
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setGhost(null);
    const sec = secAt(e.clientX);
    const row = rowAt(e.target);
    const s = e.dataTransfer.getData(DRAG_TYPE);
    if (s) {
      const { src, kind } = JSON.parse(s);
      props.onDropSound(src, row === "bgm" || kind === "bgm" ? "bgm" : "sfx", sec);
    } else if (e.dataTransfer.files.length) props.onDropFiles([...e.dataTransfer.files], row, sec);
  };

  const sfx = sceneSfx(timeline.scenes, FPS);
  let music: string | undefined;
  const musicSegs: { track: string; from: number; to: number; i: number }[] = [];
  d.ep.scenes.forEach((s, i) => {
    const m = (s.music as string | undefined) || (i === 0 ? d.ep.bgm?.replace(/^bgm\/|\.wav$/g, "") : undefined);
    if (m && m !== music) {
      if (musicSegs.length) musicSegs.at(-1)!.to = timing.starts[i];
      musicSegs.push({ track: m, from: timing.starts[i], to: total, i });
      music = m;
    }
  });
  const ticks: number[] = [];
  const step = zoom > 60 ? 1 : zoom > 25 ? 5 : 10;
  for (let s = 0; s <= total / FPS; s += step) ticks.push(s);

  const row = (key: string, name: React.ReactNode, children: React.ReactNode, cls = "") => (
    <div className={"track " + cls} key={key} data-row={key}>
      <div className="tname">{name}</div>
      <div className="lane" style={{ width: px(total) }}>
        {children}
        {ghost?.row === key && <div className="dropline" style={{ left: ghost.x }} />}
      </div>
    </div>
  );
  const name = (n: string, label: string) => <><Icon n={n} s={13} /> {label}</>;

  return (
    <div className="tracks" ref={scroller} onDragOver={onDragOver} onDragLeave={(e) => { if (e.currentTarget === e.target) setGhost(null); }} onDrop={onDrop}>
      <div className="track ruler">
        <div className="tname" />
        <div className="lane" style={{ width: px(total) }} onMouseDown={(e) => props.onSeek(Math.round(secAt(e.clientX) * FPS))}>
          {ticks.map((s) => <span key={s} className="tick" style={{ left: s * zoom }}>{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</span>)}
        </div>
      </div>
      {row("scene", "화면",
        d.ep.scenes.map((s, i) => {
          const bad = (issues[i] || []).some((x) => x.kind === "오류");
          const show = s.show as { type: string; title?: string; text?: string; name?: string };
          return (
            <div key={i} className={"clip scene" + (i === sel && !cue ? " sel" : "")} style={{ left: px(timing.starts[i]), width: px(timing.frames[i]), background: TYPE_COLOR[show.type] || "#555" }}
              onMouseDown={(e) => { if (e.button === 0 && !(e.target as HTMLElement).classList.contains("handle")) props.onPick(i); }}
              onContextMenu={(e) => { props.onPick(i); openMenu(e, [
                { label: "장면 복제", run: () => props.onSceneDup(i), disabled: props.locked },
                { label: "장면 삭제", run: () => props.onSceneDel(i), danger: true, disabled: props.locked },
              ]); }}>
              <span className="lbl">{i}{bad && <i className="flag" />} <small>{s.speaker || show.title || show.text || show.name || (s.text || "").slice(0, 40)}</small></span>
              {s.hold ? <span className="hold" style={{ width: px((s.hold as number) * FPS) }} /> : null}
              {!props.locked && <span className="handle" data-tip="끌어서 장면 끝 여유 조절" onMouseDown={(e) => { e.stopPropagation(); drag.current = { kind: "hold", i, x: e.clientX, hold: Number(s.hold) || 0 }; }} />}
            </div>
          );
        }), "tall")}
      {row("char", name("user", "인물"),
        d.ep.scenes.map((s, i) => {
          const id = (s.char as string | undefined) || ((s.show as { type: string }).type === "line" ? charForSpeaker(s.speaker) : undefined);
          if (!id || id === "none" || props.locked) return null;
          return (
            <div key={i} className="clip char" style={{ left: px(timing.starts[i]), width: px(timing.frames[i]) }} onMouseDown={(e) => e.button === 0 && props.onPick(i)}
              onContextMenu={(e) => { props.onPick(i); openMenu(e, [
                { label: "캐릭터 모습 고치기", run: () => props.onCharEdit(id) },
              ]); }}>
              {d.chars[id] || id}{s.pose ? ` · ${POSE_NAME[s.pose as string] || s.pose}` : ""}
            </div>
          );
        }))}
      {row("sfx", name("wave", "효과음"), <>
        {sfx.map((x, i) => x && (
          <div key={"d" + i} className="clip sfx auto" data-tip="전환음 (우클릭: 끄기)" style={{ left: px(timing.starts[i]) }} onMouseDown={(e) => e.button === 0 && props.onPick(i)}
            onContextMenu={(e) => openMenu(e, [
              { label: "듣기", run: () => listen(`sfx/ep/${x[0]}.wav`) },
              { label: "이 장면 전환음 끄기", run: () => props.onSfxOff(i), danger: true },
            ])}>{x[0]}</div>
        ))}
        {d.ep.scenes.flatMap((s, i) => (s.cues || []).map((c, k) => {
          const on = cue?.scene === i && cue.k === k;
          const sec = on && cueGhost !== null ? cueGhost : timing.starts[i] / FPS + c.at;
          return (
            <div key={`c${i}-${k}`} className={"clip sfx cue" + (on ? " sel" : "")} style={{ left: sec * zoom }}
              onMouseDown={(e) => { if (e.button !== 0) return; e.stopPropagation(); props.onPickCue({ scene: i, k }); drag.current = { kind: "cue", c: { scene: i, k }, x: e.clientX, sec: timing.starts[i] / FPS + c.at }; }}
              onContextMenu={(e) => { props.onPickCue({ scene: i, k }); openMenu(e, [
                { label: "듣기", run: () => listen(c.src) },
                { label: "삭제", run: () => props.onRemoveCue({ scene: i, k }), danger: true },
              ]); }}>
              {c.src.split("/").pop()!.replace(/\.wav$/, "")}
            </div>
          );
        }))}
      </>)}
      {row("bgm", name("music", "브금"),
        musicSegs.map((m) => (
          <div key={m.from} className="clip music" style={{ left: px(m.from), width: px(m.to - m.from), background: MUSIC_COLOR[m.track] || "#4a4a5a" }} onMouseDown={(e) => e.button === 0 && props.onPick(m.i)}
            onContextMenu={(e) => openMenu(e, [
              { label: "듣기", run: () => listen(`bgm/${m.track}.wav`) },
              { label: "여기서 바꾸기 해제 (앞 곡 이어서)", run: () => props.onMusicClear(m.i), danger: true, disabled: !d.ep.scenes[m.i].music || m.i === 0 },
            ])}>{m.track}</div>
        )))}
      {timing.langs.map((l) => row("vo-" + l, <>{LANG_NAME[l] || l}{l === lang && <span className="live"><Icon n="speaker" s={12} /></span>}</>,
        d.ep.scenes.map((s, i) => {
          const p = timing.per[i].find((x) => x.lang === l)!;
          if (!p.secs) return null;
          const sceneSecs = timing.frames[i] / FPS;
          const st = fillState(p.secs, sceneSecs);
          return (
            <div key={i} className={`clip voice ${st.tone}${p.real ? "" : " est"}`} onMouseDown={() => props.onPick(i)}
              title={`${p.secs.toFixed(1)}초 / ${sceneSecs.toFixed(1)}초${st.silence > 1.2 ? ` · 침묵 ${st.silence.toFixed(1)}초` : ""}${p.stale ? " · 다시 만들어야 함" : ""}`}
              style={{ left: px(timing.starts[i]), width: Math.max(3, p.secs * zoom) }}>
              {p.secs * zoom > 34 ? p.secs.toFixed(1) : ""}
            </div>
          );
        })))}
      <div className="playhead" style={{ left: 110 + px(frame) }} />
      {menu && (
        <div className="ctx" role="menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
          {menu.items.map((it) => (
            <button key={it.label} role="menuitem" disabled={it.disabled} className={it.danger ? "danger" : ""} onClick={() => { setMenu(null); it.run(); }}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- 오른쪽 소리 탭 ----------
// ---------- 오른쪽 인물 탭: 채널 캐릭터 목록 (보기 전용 - 넣고 빼는 건 시나리오 단계) ----------
type CharInfo = { ko?: string; about?: string; speakers?: string[]; names?: string[] };
function CharList({ ep, onPick, onEdit }: { ep: Ep; onPick: (i: number) => void; onEdit: (id: string) => void }) {
  const [chars, setChars] = useState<Record<string, CharInfo>>({});
  useEffect(() => { api<Record<string, CharInfo>>("/api/chars").then(setChars); }, []);
  // 이 편에서 나오는 장면 (대사 카드 말하는 사람 또는 장면 char)
  const scenesOf = (id: string, c: CharInfo) =>
    ep.scenes.flatMap((sc, i) => (sc.char === id || (!sc.char && c.speakers?.some((x) => x.toUpperCase() === (sc.speaker || "").toUpperCase())) ? [i] : []));
  const list = Object.entries(chars).map(([id, c]) => ({ id, c, at: scenesOf(id, c) })).sort((a, b) => (b.at.length ? 1 : 0) - (a.at.length ? 1 : 0));
  return (
    <div className="soundPanel">
      <ul className="charRows">
        {list.map(({ id, c, at }) => (
          <li key={id}>
            <div className="cthumb">{["body", "head", "eyes0", "mouth0"].map((l) => <img key={l} src={`/chars/${id}/front/${l}.svg`} alt="" />)}</div>
            <div className="cinfo">
              <div className="row"><b>{c.ko || id}</b><span className="dim">{c.speakers?.[0] || c.names?.[0] || ""}</span><span className="grow" />
                <button className="small" data-tip="색·모자·옷 등 모습 고치기" onClick={() => onEdit(id)}>모습</button></div>
              <p>{c.about || <span className="dim">설명 없음</span>}</p>
              <div className="chips">
                {at.length ? at.slice(0, 12).map((i) => <button key={i} className="chip" data-tip={`장면 ${i}로 이동`} onClick={() => onPick(i)}>{i}</button>) : <span className="dim">이 편엔 안 나옴</span>}
                {at.length > 12 && <span className="dim">+{at.length - 12}</span>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SoundPanel({ sounds, upload, onAdd }: { sounds: Sounds; upload: (f: File[], kind: "sfx" | "bgm") => Promise<string[]>; onAdd: (s: Sound, kind: "sfx" | "bgm") => void }) {
  const { playing, toggle } = usePreview();
  const [q, setQ] = useState("");
  const [over, setOver] = useState<"sfx" | "bgm" | null>(null);
  const filt = (l: Sound[]) => l.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));
  const list = (items: Sound[], kind: "sfx" | "bgm") =>
    items.map((s) => (
      <li key={s.src} draggable onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ src: s.src, kind })); e.dataTransfer.effectAllowed = "copy"; }}>
        <button className={"icon" + (playing === s.src ? " on" : "")} aria-label={playing === s.src ? "멈춤" : "듣기"} data-tip={playing === s.src ? "멈춤" : "미리듣기"} onClick={() => toggle(s.src)}><Icon n={playing === s.src ? "pause" : "play"} s={14} /></button>
        <span className="sname">{s.name}</span>
        <span className="dim">{s.secs ? s.secs.toFixed(1) + "s" : ""}</span>
        <button className="icon" aria-label="재생 위치에 넣기" data-tip="재생 위치에 넣기" onClick={() => onAdd(s, kind)}><Icon n="plus" s={14} /></button>
      </li>
    ));
  const zone = (kind: "sfx" | "bgm", label: string, items: Sound[]) => {
    const groups: Record<string, Sound[]> = {};
    filt(items).forEach((s) => (groups[s.group] ??= []).push(s));
    return (
      <section className={"lib" + (over === kind ? " over" : "")}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(kind); } }}
        onDragLeave={() => setOver(null)}
        onDrop={(e) => { e.preventDefault(); setOver(null); upload([...e.dataTransfer.files], kind); }}>
        <div className="libhead">
          <h3>{label}</h3>
          <label className="icon upload" data-tip="내 소리 파일 추가 (끌어다 놓아도 됨)">
            <Icon n="upload" s={14} />
            <input type="file" accept="audio/*" multiple hidden onChange={(e) => { upload([...(e.target.files || [])], kind); e.target.value = ""; }} />
          </label>
        </div>
        {Object.entries(groups).map(([g, l]) => <div key={g}>{g !== label && <h4>{g}</h4>}<ul className="sounds">{list(l, kind)}</ul></div>)}
      </section>
    );
  };
  return (
    <div className="soundPanel">
      <div className="search"><Icon n="search" s={14} /><input aria-label="소리 찾기" placeholder="찾기" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {zone("sfx", "효과음", sounds.sfx)}
      {zone("bgm", "브금", sounds.bgm)}
    </div>
  );
}

// ---------- 왼쪽 ----------
function TimingSummary({ d, timing, onPick, onSrt }: { d: Data; timing: Timing; onPick: (i: number) => void; onSrt: () => void }) {
  const totalSecs = (timing.starts.at(-1)! + timing.frames.at(-1)!) / FPS;
  const rows = timing.langs.map((l) => {
    let voiced = 0, est = 0, stale = 0;
    timing.per.forEach((p) => { const x = p.find((y) => y.lang === l)!; voiced += x.secs; if (!x.real && x.secs) est++; if (x.stale) stale++; });
    return { l, voiced, est, stale };
  });
  const worst = timing.per
    .map((p, i) => {
      const v = p.map((x) => x.secs).filter(Boolean);
      return { i, ratio: v.length > 1 ? Math.max(...v) / Math.min(...v) : 1, long: p.reduce((a, b) => (b.secs > a.secs ? b : a)).lang };
    })
    .filter((x) => x.ratio > 1.35)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 12);
  return (
    <div className="box">
      <div className="boxhead"><h3>언어 타이밍</h3><span className="grow" /><button className="small" data-tip="언어별 자막 파일(.srt) 만들기 - 목소리를 만든 뒤" onClick={onSrt}>자막 파일</button></div>
      <table><tbody>
        {rows.map((r) => (
          <tr key={r.l}>
            <td>{LANG_NAME[r.l] || r.l}</td>
            <td><div className="meter"><i className="ok" style={{ width: `${(r.voiced / totalSecs) * 100}%` }} /></div></td>
            <td className="num">{Math.round((r.voiced / totalSecs) * 100)}%</td>
            <td className="dim">{r.stale ? `${r.stale} 다시` : r.est ? "어림" : ""}</td>
          </tr>
        ))}
      </tbody></table>
      {worst.length > 0 && (
        <ul className="picks">
          {worst.map((w) => <li key={w.i} onClick={() => onPick(w.i)}><span className="num">{w.i}</span> {LANG_NAME[w.long] || w.long} ×{w.ratio.toFixed(1)} <span className="dim">{(d.ep.scenes[w.i].text || "").slice(0, 30)}</span></li>)}
        </ul>
      )}
    </div>
  );
}

function IssueList({ issues, onPick }: { issues: { byScene: Record<string, Issue[]>; general: Issue[] }; onPick: (i: number) => void }) {
  const list = Object.entries(issues.byScene).flatMap(([i, l]) => l.map((x) => ({ i: +i, ...x })));
  if (!list.length && !issues.general.length) return null;
  return (
    <div className="box">
      <h3>검사</h3>
      <ul className="picks">
        {list.map((x, k) => <li key={k} className={"iss " + x.kind} onClick={() => onPick(x.i)}><span className="num">{x.i}</span> {x.msg}</li>)}
        {issues.general.map((g, k) => <li key={"g" + k} className={"iss " + g.kind}>{g.msg}</li>)}
      </ul>
    </div>
  );
}

// ---------- 저장 이름 묻기 ----------
function SaveDialog({ epId, onCancel, onSave }: { epId: string; onCancel: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState("");
  const [dir, setDir] = useState("");
  useEffect(() => { api<{ dir: string }>(`/api/edits?e=${epId}`).then((r) => setDir(r.dir)); }, [epId]);
  const n = new Date(), z = (x: number) => String(x).padStart(2, "0");
  const stamp = `${z(n.getMonth() + 1)}${z(n.getDate())}${z(n.getHours())}${z(n.getMinutes())}`;
  const clean = name.replace(/[/\\:*?"<>|]/g, "").trim();
  return (
    <div className="modalBack" onMouseDown={onCancel}>
      <form className="saveBox" role="dialog" aria-label="저장" onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (clean) onSave(clean); }} onKeyDown={(e) => e.key === "Escape" && onCancel()}>
        <h2>저장</h2>
        <label htmlFor="saveName">무엇을 고쳤는지 이름</label>
        <input id="saveName" autoFocus placeholder="예: 스페인어 대사 다듬기" value={name} onChange={(e) => setName(e.target.value)} />
        <p className="dim savePath">{dir}/<b>{stamp}-{clean || "이름"}</b>.json</p>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel}>취소</button>
          <button type="submit" className="primary" disabled={!clean}>저장</button>
        </div>
      </form>
    </div>
  );
}

// ---------- 내역: 저장할 때마다 남긴 이전 장면표와 비교해서 무엇이 바뀌었는지 보여 주고 되돌림 ----------
type Change = { scene: string; what: string; before?: string; after?: string };
const FIELD_NAME: [string, string][] = [["text", "영어 대사"], ["speaker", "말하는 사람"], ["role", "목소리"], ["show", "화면"], ["music", "브금"], ["sfx", "전환음"], ["cues", "효과음"], ["char", "인물"], ["pose", "포즈"], ["facing", "보는 방향"], ["charAt", "인물 위치"], ["hold", "여유"]];
const short = (v: unknown) => { if (v === undefined) return "없음"; const t = typeof v === "string" ? v : JSON.stringify(v); return t.length > 90 ? t.slice(0, 90) + "…" : t; };
const same = (x: unknown, y: unknown) => JSON.stringify(x ?? null, (_, v) => (typeof v === "number" ? +v.toFixed(6) : v)) === JSON.stringify(y ?? null, (_, v) => (typeof v === "number" ? +v.toFixed(6) : v));
function diffEp(a: Ep, b: Ep): Change[] {
  const sig = (s: EpScene) => (s.text || "") + "|" + JSON.stringify(s.show);
  const used = new Set<number>();
  const match = b.scenes.map((s, i) => {
    if (a.scenes[i] && sig(a.scenes[i]) === sig(s)) { used.add(i); return i; }
    return -1;
  });
  b.scenes.forEach((s, i) => { if (match[i] < 0) { const j = a.scenes.findIndex((x, k) => !used.has(k) && sig(x) === sig(s)); if (j >= 0) { used.add(j); match[i] = j; } } });
  b.scenes.forEach((_, i) => { if (match[i] < 0 && a.scenes[i] && !used.has(i)) { used.add(i); match[i] = i; } });
  // 실제로 옮긴 장면만 "이동": 원래 순서를 지킨 가장 긴 줄(LIS)에 든 장면은 밀렸을 뿐
  const idx = match.map((m, i) => [m, i]).filter(([m]) => m >= 0);
  const tails: number[] = [], prev: number[] = new Array(idx.length).fill(-1), at: number[] = [];
  idx.forEach(([m], k) => {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (idx[tails[mid]][0] < m) lo = mid + 1; else hi = mid; }
    prev[k] = lo ? tails[lo - 1] : -1; tails[lo] = k; at[k] = lo;
  });
  const stay = new Set<number>();
  for (let k = tails[tails.length - 1] ?? -1; k >= 0; k = prev[k]) stay.add(idx[k][1]);
  const out: Change[] = [];
  b.scenes.forEach((s, i) => {
    const m = match[i];
    if (m < 0) return out.push({ scene: `${i}`, what: "새 장면", after: short(s.text || s.show) });
    const o = a.scenes[m];
    if (!stay.has(i)) out.push({ scene: `${i}`, what: `자리 이동 (원래 ${m}번)` });
    for (const [k, name] of FIELD_NAME) if (!same(o[k], s[k])) out.push({ scene: `${i}`, what: name, before: short(o[k]), after: short(s[k]) });
    const langs = new Set([...Object.keys(o.i18n || {}), ...Object.keys(s.i18n || {})]);
    for (const l of langs) if (!same(o.i18n?.[l], s.i18n?.[l])) out.push({ scene: `${i}`, what: `${LANG_NAME[l] || l} 대사`, before: short(o.i18n?.[l]), after: short(s.i18n?.[l]) });
  });
  a.scenes.forEach((s, k) => { if (!used.has(k)) out.push({ scene: `원래 ${k}`, what: "장면 삭제", before: short(s.text || s.show) }); });
  if (!same(a.bgm, b.bgm)) out.push({ scene: "편", what: "기본 브금", before: short(a.bgm), after: short(b.bgm) });
  return out;
}

function HistoryPanel({ epId, current, dirty, onClose, onRestore, onDiscard }: {
  epId: string; current: Ep; dirty: boolean; onClose: () => void; onRestore: (ep: Ep, label: string) => void; onDiscard: () => void;
}) {
  const [list, setList] = useState<{ id: string; time: string }[]>([]);
  const [edits, setEdits] = useState<{ id: string; name: string; time: string }[]>([]);
  const [file, setFile] = useState<Ep | null>(null);
  const [pick, setPick] = useState<string>(dirty ? "unsaved" : "");
  const [snaps, setSnaps] = useState<Record<string, Ep>>({});
  useEffect(() => {
    api<{ id: string; time: string }[]>(`/api/history?e=${epId}`).then((l) => { setList(l); if (!dirty && l[0]) setPick(l[0].id); });
    api<Data>(`/api/ep?e=${epId}`).then((x) => setFile(x.ep));
    api<{ list: { id: string; name: string; time: string }[] }>(`/api/edits?e=${epId}`).then((r) => setEdits(r.list));
  }, [epId, dirty]);
  const load = async (id: string) => snaps[id] ?? (await api<Ep>(id.startsWith("edit:") ? `/api/edits/one?e=${epId}&id=${encodeURIComponent(id.slice(5))}` : `/api/history/one?e=${epId}&id=${id}`).then((x) => (setSnaps((m) => ({ ...m, [id]: x })), x)));
  useEffect(() => { if (pick && pick !== "unsaved") load(pick); const i = list.findIndex((x) => x.id === pick); if (i > 0) load(list[i - 1].id); }, [pick, list]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  // 저장 하나 = (그 저장 직전 상태) → (다음 저장 직전 상태 또는 지금 파일)
  let before: Ep | undefined, after: Ep | undefined;
  if (pick === "unsaved") { before = file ?? undefined; after = current; }
  else if (pick.startsWith("edit:")) { before = file ?? undefined; after = snaps[pick]; } // 지금 파일 → 그 편집본
  else { const i = list.findIndex((x) => x.id === pick); before = snaps[pick]; after = i === 0 ? file ?? undefined : snaps[list[i - 1]?.id]; }
  const changes = before && after ? diffEp(before, after) : null;
  const picked = list.find((x) => x.id === pick);
  return (
    <div className="modalBack" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-label="내역" onMouseDown={(e) => e.stopPropagation()}>
        <div className="studioHead"><h2>내역</h2><span className="dim">저장할 때마다 저장 직전 상태가 남아요</span><span className="grow" /><IconBtn n="x" label="닫기 (Esc)" onClick={onClose} /></div>
        <div className="histBody">
          <nav className="histList">
            {dirty && <button className={pick === "unsaved" ? "on" : ""} onClick={() => setPick("unsaved")}><b>저장 안 한 변경</b><small className="dim">지금 편집기</small></button>}
            {edits.length > 0 && <h4 className="histGroup">편집본</h4>}
            {edits.map((h) => <button key={h.id} className={pick === "edit:" + h.id ? "on" : ""} onClick={() => setPick("edit:" + h.id)}><b>{h.name}</b><small className="dim">{h.time}</small></button>)}
            {list.length > 0 && <h4 className="histGroup">자동 저장 내역</h4>}
            {list.map((h) => <button key={h.id} className={pick === h.id ? "on" : ""} onClick={() => setPick(h.id)}><b>{h.time.slice(5, 16)}</b><small className="dim">저장</small></button>)}
            {!list.length && !dirty && <p className="dim" style={{ padding: 10 }}>아직 저장한 적 없음</p>}
          </nav>
          <section className="histDiff">
            {changes === null ? <p className="dim">불러오는 중</p> : changes.length === 0 ? <p className="dim">바뀐 것 없음</p> : (
              <table className="diff"><tbody>
                {changes.map((c, k) => (
                  <tr key={k}>
                    <td className="num">{c.scene}</td>
                    <td><b>{c.what}</b>{(c.before || c.after) && <div className="ba">{c.before !== undefined && <span className="b">{c.before}</span>}{c.after !== undefined && <span className="a">{c.after}</span>}</div>}</td>
                  </tr>
                ))}
              </tbody></table>
            )}
            <div className="row histActions">
              {pick === "unsaved" ? (
                <button className="danger" data-tip="마지막 저장 상태로 돌아감" onClick={() => window.confirm("저장 안 한 변경을 모두 버릴까요?") && onDiscard()}>저장 안 한 변경 버리기</button>
              ) : pick.startsWith("edit:") && snaps[pick] ? (
                <button data-tip="이 편집본을 편집기에 불러옴 - 확인 후 저장해야 적용" onClick={() => onRestore(snaps[pick], `편집본 "${edits.find((x) => "edit:" + x.id === pick)?.name}" 불러옴`)}>이 편집본 불러오기</button>
              ) : picked && snaps[pick] ? (
                <button data-tip="이 저장을 하기 직전 상태를 편집기에 불러옴 - 확인 후 저장해야 적용" onClick={() => onRestore(snaps[pick], `${picked.time.slice(5, 16)} 저장 전으로 되돌림`)}>이 저장 전으로 되돌리기</button>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ---------- 확대·이동 (시작 → 끝). 확대 한도 = 그림 폭 ÷ 렌더 폭(1440p) - 넘으면 원본을 늘려서 흐려짐 (02 지도 선명도 규칙) ----------
type V3 = [number, number, number];
type CamShow = { type: string; img?: string; from: V3; to: V3 };
const natCache: Record<string, { w: number; h: number }> = {};
function Camera({ show, locked, onChange }: { show: CamShow; locked: boolean; onChange: (key: "from" | "to", idx: number, v: number) => void }) {
  const [nat, setNat] = useState(show.img ? natCache[show.img] : undefined);
  useEffect(() => {
    if (!show.img) return;
    if (natCache[show.img]) return setNat(natCache[show.img]);
    const im = new Image();
    im.onload = () => { natCache[show.img!] = { w: im.naturalWidth, h: im.naturalHeight }; setNat(natCache[show.img!]); };
    im.src = "/" + show.img;
  }, [show.img]);
  // 지도는 z=1에서 화면 폭을 채움, 그림은 화면 안에 맞춤(contain)
  const shownW = nat ? (show.type === "map" ? 1920 : Math.min(1920, (1080 * nat.w) / nat.h)) : 0;
  const maxZ = nat ? nat.w / (shownW * (2560 / 1920)) : null;
  const row = (key: "from" | "to", label: string) => (
    <div className="cam">
      <span className="camLabel">{label}</span>
      {(["x", "y", "확대"] as const).map((n, idx) => {
        const v = show[key][idx];
        const over = idx === 2 && maxZ !== null && v > maxZ + 0.001;
        return (
          <label key={n} className={"camField" + (over ? " over" : "")} data-tip={idx === 2 ? `확대 배율${maxZ ? ` - 이 그림은 ${maxZ.toFixed(2)}배까지 선명` : ""}` : idx === 0 ? "가로 위치 (0 왼쪽 ~ 1 오른쪽)" : "세로 위치 (0 위 ~ 1 아래)"}>
            <span>{n}</span>
            <input type="range" disabled={locked} min={idx === 2 ? 0.5 : 0} max={idx === 2 ? 4 : 1} step={idx === 2 ? 0.05 : 0.01} value={v} onChange={(e) => onChange(key, idx, +e.target.value)} />
            <input type="number" disabled={locked} step={idx === 2 ? 0.05 : 0.01} value={v} onChange={(e) => onChange(key, idx, +e.target.value)} />
          </label>
        );
      })}
    </div>
  );
  const worst = Math.max(show.from[2], show.to[2]);
  return (
    <>
      <label>카메라 {nat && <span className="dim">· 그림 {nat.w}×{nat.h}</span>}</label>
      {row("from", "시작")}
      {row("to", "끝")}
      {maxZ !== null && worst > maxZ + 0.001 && <p className="iss 오류">확대 {worst.toFixed(2)}배 - 흐려짐 (이 그림은 {maxZ.toFixed(2)}배까지). 더 당기려면 확대 세트를 따로 캡처</p>}
    </>
  );
}

// ---------- 오른쪽 장면 탭 ----------
function Inspector({ part, d, sel, cue, timing, issues, sounds, update, reorder, edit, removeCue }: {
  part: "line" | "screen" | "sound"; d: Data; sel: number; cue: CueSel; timing: Timing; issues: Issue[]; sounds: Sounds;
  update: (fn: (sc: EpScene) => void) => void; reorder: (fn: (s: EpScene[]) => number) => void; edit: (fn: (ep: Ep) => void) => void; removeCue: (c: NonNullable<CueSel>) => void;
}) {
  const sc = d.ep.scenes[sel];
  const [showText, setShowText] = useState(JSON.stringify(sc.show));
  const [showErr, setShowErr] = useState("");
  const { playing, toggle } = usePreview();
  // 입력 중엔 다시 정렬하지 않음: 칸의 내용과 실제 값이 다를 때만(장면 이동·되돌리기·슬라이더) 다시 채움
  useEffect(() => {
    let same = false;
    try { same = JSON.stringify(JSON.parse(showText)) === JSON.stringify(sc.show); } catch {}
    if (!same) { setShowText(JSON.stringify(sc.show)); setShowErr(""); }
  }, [sel, sc.show]);
  const langs = timing.langs.filter((l) => l !== "en");
  const sceneSecs = timing.frames[sel] / FPS;
  const iss = (re: RegExp) => issues.filter((x) => re.test(x.msg)).map((x, k) => <p key={k} className={"iss " + x.kind}>{x.msg}</p>);
  const set = (k: string, v: unknown) => update((s) => { if (v === "" || v === undefined) delete s[k]; else s[k] = v; });
  const sfxVal = sc.sfx === null ? "__off" : (sc.sfx as string) || "";
  const charId = (sc.char as string) || ((sc.show as { type: string }).type === "line" ? charForSpeaker(sc.speaker) : "");
  const c = cue && cue.scene === sel ? sc.cues?.[cue.k] : undefined;
  const locked = !!d.locked;

  if (part === "sound") return c && cue ? (
    <div className="pane top">

        <div className="box accent">
          <div className="boxhead">
            <h3>효과음</h3>
            <button className={"icon" + (playing === c.src ? " on" : "")} aria-label="듣기" data-tip="미리듣기" onClick={() => toggle(c.src)}><Icon n={playing === c.src ? "pause" : "play"} s={14} /></button>
            <IconBtn n="trash" label="효과음 삭제" onClick={() => removeCue(cue)} />
          </div>
          <select aria-label="소리" value={c.src} onChange={(e) => edit((ep) => { ep.scenes[sel].cues![cue.k].src = e.target.value; })}>
            {[...sounds.sfx, ...sounds.bgm].map((s) => <option key={s.src} value={s.src}>{s.group} · {s.name}</option>)}
          </select>
          <div className="two">
            <div><label>시작</label><input type="number" step={0.05} min={0} value={c.at} onChange={(e) => edit((ep) => { ep.scenes[sel].cues![cue.k].at = Math.max(0, +e.target.value); })} /></div>
            <div><label>크기 {Math.round((c.vol ?? 0.6) * 100)}</label><input type="range" min={0} max={1} step={0.05} value={c.vol ?? 0.6} onChange={(e) => edit((ep) => { ep.scenes[sel].cues![cue.k].vol = +e.target.value; })} /></div>
          </div>
        </div>
    </div>
  ) : null;
  if (part === "screen") return (
    <div className="pane">
      <div className="box grow-box">
        <h3>화면</h3>
        <div className="two">
          <div><label>브금</label>
            <select value={(sc.music as string) || ""} onChange={(e) => set("music", e.target.value)}>
              <option value="">이어서</option>{sounds.bgm.map((b) => <option key={b.name}>{b.name}</option>)}
            </select></div>
          <div><label>전환음</label>
            <select value={sfxVal} onChange={(e) => update((s) => { const v = e.target.value; if (v === "__off") s.sfx = null; else if (v) s.sfx = v; else delete s.sfx; })}>
              <option value="">기본</option><option value="__off">끔</option>{d.sfx.map((x) => <option key={x}>{x}</option>)}
            </select></div>
        </div>
        {charId && charId !== "none" && !locked && <>
        <label>인물 · {d.chars[charId] || charId}</label>
        <div className="row">
          <div className="thumb" style={{ transform: sc.facing === "left" ? "scaleX(-1)" : undefined }}>{charId && ["body", "head", "eyes0", "mouth0"].map((l) => <img key={l} src={`/chars/${charId}/${(sc.pose as string) || "front"}/${l}.svg`} alt="" />)}</div>
          <div style={{ flex: 1, display: "grid", gap: 6 }}>
            <div className="row">
              <select aria-label="포즈" value={(sc.pose as string) || "front"} onChange={(e) => set("pose", e.target.value === "front" ? "" : e.target.value)} style={{ flex: 1 }}>
                {POSES.map((x) => <option key={x} value={x}>{POSE_NAME[x]}</option>)}
              </select>
              <div className="seg" role="group" aria-label="위치">
                {([["left", "왼쪽에 세우기", "◧"], ["center", "가운데 세우기", "▣"], ["right", "오른쪽에 세우기", "◨"]] as const).map(([k, tip, g]) => (
                  <button key={k} data-tip={tip} className={((sc.charAt as string) || "right") === k ? "on" : ""} onClick={() => set("charAt", k === "right" ? "" : k)}>{g}</button>
                ))}
              </div>
            </div>
            <div className="row">
              <span className="dim" style={{ fontSize: 11.5 }}>보는 방향</span>
              <div className="seg" role="group" aria-label="방향">
                <button data-tip="왼쪽을 봄" className={sc.facing === "left" ? "on" : ""} onClick={() => set("facing", "left")}>왼쪽</button>
                <button data-tip="오른쪽을 봄" className={sc.facing === "right" ? "on" : ""} onClick={() => set("facing", "right")}>오른쪽</button>
                <button data-tip="서 있는 자리에 맞춰 화면 안쪽을 봄" className={!sc.facing ? "on" : ""} onClick={() => set("facing", "")}>자동</button>
              </div>
            </div>
          </div>
        </div>
        </>}
        {"from" in (sc.show as object) && "to" in (sc.show as object) && (
          <Camera show={sc.show as CamShow} locked={locked} onChange={(key, idx, v) => update((s) => { const sh = s.show as CamShow; sh[key] = [...sh[key]] as V3; sh[key][idx] = v; })} />
        )}
        <label>show</label>
        <textarea className="mono fill" rows={4} readOnly={locked} value={showText} onChange={(e) => {
          setShowText(e.target.value);
          try { const v = JSON.parse(e.target.value); setShowErr(""); update((s) => { s.show = v; }); } catch (err) { setShowErr((err as Error).message); }
        }} />
        {showErr && <p className="iss 오류">{showErr}</p>}
      </div>
    </div>
  );
  return (
    <div className="pane">
      <div className="box">
        <div className="boxhead">
          <h3>장면 {sel}</h3><span className="dim num">{sceneSecs.toFixed(1)}s</span><span className="grow" />
          {!locked && <IconBtn n="up" label="위로" onClick={() => reorder((s) => { if (sel > 0) [s[sel - 1], s[sel]] = [s[sel], s[sel - 1]]; return Math.max(0, sel - 1); })} />}
          {!locked && <IconBtn n="down" label="아래로" onClick={() => reorder((s) => { if (sel < s.length - 1) [s[sel + 1], s[sel]] = [s[sel], s[sel + 1]]; return Math.min(s.length - 1, sel + 1); })} />}
          {!locked && <IconBtn n="copy" label="복제" onClick={() => reorder((s) => (s.splice(sel + 1, 0, structuredClone(s[sel])), sel + 1))} />}
          {!locked && <IconBtn n="plus" label="새 장면" onClick={() => reorder((s) => (s.splice(sel + 1, 0, { role: "narrator", text: "", show: { type: "stamp", text: "" }, i18n: {} } as unknown as EpScene), sel + 1))} />}
          {!locked && <IconBtn n="trash" label="장면 삭제" onClick={() => window.confirm(`장면 ${sel}을 지울까요?`) && reorder((s) => (s.splice(sel, 1), Math.min(sel, s.length - 1)))} />}
        </div>
        <table><tbody>
          {timing.per[sel].map((p) => {
            const st = fillState(p.secs, sceneSecs);
            return (
              <tr key={p.lang}>
                <td>{LANG_NAME[p.lang] || p.lang}</td>
                <td><div className="meter"><i className={st.tone} style={{ width: `${Math.min(100, (p.secs / sceneSecs) * 100)}%` }} /></div></td>
                <td className="num">{p.secs ? p.secs.toFixed(1) : "-"}</td>
                <td className="dim">{p.stale ? "다시" : p.real ? "" : "어림"}</td>
              </tr>
            );
          })}
        </tbody></table>
        <label>여유</label>
        <input type="number" step={0.1} min={0} disabled={locked} value={(sc.hold as number) ?? 0} onChange={(e) => set("hold", +e.target.value > 0 ? +e.target.value : undefined)} />
      </div>

      <div className="box grow-box">
        <h3>대사</h3>
        <div className="two">
          <div><label>목소리</label>
            <select disabled={locked} value={(sc.role as string) || ""} onChange={(e) => set("role", e.target.value)}>
              <option value="">-</option>{Object.entries(d.roles).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div><label>말하는 사람</label><input disabled={locked} value={(sc.speaker as string) || ""} onChange={(e) => set("speaker", e.target.value)} /></div>
        </div>
        <label>영어</label>
        <textarea readOnly={locked} value={(sc.text as string) || ""} onChange={(e) => set("text", e.target.value)} />
        {iss(/^en |화면/)}
        {langs.map((l) => (
          <div key={l}>
            <label>{LANG_NAME[l] || l}</label>
            <textarea value={sc.i18n?.[l] || ""} onChange={(e) => update((s) => { (s.i18n ??= {})[l] = e.target.value; })} />
            {iss(new RegExp(`^${l} `))}
          </div>
        ))}
      </div>

    </div>
  );
}

// ---------- 캐릭터 페이지: 인물 하나씩 조절 → 그 인물만 다시 그림 (파이썬, AI 없음) ----------
type CharSpec = Record<string, unknown> & { speakers?: string[]; names?: string[] };
const CHAR_FIELDS: { group: string; items: { k: string; label: string; type: "color" | "select" | "check"; options?: string[] }[] }[] = [
  { group: "얼굴", items: [
    { k: "skin", label: "피부", type: "color" },
    { k: "eyes", label: "눈", type: "select", options: ["almond", "narrow"] },
    { k: "eye_color", label: "눈동자", type: "color" },
    { k: "mood", label: "기본 표정", type: "select", options: ["calm", "stern", "angry", "worried", "smug"] },
    { k: "age", label: "나이", type: "select", options: ["adult", "old"] },
    { k: "scar", label: "흉터", type: "check" },
  ] },
  { group: "머리", items: [
    { k: "hair", label: "머리색", type: "color" },
    { k: "hair_style", label: "머리 모양", type: "select", options: ["braids", "long", "short"] },
    { k: "brow", label: "눈썹", type: "color" },
    { k: "beard", label: "수염", type: "select", options: ["none", "mustache", "goatee", "full"] },
    { k: "beard_color", label: "수염색", type: "color" },
  ] },
  { group: "모자", items: [
    { k: "hat", label: "종류", type: "select", options: ["none", "fur", "helmet", "crown", "turban", "scarf", "hood"] },
    { k: "hat_color", label: "색", type: "color" },
    { k: "fur", label: "털·가장자리", type: "color" },
  ] },
  { group: "옷", items: [
    { k: "outfit", label: "종류", type: "select", options: ["deel", "armor", "gown", "robe"] },
    { k: "cloth", label: "옷감", type: "color" },
    { k: "trim", label: "깃·장식", type: "color" },
    { k: "belt", label: "허리띠", type: "color" },
    { k: "cape", label: "망토", type: "color" },
  ] },
];
const OPT_NAME: Record<string, string> = {
  almond: "보통", narrow: "가늘게", calm: "차분", stern: "엄격", angry: "화남", worried: "걱정", smug: "능청", adult: "어른", old: "노인",
  braids: "땋은 머리", long: "긴 머리", short: "짧은 머리", none: "없음", mustache: "콧수염", goatee: "턱수염", full: "덥수룩",
  fur: "털모자", helmet: "투구", crown: "왕관", turban: "터번", scarf: "머릿수건", hood: "두건", deel: "몽골 옷", armor: "갑옷", gown: "유럽 옷", robe: "긴 옷",
};

function CharFigure({ id, pose, v, talk, t, seed = 0 }: { id: string; pose: string; v: number; talk?: boolean; t: number; seed?: number }) {
  const blink = (t + seed * 17) % 110 < 4;
  const s = Math.sin(t * 0.9 + seed) * Math.sin(t * 0.37 + seed);
  const m = talk ? (s > 0.35 ? 2 : s > -0.2 ? 1 : 0) : 0;
  const src = (l: string) => `/chars/${id}/${pose}/${l}.svg?v=${v}`;
  return (
    <div className="fig">
      <div className="body"><img src={src("body")} alt="" /></div>
      <div className="hd"><img src={src("head")} alt="" /><img src={src(blink ? "eyes1" : "eyes0")} alt="" /><img src={src(`mouth${m}`)} alt="" /></div>
    </div>
  );
}

function Studio({ onClose, initialId = "" }: { onClose: (changed: boolean) => void; initialId?: string }) {
  const [chars, setChars] = useState<Record<string, CharSpec>>({});
  const [id, setId] = useState("");
  const [pose, setPose] = useState("front");
  const [talk, setTalk] = useState(false);
  const [v, setV] = useState(Date.now());
  const [t, setT] = useState(0);
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);
  const timer = useRef<number>();
  useEffect(() => {
    api<Record<string, CharSpec>>("/api/chars").then((c) => { setChars(c); setId(initialId && c[initialId] ? initialId : Object.keys(c)[0] || ""); });
    const h = setInterval(() => setT((x) => x + 1), 1000 / 30);
    return () => clearInterval(h);
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(changed); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [changed, onClose]);

  const push = (cid: string, spec: CharSpec) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setBusy(true);
      const r = await api<{ v: number }>(`/api/char?id=${cid}`, { method: "POST", body: JSON.stringify(spec) });
      setV(r.v); setBusy(false); setChanged(true);
    }, 350);
  };
  const c = chars[id];
  const set = (k: string, val: unknown) => {
    const spec = { ...c };
    if (val === "" || val === false || val === undefined) delete spec[k]; else spec[k] = val;
    setChars({ ...chars, [id]: spec });
    push(id, spec);
  };
  const list = (k: "speakers" | "names") => ((c?.[k] as string[]) || []).join(", ");
  return (
    <div className="studio" role="dialog" aria-label="캐릭터">
      <div className="studioHead">
        <h2>캐릭터</h2>
        {busy && <span className="dim">그리는 중</span>}
        <span className="grow" />
        <IconBtn n="x" label="닫기" onClick={() => onClose(changed)} />
      </div>
      <div className="studioBody">
        <nav className="charList">
          {Object.entries(chars).map(([cid, cs], k) => (
            <button key={cid} data-tip={`${cid} 고치기`} className={cid === id ? "on" : ""} onClick={() => setId(cid)}>
              <span className="mini"><CharFigure id={cid} pose="front" v={v} t={0} seed={k} /></span>
              <span><b>{(cs.ko as string) || cs.speakers?.[0] || cid}</b><small className="dim">{cs.speakers?.[0] || cid}</small></span>
            </button>
          ))}
</nav>
        {c ? (
          <>
            <section className="charStage">
              <div className="bigFig" style={{ cursor: "pointer" }} onClick={() => setTalk(!talk)}>
                <CharFigure id={id} pose={pose} v={v} talk={talk} t={t} />
              </div>
              <div className="row center">
                <button data-tip="말하는 모습 보기" className={talk ? "on" : ""} onClick={() => setTalk(!talk)}>{talk ? "말하기 끄기" : "말하기"}</button>
              </div>
              <div className="poseStrip">
                {POSES.map((x) => (
                  <button key={x} data-tip={`${POSE_NAME[x]} 포즈 보기`} className={x === pose ? "on" : ""} onClick={() => setPose(x)}>
                    <CharFigure id={id} pose={x} v={v} t={t} seed={3} />
                    <span>{POSE_NAME[x]}</span>
                  </button>
                ))}
              </div>
            </section>
            <aside className="charForm">
              <div className="box">
                <h3>이름</h3>
                <label>한국어 이름</label>
                <input value={(c.ko as string) || ""} onChange={(e) => set("ko", e.target.value)} />
                <label>영상에서 하는 일</label>
                <textarea rows={3} value={(c.about as string) || ""} onChange={(e) => set("about", e.target.value)} />
                <label>대사 카드 이름</label>
                <input value={list("speakers")} onChange={(e) => set("speakers", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} />
                <label>대사 속 이름</label>
                <input value={list("names")} onChange={(e) => set("names", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} />
              </div>
              {CHAR_FIELDS.map((g) => (
                <div className="box" key={g.group}>
                  <h3>{g.group}</h3>
                  <div className="fields">
                    {g.items.map((f) => (
                      <label key={f.k} className="field">
                        <span>{f.label}</span>
                        {f.type === "color" ? (
                          <span className="colorIn">
                            <input type="color" value={(c[f.k] as string) || "#000000"} onChange={(e) => set(f.k, e.target.value)} />
                            {f.k === "cape" && c.cape ? <button className="icon" aria-label="망토 없애기" data-tip="망토 없애기" onClick={(e) => { e.preventDefault(); set("cape", ""); }}><Icon n="x" s={12} /></button> : null}
                          </span>
                        ) : f.type === "check" ? (
                          <input type="checkbox" checked={!!c[f.k]} onChange={(e) => set(f.k, e.target.checked)} />
                        ) : (
                          <select value={(c[f.k] as string) || f.options![0]} onChange={(e) => set(f.k, e.target.value)}>
                            {f.options!.map((o) => <option key={o} value={o}>{OPT_NAME[o] || o}</option>)}
                          </select>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <details className="box">
                <summary>직접 그린 조각 (SVG)</summary>
                <label>머리 위</label>
                <textarea className="mono" rows={3} value={(c.extra_head as string) || ""} onChange={(e) => set("extra_head", e.target.value)} />
                <label>몸 위</label>
                <textarea className="mono" rows={3} value={(c.extra_body as string) || ""} onChange={(e) => set("extra_body", e.target.value)} />
              </details>
              <div className="row">
                <button style={{ flex: 1 }} data-tip="지금 설계로 포즈 6개 다시 그리기" onClick={() => push(id, c)}>다시 그리기</button>
              </div>
            </aside>
          </>
        ) : <div className="empty">캐릭터가 없어요</div>}
      </div>
    </div>
  );
}

// 마우스를 올리면 한국어 설명 (data-tip). 기본 title보다 빨리, 깔끔하게
function Tooltips() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  useEffect(() => {
    let timer = 0;
    let cur: Element | null = null;
    const over = (e: MouseEvent) => {
      const el = (e.target as Element).closest?.("[data-tip]") ?? null;
      if (el === cur) return;
      cur = el;
      window.clearTimeout(timer);
      setTip(null);
      if (!el) return;
      timer = window.setTimeout(() => {
        const r = el.getBoundingClientRect();
        const x = Math.min(window.innerWidth - 90, Math.max(90, r.left + r.width / 2));
        setTip({ text: el.getAttribute("data-tip")!, x, y: r.top < 50 ? r.bottom + 6 : r.top - 30 });
      }, 300);
    };
    const hide = () => { window.clearTimeout(timer); cur = null; setTip(null); };
    document.addEventListener("mouseover", over);
    document.addEventListener("mousedown", hide);
    return () => { document.removeEventListener("mouseover", over); document.removeEventListener("mousedown", hide); };
  }, []);
  return tip ? <div className="tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div> : null;
}

createRoot(document.getElementById("root")!).render(<><App /><Tooltips /></>);
