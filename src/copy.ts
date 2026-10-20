// 언어별 화면 문구와 장면 순서. 지도 화면은 scripts/shoot.mjs로 찍은 실제 사이트 캡처(public/shots/<언어>/)
// 영어판은 유럽 중심, 한·일·중은 동아시아 중심이고 전쟁·종교·발명도 그 나라에 익숙한 것으로 고른다.
// 사이트에 일본어 화면이 없어 일본판 캡처는 영어 화면(도쿄 시간대) - 글자만 일본어
export type Locale = "en" | "ko" | "ja" | "zh";

export type Shot = { file: string; year: string };

// 지도 종류 소개 장면: 캡처 파일 + 큰 제목 + 한 줄
export type MapShot = { file: string; title: string; sub: string };

type Copy = {
  // 화면 글꼴. 한·영은 Paperlogy(직접 넣은 웹폰트), 일·중은 맥 기본 글꼴(렌더하는 Chrome이 씀)
  font: string;
  hook: [string, string];
  // 첫 장면 캡처: 판도가 가장 넓던 순간 (영·일·중은 1942년 8월 전쟁 지도, 한국은 475년 삼국시대)
  peak: string;
  demo: [string, string];
  // 타임랩스 연도 아래 한 줄
  timelapse: string;
  shots: Shot[];
  maps: MapShot[];
  siteName: string;
  free: string;
  cta: string;
  url: string;
};

const URL_ = "historymapworld.com";
const PAPERLOGY = "Paperlogy";
const PEAK_ASIA = "wars_world-war-ii_battle_guadalcanal-campaign";
const BLACK_DEATH = "maps_epidemics_item_black-death";

// 타임랩스 12장 (모든 언어 같은 연도, 캡처 파일 이름 = 연도)
const YEARS = ["-3000", "-1000", "-300", "1", "500", "800", "1200", "1500", "1700", "1800", "1900", "2020"];
const shots = (label: (y: number) => string): Shot[] => YEARS.map((f) => ({ file: f, year: label(Number(f)) }));

export const COPY: Record<Locale, Copy> = {
  en: {
    font: PAPERLOGY,
    hook: ["August 1942", "The Axis at its peak"],
    peak: "wars_world-war-ii_battle_battle-of-stalingrad",
    demo: ["Tap any event", "Read the full story"],
    timelapse: "5,000 years in 4 seconds",
    shots: shots((y) => (y < 0 ? `${-y} BC` : y < 1000 ? `AD ${y}` : `${y}`)),
    maps: [
      { file: "wars_napoleonic-wars", title: "80 war maps", sub: "Napoleonic Wars, front by front" },
      { file: BLACK_DEATH, title: "Plague maps", sub: "How the Black Death spread" },
      { file: "maps_religions_item_islam", title: "Religion maps", sub: "How Islam spread" },
      { file: "maps_inventions_item_printing-press", title: "153 inventions", sub: "Gutenberg's press, 1440" },
    ],
    siteName: "History Map World",
    free: "602 events · 8 languages · Free",
    cta: "Drag the timeline yourself",
    url: URL_,
  },
  ko: {
    font: PAPERLOGY,
    // 한국판은 일본 제국 판도로 시작하지 않는다 - 삼국시대(장수왕 한성 함락 475년, 고구려가 가장 넓던 무렵)로
    hook: ["475년, 삼국시대", "고구려가 가장 넓었던 순간"],
    peak: "475",
    demo: ["사건을 톡 누르면", "자세한 이야기까지"],
    timelapse: "5,000년을 4초 만에",
    shots: shots((y) => (y < 0 ? `기원전 ${-y}년` : y === 1 ? "서기 1년" : `${y}년`)),
    maps: [
      { file: "wars_imjin-war", title: "전쟁 지도 80개", sub: "임진왜란, 전투 하나하나까지" },
      { file: BLACK_DEATH, title: "역병 지도", sub: "흑사병은 이렇게 퍼졌다" },
      { file: "maps_religions_item_mahayana", title: "종교 지도", sub: "불교가 동아시아로 건너온 길" },
      { file: "maps_inventions_item_jikji", title: "발명 153개", sub: "금속활자 직지, 1377년" },
    ],
    siteName: "세계사 지도",
    free: "사건 602개 · 8개 언어 · 무료",
    cta: "직접 슬라이더를 끌어 보세요",
    url: URL_,
  },
  ja: {
    font: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif',
    hook: ["1942年8月", "枢軸国の版図が最大に"],
    peak: PEAK_ASIA,
    demo: ["出来事をタップすると", "くわしい解説まで"],
    timelapse: "5000年を4秒で",
    shots: shots((y) => (y < 0 ? `紀元前${-y}年` : y === 1 ? "西暦1年" : `${y}年`)),
    maps: [
      { file: "wars_russo-japanese-war", title: "戦争地図 80", sub: "日露戦争を戦いごとに" },
      { file: BLACK_DEATH, title: "疫病の地図", sub: "黒死病はこう広がった" },
      { file: "maps_religions_item_shinto", title: "宗教の地図", sub: "神道とアジアの信仰" },
      { file: "maps_inventions_item_shinkansen", title: "発明 153", sub: "新幹線、1964年" },
    ],
    siteName: "History Map World",
    free: "602の出来事 · 無料",
    cta: "タイムラインを動かしてみよう",
    url: URL_,
  },
  zh: {
    font: '"PingFang SC", "Hiragino Sans GB", sans-serif',
    hook: ["1942年8月", "轴心国版图最大的时刻"],
    peak: PEAK_ASIA,
    demo: ["点一下历史事件", "就能读到完整故事"],
    timelapse: "4秒看完5000年",
    shots: shots((y) => (y < 0 ? `公元前${-y}年` : y === 1 ? "公元1年" : `${y}年`)),
    maps: [
      { file: "wars_three-kingdoms", title: "80张战争地图", sub: "三国鼎立，一场一场看" },
      { file: BLACK_DEATH, title: "瘟疫地图", sub: "黑死病是怎样蔓延的" },
      { file: "maps_religions_item_confucianism", title: "宗教地图", sub: "儒家思想从这里出发" },
      { file: "maps_inventions_item_paper", title: "153项发明", sub: "蔡伦造纸，公元105年" },
    ],
    siteName: "世界史地图",
    free: "602个历史事件 · 8种语言 · 免费",
    cta: "亲手拖动时间轴试试",
    url: URL_,
  },
};
