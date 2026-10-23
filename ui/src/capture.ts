import { call } from "../../../design-bench/ui/src/native";
import { renderTemplate } from "../../../design-bench/ui/src/TemplateRenderer";
import type { Artifact } from "../../../design-bench/ui/src/artifacts/model";
import { type Capture, stagePng } from "./studioApi";
export type RawContent = {
  html?: string;
  contentHash?: string;
  images: { id: string; dataUrl: string; mime: string }[];
  imageIds?: string[];
};
export type LoadedFrame = {
  rawHash: string;
  html: string;
  channel: string;
  srcDoc: string;
};
let captureEngine: Promise<string> | undefined;
const safeScript = (value: string) =>
  value.replace(/<\/script/gi, "<\\/script");
const captureRuntime = String.raw`(()=>{
 const channel=__CHANNEL__;
 addEventListener('message',async e=>{
  if(e.source!==parent||e.data?.channel!==channel||e.data?.type!=='studio-capture')return;
  const requestId=e.data.requestId;
  try{
   await document.fonts.ready;
   await Promise.all([...document.images].map(async image=>{if(!image.complete)await new Promise((resolve,reject)=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',()=>reject(Error('An image could not load.')),{once:true})});if(!image.naturalWidth)throw Error('An image could not load.');if(image.decode)await image.decode()}));
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const width=innerWidth,height=Math.max(innerHeight,document.documentElement.scrollHeight,document.body?.scrollHeight||0);
   if(width*height>20000000)throw Error('Capture is too large; use a smaller viewport.');
   // Browsers propagate a transparent root's body background across the
   // viewport, including the area below a short body. Preserve that canvas.
   const rootBackground=getComputedStyle(document.documentElement).backgroundColor;
   const backgroundColor=(!rootBackground||rootBackground==='transparent'||rootBackground==='rgba(0, 0, 0, 0)')&&document.body?getComputedStyle(document.body).backgroundColor:rootBackground;
   const reflectControlState=clone=>{
    for(const tag of ['input','textarea','select']){
     const originals=[...document.querySelectorAll(tag)],copies=[...clone.querySelectorAll(tag)];
     if(originals.length!==copies.length)throw Error('The capture could not match every live form control.');
     originals.forEach((original,index)=>{
      const copy=copies[index];
      if(tag==='input'){
       if(original.indeterminate&&getComputedStyle(original).appearance!=='none')throw Error('An indeterminate native checkbox cannot be captured faithfully. Use its explicit checked or unchecked state.');
       copy.setAttribute('value',original.value);
       if(original.type==='checkbox'||original.type==='radio')copy.toggleAttribute('checked',original.checked);
      }else if(tag==='textarea')copy.textContent=original.value;
      else{
       if(original.options.length!==copy.options.length)throw Error('The capture could not match every live select option.');
       [...original.options].forEach((option,index)=>copy.options[index].toggleAttribute('selected',option.selected));
      }
     });
    }
   };
   const context=await modernScreenshot.createContext(document.documentElement,{width,height,scale:1,backgroundColor,onCloneNode:reflectControlState,fetch:{placeholderImage:undefined}});
   // The vendor normally probes default styles through a nested same-origin
   // iframe. Opaque sandbox origins prohibit that probe. An empty baseline
   // copies every actual computed style instead; it does not invent pixels.
   class FullComputedStyles extends Map {has(){return true}get(){return new Map()}}
   context.defaultComputedStyles=new FullComputedStyles();
   const warnings=[];context.log.warn=(...parts)=>warnings.push(parts.map(String).join(' '));
   let image;
   try{image=await modernScreenshot.domToPng(context);if(warnings.length)throw Error('Capture could not preserve all assets/styles: '+warnings[0].slice(0,500))}
   finally{modernScreenshot.destroyContext(context)}
   parent.postMessage({type:'studio-captured',channel,requestId,image,width,height},'*');
  }catch(error){parent.postMessage({type:'studio-captured',channel,requestId,error:String(error?.message||error)},'*')}
 });
 parent.postMessage({type:'studio-frame-ready',channel},'*');
})()`;
export async function prepareFrame(node: Artifact): Promise<LoadedFrame> {
  const raw = await call<RawContent>("benchContent", { artifactId: node.id });
  if (typeof raw.html !== "string" || !raw.contentHash) {
    throw Error("This revision has no current HTML content hash.");
  }
  const html = await renderTemplate(
    raw.html,
    node.legacyScreen || "",
    node.legacyVersion || "",
  );
  captureEngine ??= fetch(
    new URL("vendor/modern-screenshot.js", document.baseURI),
  ).then((r) => {
    if (!r.ok) throw Error("Capture library could not load.");
    return r.text();
  });
  const engine = await captureEngine, channel = crypto.randomUUID();
  // The frame has an opaque origin and never receives wm. Messages require both
  // the exact frame source and its random channel. Source HTML stays in srcdoc.
  const runtime = captureRuntime.replace(
    "__CHANNEL__",
    JSON.stringify(channel),
  );
  const scripts = `<script>${safeScript(engine)}</script><script>${
    safeScript(runtime)
  }</script>`;
  return { rawHash: raw.contentHash, html, channel, srcDoc: html + scripts };
}
export function captureFrame(
  frame: HTMLIFrameElement,
  loaded: LoadedFrame,
): Promise<{ image: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const finish = (
      error?: string,
      result?: { image: string; width: number; height: number },
    ) => {
      clearTimeout(timer);
      window.removeEventListener("message", receive);
      error ? reject(Error(error)) : resolve(result!);
    };
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.contentWindow ||
        event.data?.channel !== loaded.channel ||
        event.data?.type !== "studio-captured" ||
        event.data?.requestId !== requestId
      ) return;
      const m = event.data;
      if (m.error) return finish(String(m.error));
      if (
        typeof m.image !== "string" ||
        !m.image.startsWith("data:image/png;base64,") ||
        !Number.isInteger(m.width) || !Number.isInteger(m.height) ||
        m.width < 1 || m.height < 1
      ) return finish("The renderer returned an invalid capture.");
      finish(undefined, { image: m.image, width: m.width, height: m.height });
    };
    const timer = setTimeout(
      () =>
        finish("HTML capture timed out. Check fonts and images, then retry."),
      45000,
    );
    window.addEventListener("message", receive);
    frame.contentWindow?.postMessage({
      type: "studio-capture",
      channel: loaded.channel,
      requestId,
    }, "*");
  });
}
export async function saveCapture(
  node: Artifact,
  loaded: LoadedFrame,
  png: { image: string; width: number; height: number },
  theme: "light" | "dark",
) {
  const fresh = await call<RawContent>("benchContent", { artifactId: node.id });
  if (fresh.contentHash !== loaded.rawHash) {
    throw Error(
      "HTML changed during capture. Refresh and capture the new revision.",
    );
  }
  const imageId = await stagePng(png.image, "Implementation capture.png");
  const capture = await call<Capture>("studioCapture", {
    artifactId: node.id,
    contentHash: loaded.rawHash,
    imageId,
    width: png.width,
    height: png.height,
    theme,
  });
  if (!capture?.id || capture.contentHash !== loaded.rawHash) {
    throw Error("Capture storage was not acknowledged for the current HTML.");
  }
  return capture;
}
