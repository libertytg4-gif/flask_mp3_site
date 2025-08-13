// Helpers
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

// Open file dialog when clicking dropzone text
dropzone.addEventListener("click", ()=>fileInput.click());
dropzone.addEventListener("keydown", (e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); fileInput.click(); } });

fileInput.addEventListener("change", (e)=>{
  if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
});

function handleFile(file){
  pickedFile = file;
  pickedName.value = file.name;
  // Propose output name (without extension)
  const n = file.name.replace(/\.[^.]+$/,'') || 'audio';
  outputName.value = n;
  status("");
  setProgress(0);
}

// Drag & Drop
['dragenter','dragover'].forEach(evt=>{
  dropzone.addEventListener(evt, (e)=>{
    e.preventDefault(); e.stopPropagation();
    dropzone.classList.add("drag");
  });
});
['dragleave','drop'].forEach(evt=>{
  dropzone.addEventListener(evt, (e)=>{
    e.preventDefault(); e.stopPropagation();
    dropzone.classList.remove("drag");
  });
});
dropzone.addEventListener("drop", (e)=>{
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) handleFile(file);
});

function status(msg, kind){
  statusBox.textContent = msg || "";
  statusBox.className = "status" + (kind ? " " + kind : "");
}
function setProgress(p){ progressBar.style.width = Math.max(0, Math.min(100, p)) + "%"; }

function blobToText(blob){
  return new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onload = ()=>resolve(fr.result);
    fr.onerror = reject;
    fr.readAsText(blob);
  });
}

async function convert(){
  if(!pickedFile){
    status("Сначала выберите файл", "error");
    return;
  }
  status("Загружаю файл... 0%");
  setProgress(0);
  convertBtn.disabled = true;

  const fd = new FormData();
  fd.append("file", pickedFile);
  fd.append("output_name", outputName.value || "");
  fd.append("quality", quality.value);

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/convert");
  xhr.responseType = "blob";

  // Upload progress (first 60% of the bar)
  xhr.upload.onprogress = (e)=>{
    if(e.lengthComputable){
      const pct = Math.round((e.loaded/e.total)*100);
      status("Загружаю файл... " + pct + "%");
      setProgress(Math.round(pct * 0.6));
    }
  };
  xhr.upload.onload = ()=>{
    // Upload finished; server starts reading/parsing
    status("Читаю файл...");
    setProgress(65);
  };

  xhr.onreadystatechange = ()=>{
    // When headers received, we assume conversion started
    if(xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED){
      status("Преобразовываю файл...");
      setProgress(85);
    }
    // During loading response body
    if(xhr.readyState === XMLHttpRequest.LOADING){
      status("Отправляю...");
      setProgress(95);
    }
  };

  xhr.onerror = ()=>{
    status("Сетевая ошибка или сервер недоступен", "error");
    setProgress(0);
    convertBtn.disabled = false;
  };

  xhr.onload = async ()=>{
    try{
      const ct = xhr.getResponseHeader("Content-Type") || "";
      if(ct.includes("application/json")){
        const text = await blobToText(xhr.response);
        const data = JSON.parse(text || "{}");
        status(data.error || "Ошибка", "error");
        setProgress(0);
      }else{
        // Success: download the MP3
        const blob = xhr.response;
        // Try to use server-provided filename
        const disp = xhr.getResponseHeader("Content-Disposition") || "";
        let filename = (disp.match(/filename="?([^";]+)"?/i)||[])[1] || (outputName.value || "audio") + ".mp3";
        status("Отправляю...");
        setProgress(98);

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        a.remove();

        status("Готово! Файл скачан.", "ok");
        setProgress(100);
      }
    }catch(err){
      console.error(err);
      status("Ошибка обработки ответа", "error");
      setProgress(0);
    }finally{
      convertBtn.disabled = false;
    }
  };

  xhr.send(fd);
}

convertBtn.addEventListener("click", convert);
