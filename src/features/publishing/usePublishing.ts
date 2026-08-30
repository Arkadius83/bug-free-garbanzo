import { useState } from "react";
import type { CampaignChannel, PublishingQueueItem } from "../../../electron/shared/contracts";

export function usePublishing() {
  const [publishingQueue, setPublishingQueue] = useState<PublishingQueueItem[]>([]);
  const [publishingPlatform, setPublishingPlatform] = useState<CampaignChannel>("Instagram");
  const [publishingCaptionId, setPublishingCaptionId] = useState("");
  const [publishingMediaId, setPublishingMediaId] = useState("");
  const [publishingDate, setPublishingDate] = useState("");
  const [publishingMessage, setPublishingMessage] = useState("");
  const [metaDestinationByItem, setMetaDestinationByItem] = useState<Record<string, string>>({});
  const [metaQueueItemId, setMetaQueueItemId] = useState("");

  return { publishingQueue, setPublishingQueue, publishingPlatform, setPublishingPlatform, publishingCaptionId, setPublishingCaptionId, publishingMediaId, setPublishingMediaId, publishingDate, setPublishingDate, publishingMessage, setPublishingMessage, metaDestinationByItem, setMetaDestinationByItem, metaQueueItemId, setMetaQueueItemId };
}
