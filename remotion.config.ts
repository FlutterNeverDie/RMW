import { Config } from "@remotion/cli/config";

Config.setEntryPoint("src/index.ts");
Config.setVideoImageFormat("jpeg");
// 내려받은 headless shell이 이 맥에서 바로 꺼져서, 설치된 Chrome으로 렌더한다
Config.setBrowserExecutable("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
// 기본 그래픽 엔진은 큰 그림을 다 그리기 전에 프레임을 찍어 빈 화면이 섞였다(깜빡임). angle로 하면 없어짐 (2026-10-20 검사기로 확인)
Config.setChromiumOpenGlRenderer("angle");
