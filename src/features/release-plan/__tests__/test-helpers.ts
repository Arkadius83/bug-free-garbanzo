import type {
  ApprovalRecord,
  CampaignItem,
  ContentLanguage,
  GeneratePromoContentInput,
  PromoGeneration,
  ScheduleEvent,
  ReleasePlan,
  ReleaseSummary,
  StudioApi
} from "../../../../electron/shared/contracts";

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export function resetIdCounter(): void {
  idCounter = 0;
}

export function mockRelease(overrides?: Partial<ReleaseSummary>): ReleaseSummary {
  return {
    id: "release-1",
    title: "Different Perspective",
    artistId: "the-arkadiusz",
    artistName: "The Arkadiusz",
    primaryGenre: "Electronic",
    story: "A story about perspective",
    status: "draft",
    releaseDate: "2026-10-01",
    createdAt: "2026-09-01T00:00:00Z",
    ...overrides
  };
}

export function mockPlan(overrides?: Partial<ReleasePlan>): ReleasePlan {
  return {
    id: nextId("plan"),
    releaseId: "release-1",
    status: "DRAFT",
    version: 1,
    revisionNumber: 1,
    previousPlanId: null,
    title: "Release Plan for Different Perspective",
    summary: "AI-generated promotional plan for electronic single",
    createdBy: "local-user",
    approvedAt: null,
    completedAt: null,
    createdAt: "2026-09-15T10:00:00Z",
    updatedAt: "2026-09-15T10:00:00Z",
    campaignItems: [],
    ...overrides
  };
}

export function mockItem(overrides?: Partial<CampaignItem>): CampaignItem {
  return {
    id: nextId("item"),
    releasePlanId: "plan-1",
    title: "Instagram announcement",
    purpose: "Announce the release to followers",
    contentType: "caption",
    targetPlatforms: ["Instagram"],
    plannedDate: "2026-10-01",
    plannedTime: "18:00",
    cta: "Listen now",
    notes: "Use the cover artwork",
    assetRequirements: ["cover art"],
    copyRequirements: ["short hook"],
    status: "DRAFT",
    sortOrder: 0,
    createdAt: "2026-09-15T10:00:00Z",
    updatedAt: "2026-09-15T10:00:00Z",
    ...overrides
  };
}

export function mockApprovalRecord(overrides?: Partial<ApprovalRecord>): ApprovalRecord {
  return {
    id: nextId("record"),
    entityType: "release_plan",
    entityId: "plan-1",
    action: "APPROVED",
    actor: "local-user",
    reason: "Looks good",
    previousStatus: "REVIEWED",
    newStatus: "APPROVED",
    createdAt: "2026-09-15T12:00:00Z",
    ...overrides
  };
}


export function mockScheduleEvent(overrides?: Partial<ScheduleEvent>): ScheduleEvent {
  return {
    id: nextId("schedule"),
    releaseId: "release-1",
    releaseTitle: "Different Perspective",
    releasePlanId: "plan-1",
    campaignItemId: "item-1",
    campaignItemTitle: "Instagram announcement",
    promoGenerationId: "pg-1",
    platform: "Instagram",
    scheduledAt: "2026-10-01T16:00:00.000Z",
    timezone: "Europe/Berlin",
    status: "DRAFT",
    publishingQueueId: null,
    queuedAt: null,
    queuedBy: null,
    createdAt: "2026-09-15T12:00:00Z",
    updatedAt: "2026-09-15T12:00:00Z",
    ...overrides
  };
}
export type MockStudio = {
  [K in keyof StudioApi]: StudioApi[K] extends (...args: infer A) => infer R
    ? (...args: A) => R
    : StudioApi[K];
};

