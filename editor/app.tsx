// 편집기 화면 (캡컷식): 가운데 영상, 아래 트랙, 왼쪽 타이밍·검사, 오른쪽 장면/소리. scripts/editor.mjs가 esbuild로 묶음
// 영상은 실제 렌더와 같은 Episode를 Remotion Player로 재생
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Player, type PlayerRef } from "@remotion/player";
import { Episode, sceneSfx, timelineFrames, type Cue, type Scene, type Timeline } from "../src/episode/Episode";
import { charForSpeaker } from "../src/episode/Character";

const FPS = 30;
const GAP = 0.18; // audio/voice_episode.py와 같게
type EpScene = Omit<Scene, "frames" | "vo"> & { i18n?: Record<string, string>; cues?: Cue[]; [k: string]: unknown };
type Ep = { bgm?: string; langs?: string[]; scenes: EpScene[]; [k: string]: unknown };
type TlScene = { text?: string; i18n?: Record<string, string>; vo: string | null; vo_i18n?: Record<string, string>; frames: number };
type Data = { ep: Ep; tl: TlScene[] | null; durs: Record<string, number>[] | null; bgm: string[]; sfx: string[]; roles: Record<string, string>; chars: Record<string, string> };
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
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5",
};
const Icon = ({ n, s = 16 }: { n: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={n === "play" || n === "pause" || n === "prev" || n === "next" ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={PATHS[n]} />
  </svg>
);
const IconBtn = ({ n, label, onClick, className = "" }: { n: string; label: string; onClick: () => void; className?: string }) => (
  <button className={"icon " + className} onClick={onClick} aria-label={label} title={label}><Icon n={n} /></button>
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
    const longest = Math.max(0, ...per[i].map((p) => p.secs));
    const secs = Math.max((sc.show as { seconds?: number }).seconds || 0, sc.text ? longest + GAP : 0) + (Number(sc.hold) || 0);
    return Math.max(15, Math.round(secs * FPS));
  });
  const starts: number[] = [];
  frames.reduce((a, f) => (starts.push(a), a + f), 0);
  return { langs, per, frames, starts };
};

