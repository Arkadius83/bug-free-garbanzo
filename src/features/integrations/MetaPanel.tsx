import type { MetaConnection } from "../../../electron/shared/contracts";

type Props = {
  meta: MetaConnection | null;
  appId: string;
  appSecret: string;
  configurationId: string;
  busy: boolean;
  message: string;
  onAppIdChange: (value: string) => void;
  onAppSecretChange: (value: string) => void;
  onConfigurationIdChange: (value: string) => void;
  onSave: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
};

export function MetaPanel({ meta, appId, appSecret, configurationId, busy, message, onAppIdChange, onAppSecretChange, onConfigurationIdChange, onSave, onConnect, onDisconnect }: Props) {
  return <section className="panel meta-panel"><div className="integration-title"><span className="meta-mark">f</span><div><h2>Meta publishing</h2><p>Facebook Pages + connected Instagram professional accounts · Graph API {meta?.graphVersion??"v26.0"}</p></div><span className={`connection-badge ${meta?.connected?"connected":""}`}>{meta?.connected?`● ${meta.destinations.length} DESTINATIONS`:"○ NOT CONNECTED"}</span></div><div className="meta-setup-grid"><div><div className="callback-box"><small>VALID OAUTH REDIRECT URI — add this exact address in Meta App Dashboard</small><code>{meta?.callbackUrl??"http://localhost:43822/callback"}</code></div><label>Meta App ID<input placeholder={meta?.configured?"App ID already configured":"Paste Meta App ID"} value={appId} onChange={(event)=>onAppIdChange(event.target.value)}/></label><label>Meta App Secret<input type="password" autoComplete="new-password" placeholder={meta?.configured?"Enter only when replacing credentials":"Paste Meta App Secret"} value={appSecret} onChange={(event)=>onAppSecretChange(event.target.value)}/></label><label>Business Login Configuration ID<input placeholder="Paste Configuration ID" value={configurationId} onChange={(event)=>onConfigurationIdChange(event.target.value)}/></label><div className="integration-actions"><button disabled={busy||!configurationId.trim()} onClick={()=>void onSave()}>Save encrypted credentials</button><button className="primary" disabled={busy||!meta?.configured||meta.connected} onClick={()=>void onConnect()}>Connect Meta</button>{meta?.connected&&<button className="danger-button" disabled={busy} onClick={()=>void onDisconnect()}>Disconnect</button>}</div>{message&&<p className="integration-message">{message}</p>}</div><div className="meta-destinations">{meta?.destinations.map((destination)=><article key={destination.id}><b>{destination.platform==="Facebook"?"f":"◎"}</b><div><strong>{destination.username?`@${destination.username}`:destination.name}</strong><small>{destination.platform} · {destination.pageId}</small></div></article>)}{!meta?.destinations.length&&<div className="empty-catalog"><strong>No Meta destinations discovered</strong><p>Create a Meta developer app, add Facebook Login, configure the redirect URI and request Pages permissions.</p></div>}</div></div><p className="meta-limit"><b>V1 capability:</b> Facebook text and image publishing is active. Instagram Feed publishing supports approved PNG and JPEG images through the Secure Media Bridge.</p></section>;
}
