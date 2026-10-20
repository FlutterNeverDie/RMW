// 렌더 중간물(public/ep) 없이도 돌아가는 진입점 - 편집기 장면 미리보기 + 캐릭터 시험
// npx remotion still src/preview.tsx Scene out/editor/x.png --props='{"scene":{...},"frames":90}' --frame=40
import { Composition, registerRoot } from "remotion";
import { Episode, type Scene, type Timeline } from "./episode/Episode";
import { PipelineExplainer, PIPELINE_FRAMES } from "./docs/Pipeline";

const SceneOnly = ({ scene, frames }: { scene: Scene; frames: number }) => (
  <Episode timeline={{ fps: 30, scenes: [{ ...scene, frames, vo: scene.vo ?? null }] } as Timeline} />
);

const lab = {
  fps: 30,
  scenes: [
    { role: "king", speaker: "GENGHIS KHAN", text: "Kneel.", vo: null, frames: 90, show: { type: "line" } },
    { role: "narrator", text: "", vo: null, frames: 90, char: "hoelun", sfx: null, show: { type: "art", img: "art/mongol/genghis-portrait.jpg", from: [0.5, 0.5, 1], to: [0.5, 0.45, 1.1] } },
  ],
} as unknown as Timeline;

const Root = () => (
  <>
    <Composition
      id="Scene"
      component={SceneOnly}
      fps={30}
      width={1920}
      height={1080}
      durationInFrames={90}
      defaultProps={{ scene: lab.scenes[0], frames: 90 }}
      calculateMetadata={({ props }) => ({ durationInFrames: Math.max(1, props.frames) })}
    />
    <Composition id="PipelineExplainer" component={PipelineExplainer} durationInFrames={PIPELINE_FRAMES} fps={30} width={1920} height={1080} />
    <Composition id="CharLab" component={Episode} durationInFrames={180} fps={30} width={1920} height={1080} defaultProps={{ timeline: lab }} />
  </>
);
registerRoot(Root);