const TYPE_COLOR: Record<string, string> = { map: "#3f5f80", art: "#7a5c3c", line: "#8e2f25", title: "#5f4470", stamp: "#9b7430", lapse: "#35607a", units: "#4b5a3a", endcard: "#444" };
const MUSIC_COLOR: Record<string, string> = { main: "#3f5f80", battle: "#8e2f25", tension: "#7a5a2a", lament: "#54487a", triumph: "#a57a2c" };
const LANG_NAME: Record<string, string> = { en: "영어", ko: "한국어", es: "스페인어", ja: "일본어", pt: "포르투갈어", fr: "프랑스어", de: "독일어", hi: "힌디어", zh: "중국어", id: "인도네시아어", ar: "아랍어" };
const tc = (f: number) => {
  const s = f / FPS;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${Math.floor((s % 1) * 10)}`;
};
const fillState = (secs: number, sceneSecs: number) => {
  const silence = sceneSecs - secs - GAP;
  if (secs === 0) return { tone: "none", silence: 0 };
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
  const [tab, setTab] = useState<"scene" | "sound">("scene");
  const [lang, setLang] = useState("en");
  const [frame, setFrame] = useState(0);
  const [zoom, setZoom] = useState(28);
  const [dirty, setDirty] = useState(false);
  const [issues, setIssues] = useState<{ byScene: Record<string, Issue[]>; general: Issue[]; summary?: string }>({ byScene: {}, general: [] });
  const [sounds, setSounds] = useState<Sounds>({ sfx: [], bgm: [] });
  const [toast, setToast] = useState("");
  const [gallery, setGallery] = useState(false);
  const [playing, setPlaying] = useState(false);
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
    api<Data>(`/api/ep?e=${epId}`).then((x) => { setD(x); setSel(0); setCue(null); setDirty(false); setLang("en"); runCheck(epId); });
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
        return { ...(sc as Scene), frames: timing.frames[i], vo: t?.vo && okFor("en") ? t.vo : null, vo_i18n };
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

  const edit = (fn: (ep: Ep) => void, keepTiming = true) => {
    if (!d) return;
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
    setSel(i); setCue({ scene: i, k }); setTab("scene");
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

  const save = useCallback(async () => {
    if (!d) return;
    await api(`/api/ep?e=${epId}`, { method: "POST", body: JSON.stringify(d.ep) });
    setDirty(false); say("저장됨"); runCheck(epId);
  }, [d, epId, runCheck]);
  const seekScene = (i: number) => { setSel(i); setCue(null); if (timing) player.current?.seekTo(timing.starts[i] + 1); };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === "s") { ev.preventDefault(); if (dirty) save(); return; }
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
        <h1>RWM</h1>
        <select aria-label="편" value={epId} onChange={(e) => { if (!dirty || window.confirm("저장하지 않은 수정을 버릴까요?")) setEpId(e.target.value); }}>
          {Object.entries(groups).map(([pl, list]) => <optgroup key={pl} label={pl}>{list.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</optgroup>)}
        </select>
        <button className="primary" disabled={!dirty} onClick={save}>저장</button>
        <button onClick={() => runCheck(epId)}>검사</button>
        {m && <span className="counts"><b className={+m[1] ? "err" : "ok"}>{m[1]}</b> 오류 · <b className="warn">{m[2]}</b> 경고</span>}
        <span className="grow" />
        <button onClick={() => setGallery(true)}>캐릭터</button>
        <button onClick={async () => { const r = await api<{ log: string }>("/api/chars", { method: "POST" }); say(r.log.trim().split("\n").length + "명 다시 그림"); }}>캐릭터 다시 그리기</button>
        <button onClick={async () => { try { const r = await api<{ files: string[] }>(`/api/srt?e=${epId}`); r.files.forEach((f) => window.open(f)); } catch (e) { say((e as Error).message); } }}>자막</button>
      </header>

      <aside className="left">
        <TimingSummary d={d} timing={timing} onPick={seekScene} />
        <IssueList issues={issues} onPick={seekScene} />
      </aside>

      <section className="stage">
        <div className="playerWrap">
          <Player ref={player} component={Episode as never} inputProps={inputProps} durationInFrames={total} fps={FPS}
            compositionWidth={1920} compositionHeight={1080} style={{ width: "100%", aspectRatio: "16/9", background: "#000" }}
            acknowledgeRemotionLicense numberOfSharedAudioTags={12} />
        </div>
        <div className="transport">
          <IconBtn n="prev" label="이전 장면" onClick={() => seekScene(Math.max(0, sel - 1))} />
          <button className="icon play" aria-label={playing ? "멈춤" : "재생"} onClick={() => player.current?.toggle()}><Icon n={playing ? "pause" : "play"} s={18} /></button>
          <IconBtn n="next" label="다음 장면" onClick={() => seekScene(Math.min(d.ep.scenes.length - 1, sel + 1))} />
          <span className="time">{tc(frame)} <span className="dim">/ {tc(total)}</span></span>
          <span className="grow" />
          <select aria-label="재생 언어" value={lang} onChange={(e) => setLang(e.target.value)}>
            {timing.langs.map((l) => <option key={l} value={l}>{LANG_NAME[l] || l}</option>)}
          </select>
          <input aria-label="확대" type="range" min={8} max={120} value={zoom} onChange={(e) => setZoom(+e.target.value)} />
        </div>
      </section>

      <aside className="right">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "scene"} className={tab === "scene" ? "on" : ""} onClick={() => setTab("scene")}>장면</button>
          <button role="tab" aria-selected={tab === "sound"} className={tab === "sound" ? "on" : ""} onClick={() => setTab("sound")}>소리</button>
        </div>
        {tab === "scene" ? (
          <Inspector d={d} sel={sel} cue={cue} timing={timing} issues={issues.byScene[sel] || []} sounds={sounds}
            update={update} reorder={reorder} edit={edit} removeCue={removeCue} />
        ) : (
          <SoundPanel sounds={sounds} upload={upload}
            onAdd={(s, kind) => (kind === "bgm" ? setMusicAt(s.name, frame / FPS) : addCue(s.src, frame / FPS))} />
        )}
      </aside>

      <Tracks d={d} timeline={timeline} timing={timing} sel={sel} cue={cue} frame={frame} zoom={zoom} lang={lang} issues={issues.byScene}
        onSeek={(f) => player.current?.seekTo(f)} onPick={seekScene}
        onPickCue={(c) => { setSel(c.scene); setCue(c); setTab("scene"); }}
        onMoveCue={moveCue} onDropSound={(src, kind, sec) => (kind === "bgm" ? setMusicAt(src.replace(/^bgm\/|\.wav$/g, ""), sec) : addCue(src, sec))}
        onDropFiles={async (files, row, sec) => { const kind = row === "bgm" ? "bgm" : "sfx"; const added = await upload(files, kind); added.forEach((src) => (kind === "bgm" ? setMusicAt(src.replace(/^bgm\/|\.wav$/g, ""), sec) : addCue(src, sec))); }}
        onHold={(i, hold) => edit((ep) => { const v = Math.round(hold * 10) / 10; if (v > 0) ep.scenes[i].hold = v; else delete ep.scenes[i].hold; })} />

      {toast && <div className="toast" role="status">{toast}</div>}
      {gallery && <Gallery onClose={() => setGallery(false)} />}
    </div>
  );
}

// ---------- 아래 트랙 ----------
const DRAG_TYPE = "application/x-rwm-sound";
function Tracks(props: {
  d: Data; timeline: Timeline; timing: Timing; sel: number; cue: CueSel; frame: number; zoom: number; lang: string; issues: Record<string, Issue[]>;
  onSeek: (f: number) => void; onPick: (i: number) => void; onPickCue: (c: NonNullable<CueSel>) => void; onMoveCue: (c: NonNullable<CueSel>, sec: number) => void;
  onDropSound: (src: string, kind: string, sec: number) => void; onDropFiles: (files: File[], row: string, sec: number) => void; onHold: (i: number, hold: number) => void;
}) {
  const { d, timeline, timing, sel, cue, frame, zoom, lang, issues } = props;
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
              onMouseDown={(e) => { if (!(e.target as HTMLElement).classList.contains("handle")) props.onPick(i); }}>
              <span className="lbl">{i}{bad && <i className="flag" />} <small>{s.speaker || show.title || show.text || show.name || (s.text || "").slice(0, 40)}</small></span>
              {s.hold ? <span className="hold" style={{ width: px((s.hold as number) * FPS) }} /> : null}
              <span className="handle" onMouseDown={(e) => { e.stopPropagation(); drag.current = { kind: "hold", i, x: e.clientX, hold: Number(s.hold) || 0 }; }} />
            </div>
          );
        }), "tall")}
      {row("char", name("user", "인물"),
        d.ep.scenes.map((s, i) => {
          const id = (s.char as string | undefined) || ((s.show as { type: string }).type === "line" ? charForSpeaker(s.speaker) : undefined);
          return id ? <div key={i} className="clip char" style={{ left: px(timing.starts[i]), width: px(timing.frames[i]) }} onMouseDown={() => props.onPick(i)}>{d.chars[id] || id}</div> : null;
        }))}
      {row("sfx", name("wave", "효과음"), <>
        {sfx.map((x, i) => x && <div key={"d" + i} className="clip sfx auto" style={{ left: px(timing.starts[i]) }} onMouseDown={() => props.onPick(i)}>{x[0]}</div>)}
        {d.ep.scenes.flatMap((s, i) => (s.cues || []).map((c, k) => {
          const on = cue?.scene === i && cue.k === k;
          const sec = on && cueGhost !== null ? cueGhost : timing.starts[i] / FPS + c.at;
          return (
            <div key={`c${i}-${k}`} className={"clip sfx cue" + (on ? " sel" : "")} style={{ left: sec * zoom }}
              onMouseDown={(e) => { e.stopPropagation(); props.onPickCue({ scene: i, k }); drag.current = { kind: "cue", c: { scene: i, k }, x: e.clientX, sec: timing.starts[i] / FPS + c.at }; }}>
              {c.src.split("/").pop()!.replace(/\.wav$/, "")}
            </div>
          );
        }))}
      </>)}
      {row("bgm", name("music", "브금"),
        musicSegs.map((m) => <div key={m.from} className="clip music" style={{ left: px(m.from), width: px(m.to - m.from), background: MUSIC_COLOR[m.track] || "#4a4a5a" }} onMouseDown={() => props.onPick(m.i)}>{m.track}</div>))}
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
    </div>
  );
}

// ---------- 오른쪽 소리 탭 ----------
function SoundPanel({ sounds, upload, onAdd }: { sounds: Sounds; upload: (f: File[], kind: "sfx" | "bgm") => Promise<string[]>; onAdd: (s: Sound, kind: "sfx" | "bgm") => void }) {
  const { playing, toggle } = usePreview();
  const [q, setQ] = useState("");
  const [over, setOver] = useState<"sfx" | "bgm" | null>(null);
  const filt = (l: Sound[]) => l.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));
  const list = (items: Sound[], kind: "sfx" | "bgm") =>
    items.map((s) => (
      <li key={s.src} draggable onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ src: s.src, kind })); e.dataTransfer.effectAllowed = "copy"; }}>
        <button className={"icon" + (playing === s.src ? " on" : "")} aria-label={playing === s.src ? "멈춤" : "듣기"} onClick={() => toggle(s.src)}><Icon n={playing === s.src ? "pause" : "play"} s={14} /></button>
        <span className="sname">{s.name}</span>
        <span className="dim">{s.secs ? s.secs.toFixed(1) + "s" : ""}</span>
        <button className="icon" aria-label="재생 위치에 넣기" title="재생 위치에 넣기" onClick={() => onAdd(s, kind)}><Icon n="plus" s={14} /></button>
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
          <label className="icon upload" title="파일 추가">
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
function TimingSummary({ d, timing, onPick }: { d: Data; timing: Timing; onPick: (i: number) => void }) {
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
      <h3>언어 타이밍</h3>
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

// ---------- 오른쪽 장면 탭 ----------
function Inspector({ d, sel, cue, timing, issues, sounds, update, reorder, edit, removeCue }: {
  d: Data; sel: number; cue: CueSel; timing: Timing; issues: Issue[]; sounds: Sounds;
  update: (fn: (sc: EpScene) => void) => void; reorder: (fn: (s: EpScene[]) => number) => void; edit: (fn: (ep: Ep) => void) => void; removeCue: (c: NonNullable<CueSel>) => void;
}) {
  const sc = d.ep.scenes[sel];
  const [showText, setShowText] = useState(JSON.stringify(sc.show, null, 1));
  const [showErr, setShowErr] = useState("");
  const { playing, toggle } = usePreview();
  useEffect(() => { setShowText(JSON.stringify(sc.show, null, 1)); setShowErr(""); }, [sel, d.ep]);
  const langs = timing.langs.filter((l) => l !== "en");
  const sceneSecs = timing.frames[sel] / FPS;
  const iss = (re: RegExp) => issues.filter((x) => re.test(x.msg)).map((x, k) => <p key={k} className={"iss " + x.kind}>{x.msg}</p>);
  const set = (k: string, v: unknown) => update((s) => { if (v === "" || v === undefined) delete s[k]; else s[k] = v; });
  const sfxVal = sc.sfx === null ? "__off" : (sc.sfx as string) || "";
  const charId = (sc.char as string) || ((sc.show as { type: string }).type === "line" ? charForSpeaker(sc.speaker) : "");
  const c = cue && cue.scene === sel ? sc.cues?.[cue.k] : undefined;

  return (
    <div className="inspector">
      {c && cue && (
        <div className="box accent">
          <div className="boxhead">
            <h3>효과음</h3>
            <button className={"icon" + (playing === c.src ? " on" : "")} aria-label="듣기" onClick={() => toggle(c.src)}><Icon n={playing === c.src ? "pause" : "play"} s={14} /></button>
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
      )}

      <div className="box">
        <div className="boxhead">
          <h3>장면 {sel}</h3><span className="dim num">{sceneSecs.toFixed(1)}s</span><span className="grow" />
          <IconBtn n="up" label="위로" onClick={() => reorder((s) => { if (sel > 0) [s[sel - 1], s[sel]] = [s[sel], s[sel - 1]]; return Math.max(0, sel - 1); })} />
          <IconBtn n="down" label="아래로" onClick={() => reorder((s) => { if (sel < s.length - 1) [s[sel + 1], s[sel]] = [s[sel], s[sel + 1]]; return Math.min(s.length - 1, sel + 1); })} />
          <IconBtn n="copy" label="복제" onClick={() => reorder((s) => (s.splice(sel + 1, 0, structuredClone(s[sel])), sel + 1))} />
          <IconBtn n="plus" label="새 장면" onClick={() => reorder((s) => (s.splice(sel + 1, 0, { role: "narrator", text: "", show: { type: "stamp", text: "" }, i18n: {} } as unknown as EpScene), sel + 1))} />
          <IconBtn n="trash" label="장면 삭제" onClick={() => window.confirm(`장면 ${sel}을 지울까요?`) && reorder((s) => (s.splice(sel, 1), Math.min(sel, s.length - 1)))} />
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
        <input type="number" step={0.1} min={0} value={(sc.hold as number) ?? 0} onChange={(e) => set("hold", +e.target.value > 0 ? +e.target.value : undefined)} />
      </div>

      <div className="box">
        <h3>대사</h3>
        <div className="two">
          <div><label>목소리</label>
            <select value={(sc.role as string) || ""} onChange={(e) => set("role", e.target.value)}>
              <option value="">-</option>{Object.entries(d.roles).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div><label>말하는 사람</label><input value={(sc.speaker as string) || ""} onChange={(e) => set("speaker", e.target.value)} /></div>
        </div>
        <label>영어</label>
        <textarea value={(sc.text as string) || ""} onChange={(e) => set("text", e.target.value)} />
        {iss(/^en |화면/)}
        {langs.map((l) => (
          <div key={l}>
            <label>{LANG_NAME[l] || l}</label>
            <textarea value={sc.i18n?.[l] || ""} onChange={(e) => update((s) => { (s.i18n ??= {})[l] = e.target.value; })} />
            {iss(new RegExp(`^${l} `))}
          </div>
        ))}
      </div>

      <div className="box">
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
        <label>인물</label>
        <div className="row">
          <div className="thumb">{charId && ["body", "head", "eyes0", "mouth0"].map((l) => <img key={l} src={`/chars/${charId}/${l}.svg`} alt="" />)}</div>
          <select value={(sc.char as string) || ""} onChange={(e) => set("char", e.target.value)} style={{ flex: 1 }}>
            <option value="">자동</option>{Object.entries(d.chars).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <label>show</label>
        <textarea className="mono" rows={7} value={showText} onChange={(e) => {
          setShowText(e.target.value);
          try { const v = JSON.parse(e.target.value); setShowErr(""); update((s) => { s.show = v; }); } catch (err) { setShowErr((err as Error).message); }
        }} />
        {showErr && <p className="iss 오류">{showErr}</p>}
      </div>
    </div>
  );
}

function Gallery({ onClose }: { onClose: () => void }) {
  const [chars, setChars] = useState<Record<string, { speakers?: string[]; names?: string[] }>>({});
  const [talk, setTalk] = useState<Record<string, boolean>>({});
  const [t, setT] = useState(0);
  useEffect(() => { api<typeof chars>("/api/chars").then(setChars); const h = setInterval(() => setT((x) => x + 1), 1000 / 30); return () => clearInterval(h); }, []);
  return (
    <div className="gal" role="dialog" aria-label="캐릭터">
      <div className="row"><h2>캐릭터</h2><span className="grow" /><IconBtn n="x" label="닫기" onClick={onClose} /></div>
      <div className="cards">
        {Object.entries(chars).map(([id, c], k) => {
          const blink = (t + k * 17) % 110 < 4;
          const s = Math.sin(t * 0.9 + k) * Math.sin(t * 0.37 + k);
          const m = talk[id] ? (s > 0.35 ? 2 : s > -0.2 ? 1 : 0) : 0;
          return (
            <button key={id} className="card" onClick={() => setTalk({ ...talk, [id]: !talk[id] })}>
              <div className="fig">
                <div className="body"><img src={`/chars/${id}/body.svg`} alt="" /></div>
                <div className="hd"><img src={`/chars/${id}/head.svg`} alt="" /><img src={`/chars/${id}/eyes${blink ? 1 : 0}.svg`} alt="" /><img src={`/chars/${id}/mouth${m}.svg`} alt="" /></div>
              </div>
              <b>{c.speakers?.[0] || c.names?.[0] || id}</b>
            </button>
          );
        })}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
