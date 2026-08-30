const fs=require('fs');
const p='src/App.tsx';
let s=fs.readFileSync(p,'utf8');
const imports=[
'import { useReleaseManager } from "./features/releases/useReleaseManager";',
'import { useAiStudio } from "./features/ai-studio/useAiStudio";',
'import { usePublishing } from "./features/publishing/usePublishing";',
'import { useIntegrations } from "./features/integrations/useIntegrations";'
].join('\n')+'\n';
const anchor='import { SpotifyPanel } from "./features/integrations/SpotifyPanel";\n';
if(!s.includes(imports.trim())) s=s.replace(anchor,anchor+imports);
const groups={
 release:['releases','activeReleaseId','assets','assetMessage','audioAnalyses','playbackUrls','analyzingAssetId','releaseReadiness','saveMessage','title','story','releaseDate','primaryGenre','releaseStatus'],
 ai:['drafts','aiSettings','generatedDraft','generationState','generationMessage','campaignPackItems','campaignPackBusy','campaignPackMessage','mediaGenerations','mediaUrls','mediaBusy','mediaMessage'],
 publishing:['publishingQueue','publishingPlatform','publishingCaptionId','publishingMediaId','publishingDate','publishingMessage','metaDestinationByItem','metaQueueItemId'],
 integrations:['soundCloud','soundCloudTracks','soundCloudClientId','soundCloudClientSecret','soundCloudMessage','soundCloudBusy','catalogQuery','catalogStatusFilter','catalogArtistFilter','catalogSort','selectedPerformanceTrackId','trackPerformance','spotify','spotifyClientId','spotifyArtistIds','spotifyReleases','spotifyMessage','spotifyBusy','catalogMatches','mediaSettings','openAiKey','klingKey','comfyUiUrl','comfyUiCheckpoint','localServices','localServiceBusy','meta','metaAppId','metaAppSecret','metaConfigurationId','metaBusy','metaMessage','mediaBridge','r2AccountId','r2Bucket','r2AccessKeyId','r2SecretAccessKey','bridgeBusy','bridgeMessage']
};
for(const names of Object.values(groups)) for(const name of names){
 const rx=new RegExp('\\s*const \\[\\s*'+name+'\\s*,[^;]+;','m');
 if(!rx.test(s)) throw new Error('state declaration not found: '+name);
 s=s.replace(rx,'');
}
const fn='export function App() {';
const hookBlock=`export function App() {\n  const { releases, setReleases, activeReleaseId, setActiveReleaseId, assets, setAssets, assetMessage, setAssetMessage, audioAnalyses, setAudioAnalyses, playbackUrls, setPlaybackUrls, analyzingAssetId, setAnalyzingAssetId, releaseReadiness, setReleaseReadiness, saveMessage, setSaveMessage, title, setTitle, story, setStory, releaseDate, setReleaseDate, primaryGenre, setPrimaryGenre, releaseStatus, setReleaseStatus } = useReleaseManager();\n  const { drafts, setDrafts, aiSettings, setAiSettings, generatedDraft, setGeneratedDraft, generationState, setGenerationState, generationMessage, setGenerationMessage, campaignPackItems, setCampaignPackItems, campaignPackBusy, setCampaignPackBusy, campaignPackMessage, setCampaignPackMessage, mediaGenerations, setMediaGenerations, mediaUrls, setMediaUrls, mediaBusy, setMediaBusy, mediaMessage, setMediaMessage } = useAiStudio();\n  const { publishingQueue, setPublishingQueue, publishingPlatform, setPublishingPlatform, publishingCaptionId, setPublishingCaptionId, publishingMediaId, setPublishingMediaId, publishingDate, setPublishingDate, publishingMessage, setPublishingMessage, metaDestinationByItem, setMetaDestinationByItem, metaQueueItemId, setMetaQueueItemId } = usePublishing();\n  const { soundCloud, setSoundCloud, soundCloudTracks, setSoundCloudTracks, soundCloudClientId, setSoundCloudClientId, soundCloudClientSecret, setSoundCloudClientSecret, soundCloudMessage, setSoundCloudMessage, soundCloudBusy, setSoundCloudBusy, catalogQuery, setCatalogQuery, catalogStatusFilter, setCatalogStatusFilter, catalogArtistFilter, setCatalogArtistFilter, catalogSort, setCatalogSort, selectedPerformanceTrackId, setSelectedPerformanceTrackId, trackPerformance, setTrackPerformance, spotify, setSpotify, spotifyClientId, setSpotifyClientId, spotifyArtistIds, setSpotifyArtistIds, spotifyReleases, setSpotifyReleases, spotifyMessage, setSpotifyMessage, spotifyBusy, setSpotifyBusy, catalogMatches, setCatalogMatches, mediaSettings, setMediaSettings, openAiKey, setOpenAiKey, klingKey, setKlingKey, comfyUiUrl, setComfyUiUrl, comfyUiCheckpoint, setComfyUiCheckpoint, localServices, setLocalServices, localServiceBusy, setLocalServiceBusy, meta, setMeta, metaAppId, setMetaAppId, metaAppSecret, setMetaAppSecret, metaConfigurationId, setMetaConfigurationId, metaBusy, setMetaBusy, metaMessage, setMetaMessage, mediaBridge, setMediaBridge, r2AccountId, setR2AccountId, r2Bucket, setR2Bucket, r2AccessKeyId, setR2AccessKeyId, r2SecretAccessKey, setR2SecretAccessKey, bridgeBusy, setBridgeBusy, bridgeMessage, setBridgeMessage } = useIntegrations();`;
s=s.replace(fn,hookBlock);
fs.writeFileSync(p,s);
