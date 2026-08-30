import { useState } from "react";
import type { ArtistAlias, CatalogMatchSuggestion, LocalServiceStatus, MediaBridgeStatus, MediaGenerationSettings, MetaConnection, SoundCloudCatalogStatus, SoundCloudConnection, SoundCloudTrackPerformance, SoundCloudTrackSummary, SpotifyConnection, SpotifyReleaseSummary } from "../../../electron/shared/contracts";

export function useIntegrations() {
  const [soundCloud, setSoundCloud] = useState<SoundCloudConnection | null>(null);
  const [soundCloudTracks, setSoundCloudTracks] = useState<SoundCloudTrackSummary[]>([]);
  const [soundCloudClientId, setSoundCloudClientId] = useState("");
  const [soundCloudClientSecret, setSoundCloudClientSecret] = useState("");
  const [soundCloudMessage, setSoundCloudMessage] = useState("");
  const [soundCloudBusy, setSoundCloudBusy] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogStatusFilter, setCatalogStatusFilter] = useState<SoundCloudCatalogStatus | "all">("all");
  const [catalogArtistFilter, setCatalogArtistFilter] = useState<ArtistAlias | "all" | "unassigned">("all");
  const [catalogSort, setCatalogSort] = useState<"newest" | "plays" | "likes" | "engagement">("engagement");
  const [selectedPerformanceTrackId, setSelectedPerformanceTrackId] = useState<number | null>(null);
  const [trackPerformance, setTrackPerformance] = useState<SoundCloudTrackPerformance | null>(null);
  const [spotify, setSpotify] = useState<SpotifyConnection | null>(null);
  const [spotifyClientId, setSpotifyClientId] = useState("");
  const [spotifyArtistIds, setSpotifyArtistIds] = useState<Record<ArtistAlias, string>>({ "the-arkadiusz": "", arkadelic: "", "ar-tek": "", "echoes-of-arcadia": "" });
  const [spotifyReleases, setSpotifyReleases] = useState<SpotifyReleaseSummary[]>([]);
  const [spotifyMessage, setSpotifyMessage] = useState("");
  const [spotifyBusy, setSpotifyBusy] = useState(false);
  const [catalogMatches, setCatalogMatches] = useState<CatalogMatchSuggestion[]>([]);
  const [mediaSettings, setMediaSettings] = useState<MediaGenerationSettings>({ openAiConfigured: false, klingConfigured: false, comfyUiUrl: "http://127.0.0.1:8188", comfyUiAvailable: false, comfyUiCheckpoints: [], comfyUiCheckpoint: null, comfyUiError: null });
  const [openAiKey, setOpenAiKey] = useState("");
  const [klingKey, setKlingKey] = useState("");
  const [comfyUiUrl, setComfyUiUrl] = useState("http://127.0.0.1:8188");
  const [comfyUiCheckpoint, setComfyUiCheckpoint] = useState("");
  const [localServices, setLocalServices] = useState<LocalServiceStatus | null>(null);
  const [localServiceBusy, setLocalServiceBusy] = useState(false);
  const [meta, setMeta] = useState<MetaConnection | null>(null);
  const [metaAppId, setMetaAppId] = useState("");
  const [metaAppSecret, setMetaAppSecret] = useState("");
  const [metaConfigurationId, setMetaConfigurationId] = useState("");
  const [metaBusy, setMetaBusy] = useState(false);
  const [metaMessage, setMetaMessage] = useState("");
  const [mediaBridge, setMediaBridge] = useState<MediaBridgeStatus | null>(null);
  const [r2AccountId, setR2AccountId] = useState("");
  const [r2Bucket, setR2Bucket] = useState("");
  const [r2AccessKeyId, setR2AccessKeyId] = useState("");
  const [r2SecretAccessKey, setR2SecretAccessKey] = useState("");
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [bridgeMessage, setBridgeMessage] = useState("");

  return { soundCloud, setSoundCloud, soundCloudTracks, setSoundCloudTracks, soundCloudClientId, setSoundCloudClientId, soundCloudClientSecret, setSoundCloudClientSecret, soundCloudMessage, setSoundCloudMessage, soundCloudBusy, setSoundCloudBusy, catalogQuery, setCatalogQuery, catalogStatusFilter, setCatalogStatusFilter, catalogArtistFilter, setCatalogArtistFilter, catalogSort, setCatalogSort, selectedPerformanceTrackId, setSelectedPerformanceTrackId, trackPerformance, setTrackPerformance, spotify, setSpotify, spotifyClientId, setSpotifyClientId, spotifyArtistIds, setSpotifyArtistIds, spotifyReleases, setSpotifyReleases, spotifyMessage, setSpotifyMessage, spotifyBusy, setSpotifyBusy, catalogMatches, setCatalogMatches, mediaSettings, setMediaSettings, openAiKey, setOpenAiKey, klingKey, setKlingKey, comfyUiUrl, setComfyUiUrl, comfyUiCheckpoint, setComfyUiCheckpoint, localServices, setLocalServices, localServiceBusy, setLocalServiceBusy, meta, setMeta, metaAppId, setMetaAppId, metaAppSecret, setMetaAppSecret, metaConfigurationId, setMetaConfigurationId, metaBusy, setMetaBusy, metaMessage, setMetaMessage, mediaBridge, setMediaBridge, r2AccountId, setR2AccountId, r2Bucket, setR2Bucket, r2AccessKeyId, setR2AccessKeyId, r2SecretAccessKey, setR2SecretAccessKey, bridgeBusy, setBridgeBusy, bridgeMessage, setBridgeMessage };
}