export function createMockStudio(overrides?: Partial<StudioApi>): MockStudio {
  return {
    getCurrentReleasePlan: async () => null,
    listReleasePlans: async () => [],
    getReleasePlan: async () => null,
    generateReleasePlan: async (input) => mockPlan({ releaseId: input.releaseId }),
    regenerateReleasePlan: async (input) => mockPlan({ releaseId: input.releaseId, revisionNumber: 2 }),
    approveReleasePlan: async (input) => mockPlan({ id: input.id, status: "APPROVED" }),
    changeReleasePlanStatus: async (input) => mockPlan({ id: input.id, status: input.status }),
    createCampaignItem: async (input) => mockItem({ releasePlanId: input.releasePlanId, title: input.title }),
    updateCampaignItem: async (input) => mockItem({ id: input.id, title: input.title ?? "Updated item" }),
    deleteCampaignItem: async () => undefined,
    deleteDraft: async () => undefined,
    deleteCampaignPackItem: async () => undefined,
    deletePromoGeneration: async () => undefined,
    reorderCampaignItems: async (input) => input.itemIds.map((id, i) => mockItem({ id, sortOrder: i })),
    listApprovalRecords: async () => [],
    generatePromoContent: async (input: GeneratePromoContentInput) => ({ runId: input.releasePlanId, totalItems: 0, generated: 0, failed: 0, skipped: 0, items: [] }),
    listPromoGenerations: async () => [],
    retryPromoGeneration: async () => ({ id: "promo-1", releaseId: "release-1", releasePlanId: "plan-1", campaignItemId: "item-1", contentType: "caption", generatedContent: "Retry content", campaignPackItemId: null, status: "SUCCESS" as const, error: null, model: "test", reviewStatus: "GENERATED" as const, originalContent: null, editedContent: null, reviewActor: null, reviewReason: null, reviewedAt: null, createdAt: "2026-09-15T12:00:00Z" }),
    updatePromoReview: async (input) => ({ id: input.promoGenerationId, releaseId: "release-1", releasePlanId: "plan-1", campaignItemId: "item-1", contentType: "caption", generatedContent: "content", campaignPackItemId: null, status: "SUCCESS" as const, error: null, model: "test", reviewStatus: input.reviewStatus, originalContent: null, editedContent: null, reviewActor: input.reviewActor ?? null, reviewReason: input.reviewReason ?? null, reviewedAt: "2026-09-15T12:00:00Z", createdAt: "2026-09-15T12:00:00Z" }),
    editPromoContent: async (input) => ({ id: input.promoGenerationId, releaseId: "release-1", releasePlanId: "plan-1", campaignItemId: "item-1", contentType: "caption", generatedContent: "original", campaignPackItemId: null, status: "SUCCESS" as const, error: null, model: "test", reviewStatus: "EDITED" as const, originalContent: "original", editedContent: input.editedContent, reviewActor: null, reviewReason: null, reviewedAt: null, createdAt: "2026-09-15T12:00:00Z" }),
    createScheduleEvent: async (input) => mockScheduleEvent({ promoGenerationId: input.promoGenerationId, platform: input.platform, scheduledAt: input.scheduledAt, timezone: input.timezone }),
    updateScheduleEvent: async (input) => mockScheduleEvent({ id: input.id, platform: input.platform ?? "Instagram", scheduledAt: input.scheduledAt ?? "2026-10-01T16:00:00.000Z", timezone: input.timezone ?? "Europe/Berlin", status: input.status ?? "DRAFT" }),
    cancelScheduleEvent: async (id) => mockScheduleEvent({ id, status: "CANCELLED" }),
    listScheduleEvents: async () => [],
    sendScheduleEventToPublishingQueue: async (id) => ({ scheduleEvent: mockScheduleEvent({ id, publishingQueueId: "queue-1", queuedAt: "2026-09-15T12:00:00Z", queuedBy: "local-user" }), publishingQueueItem: { id: "queue-1", releaseId: "release-1", releaseTitle: "Different Perspective", platform: "Instagram", campaignPackItemId: "pack-1", mediaGenerationId: null, caption: "Approved copy", scheduledAt: "2026-10-01T16:00:00.000Z", status: "draft", error: null, exportedAt: null, remotePostId: null, publishedAt: null, destinationId: null, mediaType: null, mediaProvider: null, rightsBlocked: false, createdAt: "2026-09-15T12:00:00Z", updatedAt: "2026-09-15T12:00:00Z" } }),
    ...overrides
  } as MockStudio;
}

export function installMockStudio(mock: MockStudio): void {
  window.studio = mock as import("../../../../electron/shared/contracts").StudioApi;
}

export function removeMockStudio(): void {
  window.studio = undefined;
}
