import { Composition, Still } from "remotion";
import { Banner } from "./channel/Banner";
import { Profile, Watermark } from "./channel/Profile";
import { Architecture, UserFlow } from "./channel/AuditDiagrams";
import { Episode, timelineFrames, type Timeline } from "./episode/Episode";
import { Thumb } from "./episode/Thumb";
import mongol01pilot from "../public/ep/mongol-01/pilot/timeline.json";
import mongol01 from "../public/ep/mongol-01/ep/timeline.json";
import mongol02 from "../public/ep/mongol-02/ep/timeline.json";
import tl from "../timeline.json";
import social from "../social.json";
import { Reel } from "./Reel";
import { Scrub, SCRUB_FRAMES } from "./social/Scrub";
import { Borders, bordersTimeline } from "./social/Borders";
import { Quiz, QUIZ_FRAMES } from "./social/Quiz";
import shorts from "../shorts.json";
import { Timelapse, VIDEOS, framesOf } from "./shorts/Timelapse";
import { QuizV, QV_FRAMES } from "./shorts/QuizV";
import { SameYear, SAMEYEAR_FRAMES } from "./shorts/SameYear";

const base = { component: Reel, durationInFrames: tl.durationInFrames, fps: tl.fps, width: tl.width, height: tl.height };
const fps = social.fps;

export const Root = () => (
  <>
    <Composition id="ReelEN" {...base} defaultProps={{ locale: "en" as const }} />
    <Composition id="ReelKO" {...base} defaultProps={{ locale: "ko" as const }} />
    <Composition id="ReelJA" {...base} defaultProps={{ locale: "ja" as const }} />
    <Composition id="ReelZH" {...base} defaultProps={{ locale: "zh" as const }} />
    {/* 레딧·쓰레드용 (src/social, social.json) */}
    <Composition id="SocialScrub" component={Scrub} durationInFrames={SCRUB_FRAMES} fps={fps} width={social.scrub.width} height={social.scrub.height} />
    <Composition id="SocialBorders" component={Borders} durationInFrames={bordersTimeline("borders").frames} fps={fps} width={social.borders.width} height={social.borders.height} defaultProps={{ id: "borders" as const }} />
    <Composition id="SocialBordersAsia" component={Borders} durationInFrames={bordersTimeline("bordersAsia").frames} fps={fps} width={social.bordersAsia.width} height={social.bordersAsia.height} defaultProps={{ id: "bordersAsia" as const }} />
    <Composition id="SocialQuiz" component={Quiz} durationInFrames={QUIZ_FRAMES} fps={fps} width={social.quiz.width} height={social.quiz.height} />
    {/* 유튜브 쇼츠·틱톡용 세로 (src/shorts, shorts.json) */}
    {VIDEOS.map((v) => (
      <Composition key={v.id} id={`Shorts-${v.id}`} component={Timelapse} durationInFrames={framesOf(v.id)} fps={shorts.fps} width={shorts.width} height={shorts.height} defaultProps={{ id: v.id }} />
    ))}
    <Composition id="Shorts-quiz" component={QuizV} durationInFrames={QV_FRAMES} fps={shorts.fps} width={shorts.width} height={shorts.height} />
    <Composition id="Shorts-sameyear" component={SameYear} durationInFrames={SAMEYEAR_FRAMES} fps={shorts.fps} width={shorts.width} height={shorts.height} />
      {(["cine", "ink", "art"] as const).map((look) => (
      <Still key={look} id={`ChannelBanner-${look}`} component={Banner} width={2560} height={1440} defaultProps={{ look }} />
    ))}
    {(["helmet", "hourglass", "seal"] as const).map((look) => (
      <Still key={look} id={`ChannelProfile-${look}`} component={Profile} width={800} height={800} defaultProps={{ look }} />
    ))}
    {(["helmet", "hourglass", "seal"] as const).map((look) => (
      <Still key={look} id={`ChannelWatermark-${look}`} component={Watermark} width={300} height={300} defaultProps={{ look }} />
    ))}
    <Still id="AuditArchitecture" component={Architecture} width={1600} height={900} />
    <Still id="AuditUserFlow" component={UserFlow} width={1600} height={900} />
    <Composition id="Mongol01Pilot" component={Episode} durationInFrames={timelineFrames(mongol01pilot as Timeline)} fps={30} width={1920} height={1080} defaultProps={{ timeline: mongol01pilot as Timeline }} />
    <Composition id="Mongol01" component={Episode} durationInFrames={timelineFrames(mongol01 as Timeline)} fps={30} width={1920} height={1080} defaultProps={{ timeline: mongol01 as Timeline }} />
    {/* 언어별 썸네일은 이 하나로 --props를 바꿔 찍는다 (scripts/thumbs.mjs) */}
    <Still id="Thumb" component={Thumb} width={1280} height={720} defaultProps={{ map: "clean/mg-wide/1260.png", face: "art/mongol/genghis-portrait.jpg", faceFocus: "50% 25%", top: "From hunted orphan", big: "To world conqueror", look: "red" as const }} />
    <Still id="Mongol01-ThumbA" component={Thumb} width={1280} height={720} defaultProps={{ map: "clean/mg-wide/1260.png", face: "art/mongol/genghis-portrait.jpg", faceFocus: "50% 25%", top: "From hunted orphan", big: "To world conqueror", look: "red" as const }} />
    <Still id="Mongol01-ThumbB" component={Thumb} width={1280} height={720} defaultProps={{ map: "clean/mg-wide/1260.png", face: "art/mongol/genghis-portrait.jpg", faceFocus: "50% 25%", top: "1 million vs 100 million", big: "How did he win?", look: "red" as const }} />
    <Still id="Mongol01-ThumbC" component={Thumb} width={1280} height={720} defaultProps={{ map: "clean/mg-wide/1260.png", face: "art/mongol/genghis-portrait.jpg", faceFocus: "50% 25%", top: "Left to die at 9", big: "Genghis Khan", look: "red" as const }} />
    <Composition id="Mongol02" component={Episode} durationInFrames={timelineFrames(mongol02 as Timeline)} fps={30} width={1920} height={1080} defaultProps={{ timeline: mongol02 as Timeline }} />
    <Still id="Mongol02-ThumbA" component={Thumb} width={1280} height={720} defaultProps={{ map: "clean/mg-west/1220.png", face: "art/mongol/kalka-battle.jpg", faceFocus: "50% 30%", top: "Europe meets the Mongols", big: "They were the table", look: "red" as const }} />
    <Still id="Mongol02-ThumbB" component={Thumb} width={1280} height={720} defaultProps={{ map: "clean/mg-west/1220.png", face: "art/mongol/subutai.jpg", faceFocus: "50% 25%", top: "20,000 riders vs all of Rus", big: "Who won?", look: "red" as const }} />
    <Still id="Mongol02-ThumbC" component={Thumb} width={1280} height={720} defaultProps={{ map: "clean/mg-west/1220.png", face: "art/mongol/kalka-1224.jpg", faceFocus: "50% 40%", top: "1223 · Kalka River", big: "Europe's first nightmare", look: "red" as const }} />
    </>
);
