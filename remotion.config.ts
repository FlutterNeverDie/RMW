import { Config } from "@remotion/cli/config";
import { existsSync } from "node:fs";
import { join } from "node:path";

Config.setEntryPoint("src/index.ts");
Config.setVideoImageFormat("jpeg");
// 기본 80이면 지도 선·글자 주변이 뭉개진다 (2026-10-20)
Config.setJpegQuality(95);
// 내려받은 headless shell이 이 맥에서 바로 꺼져서, 설치된 Chrome으로 렌더한다
// 위치는 scripts/tools.mjs chrome()과 같은 규칙 (이 파일은 CJS로 묶여 import.meta를 못 써서 따로 적음): CHROME 환경 변수 → 맥 /Applications → 윈도우 Program Files·사용자 설치
const winChrome = () => {
  const c = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA].filter(Boolean).map((r) => join(r as string, "Google/Chrome/Application/chrome.exe"));
  return c.find((p) => existsSync(p)) ?? c[0];
};
Config.setBrowserExecutable(
  process.env.CHROME || (process.platform === "win32" ? winChrome() : process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : null),
);
// 기본 그래픽 엔진은 큰 그림을 다 그리기 전에 프레임을 찍어 빈 화면이 섞였다(깜빡임). angle로 하면 없어짐 (2026-10-20 검사기로 확인)
Config.setChromiumOpenGlRenderer("angle");
