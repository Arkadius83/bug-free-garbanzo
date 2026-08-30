import type { MediaBridgeStatus } from "../../../electron/shared/contracts";

type Props = {
  status: MediaBridgeStatus | null;
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  busy: boolean;
  message: string;
  onAccountIdChange: (value: string) => void;
  onBucketChange: (value: string) => void;
  onAccessKeyIdChange: (value: string) => void;
  onSecretAccessKeyChange: (value: string) => void;
  onSave: () => void;
};

export function MediaBridgePanel({ status, accountId, bucket, accessKeyId, secretAccessKey, busy, message, onAccountIdChange, onBucketChange, onAccessKeyIdChange, onSecretAccessKeyChange, onSave }: Props) {
  return <section className="panel media-bridge-panel">
    <div><span className="eyebrow">Secure Media Bridge</span><h2>Cloudflare R2 temporary delivery</h2><p>A private bucket provides a signed URL for 15 minutes. The temporary object is deleted after Meta finishes publishing.</p></div>
    <div className="media-bridge-fields"><label>R2 Account ID<input value={accountId} onChange={(event)=>onAccountIdChange(event.target.value)} placeholder="Cloudflare Account ID"/></label><label>Bucket<input value={bucket} onChange={(event)=>onBucketChange(event.target.value)} placeholder="Private R2 bucket name"/></label><label>Access Key ID<input value={accessKeyId} onChange={(event)=>onAccessKeyIdChange(event.target.value)} placeholder={status?.configured?"Enter only when replacing settings":"R2 Access Key ID"}/></label><label>Secret Access Key<input type="password" autoComplete="new-password" value={secretAccessKey} onChange={(event)=>onSecretAccessKeyChange(event.target.value)} placeholder={status?.configured?"Enter only when replacing settings":"R2 Secret Access Key"}/></label></div>
    <div className="media-bridge-actions"><button className="primary" disabled={busy||!accountId.trim()||!bucket.trim()||!accessKeyId.trim()||!secretAccessKey.trim()} onClick={()=>void onSave()}>{busy?"Testing...":"Save & test bridge"}</button><span className={status?.configured?"connected":""}>{status?.configured?`● READY · ${status.bucket}`:"○ NOT CONFIGURED"}</span></div>{message&&<p className="integration-message">{message}</p>}
  </section>;
}
