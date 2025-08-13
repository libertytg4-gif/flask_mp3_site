// script.js — конвертация в MP3 в браузере на ffmpeg.wasm (Vercel-friendly)
import { FFmpeg } from 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.6/dist/ffmpeg.js';
import { fetchFile, toBlobURL } from 'https://unpkg.com/@ffmpeg/util@0.12.6/dist/index.js';

// UI elements
const $ = (s)=>document.querySelector(s);
const dropzone = $("#dropzone");
const fileInput = $("#file-input");
const pickedName = $("#picked-name");
const outputName = $("#output-name");
const quality = $("#quality");
const convertBtn = $("#convert-btn");
const statusBox = $("#status");
const progressBar = $("#progress-bar");

let pickedFile = null;
let ffmpeg;
let ffmpegLoaded = false;

function status(text){ if(statusBox){ statusBox.textContent = text; } }
function setProgress(x){ if(progressBar){ progressBar.style.width = Math.max(0, Math.min(100, x)) + "%"; } }
function safeBaseName(name){
  try{ return (name.replace(/\.[^.]+$/,'') || 'audio').replace(/[^A-Za-z0-9_\-.]+/g,'_').slice(0,80); }catch(e){ return 'audio'; }
}
function bitrateFromQuality(q){
  switch(q){
    case 'low': return '96k';
    case 'high': return '320k';
    default: return '192k';
  }
}

// DnD / picker wiring
if (dropzone){
  dropzone.addEventListener("click", ()=>fileInput?.click());
  dropzone.addEventListener("keydown", (e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); fileInput?.click(); } });
  dropzone.addEventListener("dragover", (e)=>{ e.preventDefault(); dropzone.classList.add("hover"); });
  dropzone.addEventListener("dragleave", ()=>dropzone.classList.remove("hover"));
  dropzone.addEventListener("drop", (e)=>{
    e.preventDefault();
    dropzone.classList.remove("hover");
    const f = e.dataTransfer?.files?.[0];
    if(f) handleFile(f);
  });
}
if (fileInput){
  fileInput.addEventListener("change", (e)=>{
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  });
}

function handleFile(file){
  pickedFile = file;
  if (pickedName) pickedName.value = file.name;
  if (outputName) outputName.value = safeBaseName(file.name) + ".mp3";
  status("Файл выбран: " + file.name);
  if (convertBtn) convertBtn.disabled = false;
}

// Load ffmpeg core on demand
async function ensureFFmpeg(){
  if (ffmpegLoaded) return;
  status("Загружаю FFmpeg ядро (~31 МБ)...");
  setProgress(5);
  ffmpeg = new FFmpeg();
  ffmpeg.on("progress", ({progress})=> setProgress(Math.round(progress*100)));
  const coreBase = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${coreBase}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${coreBase}/ffmpeg-core.wasm`, "application/wasm"),
  });
  ffmpegLoaded = true;
  status("FFmpeg готов");
  setProgress(10);
}

async function convert(){
  try{
    if (!pickedFile){ status("Сначала выберите файл"); return; }
    if (convertBtn) convertBtn.disabled = true;

    await ensureFFmpeg();

    status("Подготавливаю файл...");
    setProgress(15);
    await ffmpeg.writeFile("input", await fetchFile(pickedFile));

    const br = bitrateFromQuality(quality?.value || "medium");
    status(`Конвертирую в MP3 (${br})...`);
    await ffmpeg.exec(["-i", "input", "-vn", "-b:a", br, "out.mp3"]);

    status("Готовлю скачивание...");
    setProgress(95);
    const data = await ffmpeg.readFile("out.mp3");
    const blob = new Blob([data.buffer], { type: "audio/mpeg" });
    const suggested = (outputName?.value || safeBaseName(pickedFile.name) + ".mp3").replace(/[/\\]/g, "");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = suggested.endsWith(".mp3") ? suggested : (suggested + ".mp3");
    document.body.appendChild(a); a.click(); a.remove();

    status("Готово ✅");
    setProgress(100);
    setTimeout(()=>setProgress(0), 800);
  }catch(err){
    console.error(err);
    status("Ошибка: " + (err?.message || err));
    setProgress(0);
  }finally{
    if (convertBtn) convertBtn.disabled = false;
  }
}

if (convertBtn){
  convertBtn.addEventListener("click", (e)=>{ e.preventDefault(); convert(); });
}
