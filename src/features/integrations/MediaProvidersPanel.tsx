import type { LocalServiceStatus, MediaGenerationSettings } from "../../../electron/shared/contracts";

type Props = {
  localServices: LocalServiceStatus | null;
  localServiceBusy: boolean;
  mediaSettings: MediaGenerationSettings;
  openAiKey: string;
  klingKey: string;
  mediaMessage: string;
  comfyUiUrl: string;
  comfyUiCheckpoint: string;
  onAutoStartChange: (enabled: boolean) => void;
  onChooseComfyLauncher: () => void;
  onToggleLocalService: (service: "ollama" | "comfyui", running: boolean) => void;
  onOpenAiKeyChange: (value: string) => void;
  onKlingKeyChange: (value: string) => void;
  onSaveCredentials: () => void;
  onComfyUiUrlChange: (value: string) => void;
  onTestComfyUi: () => void;
  onComfyUiCheckpointChange: (value: string) => void;
  onSaveComfyUi: () => void;
};

export function MediaProvidersPanel({ localServices, localServiceBusy, mediaSettings, openAiKey, klingKey, mediaMessage, comfyUiUrl, comfyUiCheckpoint, onAutoStartChange, onChooseComfyLauncher, onToggleLocalService, onOpenAiKeyChange, onKlingKeyChange, onSaveCredentials, onComfyUiUrlChange, onTestComfyUi, onComfyUiCheckpointChange, onSaveComfyUi }: Props) {
  return <section className="panel media-provider-panel">
    <div className="integration-title"><span className="ai-provider-mark">✦</span><div><h2>AI media providers</h2><p>API keys encrypted locally · calls start only after a manual click</p></div></div>
    {localServices&&<div className="local-service-manager"><div><span className="eyebrow">Application lifecycle</span><h3>Local AI services</h3><label className="auto-start-toggle"><input type="checkbox" checked={localServices.autoStart} onChange={(event)=>void onAutoStartChange(event.target.checked)}/> Start Ollama with AI Studio Manager. ComfyUI starts only when local image generation is requested.</label></div>{(["ollama","comfyui"] as const).map((service)=>{const serviceStatus=service==="ollama"?localServices.ollama:localServices.comfyUi;return <article key={service}><div><strong>{service==="ollama"?"Ollama":"ComfyUI"}</strong><span className={serviceStatus.running?"online":""}>{serviceStatus.running?`● RUNNING${serviceStatus.managed?" · MANAGED BY APP":" · EXTERNAL"}`:"○ STOPPED"}</span>{service==="comfyui"&&<small>{localServices.comfyUi.batchPath??"No .bat launcher selected"}</small>}{serviceStatus.error&&<small className="service-error">{serviceStatus.error}</small>}</div><div>{service==="comfyui"&&<button disabled={localServiceBusy} onClick={()=>void onChooseComfyLauncher()}>Choose .bat</button>}<button className={serviceStatus.running?"danger-button":"primary"} disabled={localServiceBusy||(serviceStatus.running&&!serviceStatus.managed)} onClick={()=>void onToggleLocalService(service,serviceStatus.running)}>{serviceStatus.running?serviceStatus.managed?"Stop":"External process":"Start"}</button></div></article>})}</div>}
    <div className="provider-key-grid"><label>OpenAI API key<input type="password" autoComplete="new-password" placeholder={mediaSettings.openAiConfigured?"OpenAI key already configured":"Paste OpenAI API key"} value={openAiKey} onChange={(event)=>onOpenAiKeyChange(event.target.value)}/><small>Images with GPT Image 1.5</small></label><label>Kling API key<input type="password" autoComplete="new-password" placeholder={mediaSettings.klingConfigured?"Kling key already configured":"Paste Kling API key"} value={klingKey} onChange={(event)=>onKlingKeyChange(event.target.value)}/><small>Images and vertical 5-second videos</small></label></div>
    <div className="integration-actions"><button disabled={!openAiKey.trim()&&!klingKey.trim()} onClick={()=>void onSaveCredentials()}>Save encrypted keys</button><span className="cost-warning">Generation can consume paid provider credits.</span></div>{mediaMessage&&<p className="integration-message">{mediaMessage}</p>}
    <div className="comfy-setup"><div><span className="eyebrow">Local · no API credits</span><h3>ComfyUI image generation</h3><p>ComfyUI remains off until a local image is requested. Only a local loopback address is accepted.</p></div><div className="comfy-controls"><label>ComfyUI address<input value={comfyUiUrl} onChange={(event)=>onComfyUiUrlChange(event.target.value)} /></label><button onClick={()=>void onTestComfyUi()}>Test & discover models</button><label>Checkpoint<select disabled={!mediaSettings.comfyUiAvailable} value={comfyUiCheckpoint} onChange={(event)=>onComfyUiCheckpointChange(event.target.value)}><option value="">Select checkpoint</option>{mediaSettings.comfyUiCheckpoints.map((checkpoint)=><option value={checkpoint} key={checkpoint}>{checkpoint}</option>)}</select></label><button className="primary" disabled={!mediaSettings.comfyUiAvailable||!comfyUiCheckpoint} onClick={()=>void onSaveComfyUi()}>Save local model</button></div><div className={`comfy-status ${mediaSettings.comfyUiAvailable?"connected":""}`}>{mediaSettings.comfyUiAvailable?`● ONLINE · ${mediaSettings.comfyUiCheckpoint??"select model"}`:`○ STANDBY · starts on generation${mediaSettings.comfyUiCheckpoint?` · ${mediaSettings.comfyUiCheckpoint}`:""}`}</div></div>
  </section>;
}
