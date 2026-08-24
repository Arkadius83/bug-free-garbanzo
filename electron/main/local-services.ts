import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LocalServiceStatus } from "../shared/contracts.js";

interface StoredLocalServices { autoStart:boolean; comfyUiBatchPath?:string; }
const defaultComfyPath="E:\\AI\\ComfyUI\\ComfyUI_windows_portable\\run_nvidia_gpu_fast_fp16_accumulation.bat";

export class LocalServicesManager {
  private readonly settingsPath:string;
  private ollamaProcess:ChildProcess|null=null;
  private comfyProcess:ChildProcess|null=null;
  private errors:{ollama:string|null;comfyui:string|null}={ollama:null,comfyui:null};
  constructor(userDataPath:string){this.settingsPath=path.join(userDataPath,"integrations","local-services.json");}
  async startConfigured():Promise<void>{const settings=await this.readSettings();if(!settings.autoStart)return;await Promise.allSettled([this.start("ollama"),this.start("comfyui")]);}
  async status():Promise<LocalServiceStatus>{const settings=await this.readSettings();const [ollama,comfyUi]=await Promise.all([this.isOnline("http://127.0.0.1:11434/api/tags"),this.isOnline("http://127.0.0.1:8188/system_stats")]);return{autoStart:settings.autoStart,ollama:{running:ollama,managed:Boolean(this.ollamaProcess),error:this.errors.ollama},comfyUi:{running:comfyUi,managed:Boolean(this.comfyProcess),batchPath:settings.comfyUiBatchPath??null,error:this.errors.comfyui}};}
  async setAutoStart(enabled:boolean):Promise<LocalServiceStatus>{const settings=await this.readSettings();settings.autoStart=enabled;await this.writeSettings(settings);return this.status();}
  async setComfyLauncher(filePath:string):Promise<LocalServiceStatus>{if(process.platform!=="win32"||path.extname(filePath).toLowerCase()!==".bat")throw new Error("Select a Windows .bat launcher for ComfyUI");await access(filePath);const settings=await this.readSettings();settings.comfyUiBatchPath=filePath;await this.writeSettings(settings);return this.status();}
  async start(service:"ollama"|"comfyui"):Promise<LocalServiceStatus>{if(service==="ollama")await this.startOllama();else await this.startComfyUi();return this.waitForStatus(service,true);}
  async stop(service:"ollama"|"comfyui"):Promise<LocalServiceStatus>{const child=service==="ollama"?this.ollamaProcess:this.comfyProcess;if(child?.pid)this.killTree(child.pid);if(service==="ollama")this.ollamaProcess=null;else this.comfyProcess=null;return this.waitForStatus(service,false);}
  stopManaged():void{if(this.ollamaProcess?.pid)this.killTree(this.ollamaProcess.pid);if(this.comfyProcess?.pid)this.killTree(this.comfyProcess.pid);this.ollamaProcess=null;this.comfyProcess=null;}
  private async startOllama():Promise<void>{if(await this.isOnline("http://127.0.0.1:11434/api/tags"))return;this.errors.ollama=null;try{this.ollamaProcess=spawn("ollama",["serve"],{windowsHide:true,stdio:"ignore"});this.watch("ollama",this.ollamaProcess);}catch(error){this.errors.ollama=error instanceof Error?error.message:"Could not start Ollama";throw error;}}
  private async startComfyUi():Promise<void>{if(await this.isOnline("http://127.0.0.1:8188/system_stats"))return;if(process.platform!=="win32")throw new Error("Automatic ComfyUI launch is currently configured for Windows");const settings=await this.readSettings(),launcher=settings.comfyUiBatchPath;if(!launcher)throw new Error("Select the ComfyUI .bat launcher in Integrations first");await access(launcher);this.errors.comfyui=null;this.comfyProcess=spawn("cmd.exe",["/d","/s","/c","call",launcher],{cwd:path.dirname(launcher),windowsHide:true,stdio:"ignore"});this.watch("comfyui",this.comfyProcess);}
  private watch(service:"ollama"|"comfyui",child:ChildProcess):void{child.once("error",(error)=>{this.errors[service]=error.message;});child.once("exit",(code)=>{if(service==="ollama")this.ollamaProcess=null;else this.comfyProcess=null;if(code&&code!==0)this.errors[service]=`${service} exited with code ${code}`;});}
  private killTree(pid:number):void{if(process.platform==="win32")spawnSync("taskkill",["/pid",String(pid),"/T","/F"],{windowsHide:true,stdio:"ignore"});else{try{process.kill(pid,"SIGTERM");}catch{}}}
  private async waitForStatus(service:"ollama"|"comfyui",expected:boolean):Promise<LocalServiceStatus>{for(let attempt=0;attempt<30;attempt++){const result=await this.status(),running=service==="ollama"?result.ollama.running:result.comfyUi.running;if(running===expected)return result;await new Promise((resolve)=>setTimeout(resolve,500));}return this.status();}
  private async isOnline(url:string):Promise<boolean>{try{const response=await fetch(url,{signal:AbortSignal.timeout(800)});return response.ok;}catch{return false;}}
  private async readSettings():Promise<StoredLocalServices>{try{return JSON.parse(await readFile(this.settingsPath,"utf8")) as StoredLocalServices;}catch{const hasDefault=process.platform==="win32"&&await access(defaultComfyPath).then(()=>true).catch(()=>false);return{autoStart:true,comfyUiBatchPath:hasDefault?defaultComfyPath:undefined};}}
  private async writeSettings(value:StoredLocalServices):Promise<void>{await mkdir(path.dirname(this.settingsPath),{recursive:true});await writeFile(this.settingsPath,JSON.stringify(value,null,2),"utf8");}
}
