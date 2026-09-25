import { useEffect, useLayoutEffect, useMemo, useState } from "react";


import type { CampaignPackItem, CampaignChannel, PublishingQueueItem, ScheduleEvent, ScheduleEventStatus, StudioApi } from "../../../electron/shared/contracts";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Modal } from "../../ui/Modal";
import { PageHeader } from "../../ui/PageHeader";
import { SectionCard } from "../../ui/SectionCard";
import { StatusBadge, type StatusBadgeTone } from "../../ui/StatusBadge";
import { Toolbar } from "../../ui/Toolbar";
import { Tabs } from "../../ui/Tabs";
import { Select } from "../../ui/Select";
import "./content-calendar.css";

type CalendarView = "month" | "week" | "list";
const platforms: CampaignChannel[] = ["Instagram", "Facebook", "TikTok", "SoundCloud", "YouTube"];
const scheduleStatuses: ScheduleEventStatus[] = ["DRAFT", "READY", "SCHEDULED", "CANCELLED"];
const queueSupportedPlatforms = new Set<CampaignChannel>(["Instagram", "Facebook"]);
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function formatDateTime(value: string, timezone: string): string { return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value)); }
function dateKey(value: string, timezone: string): string { return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)); }
function getLocalInputValue(value: string): string { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
function statusTone(status: ScheduleEventStatus): StatusBadgeTone { return status === "READY" ? "success" : status === "SCHEDULED" ? "cyan" : status === "CANCELLED" ? "danger" : "neutral"; }
function draftTone(status: string): StatusBadgeTone { return status === "approved" ? "success" : status === "scheduled" ? "cyan" : status === "rejected" ? "danger" : "neutral"; }
function visibleEvents(events: ScheduleEvent[], view: CalendarView): ScheduleEvent[] { if (view === "list") return events; const now = new Date(), start = new Date(now); if (view === "week") start.setDate(now.getDate() - now.getDay() + 1); else start.setDate(1); start.setHours(0, 0, 0, 0); const end = new Date(start); if (view === "week") end.setDate(start.getDate() + 7); else end.setMonth(start.getMonth() + 1); return events.filter((event) => { const date = new Date(event.scheduledAt); return date >= start && date < end; }); }
function buildMonthGrid(year: number, month: number): { date: Date; currentMonth: boolean; dayNumber: number }[] {
  const first = new Date(year, month, 1); const startDay = (first.getDay() + 6) % 7; const daysInMonth = new Date(year, month + 1, 0).getDate(); const result: { date: Date; currentMonth: boolean; dayNumber: number }[] = [];
  for (let i = 0; i < startDay; i++) { const d = new Date(year, month, 0 - (startDay - 1 - i)); result.push({ date: d, currentMonth: false, dayNumber: d.getDate() }); }
  for (let d = 1; d <= daysInMonth; d++) result.push({ date: new Date(year, month, d), currentMonth: true, dayNumber: d });
  const total = result.length; const remaining = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let i = 1; i <= remaining; i++) result.push({ date: new Date(year, month + 1, i), currentMonth: false, dayNumber: i });
  return result;
}

export function ContentCalendar({ campaignPackItems, publishingQueue, activeReleaseId, onOpenRelease }: { campaignPackItems?: CampaignPackItem[]; publishingQueue?: PublishingQueueItem[]; activeReleaseId?: string | null; onOpenRelease?: () => void }) {
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [view, setView] = useState<CalendarView>("list");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<ScheduleEvent | null>(null);
  const [editPlatform, setEditPlatform] = useState<CampaignChannel>("Instagram");
  const [editStatus, setEditStatus] = useState<ScheduleEventStatus>("DRAFT");
  const [editTime, setEditTime] = useState("");
  const [queueing, setQueueing] = useState(false);
  const [filterPlatform, setFilterPlatform] = useState<CampaignChannel | "all">("all");
  const [filterStatus, setFilterStatus] = useState<ScheduleEventStatus | "all">("all");
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showApprovalQueue, setShowApprovalQueue] = useState(false);
  const [drawerEvent, setDrawerEvent] = useState<ScheduleEvent | null>(null);
  const [drawerPackItem, setDrawerPackItem] = useState<CampaignPackItem | null>(null);

  async function loadEvents() { setLoading(true); setMessage(""); try { const studio = (globalThis as any).window?.studio; if (!studio) { setMessage("studio not found"); setLoading(false); return; } setEvents(await studio.listScheduleEvents()); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load calendar"); } finally { setLoading(false); } }
  useLayoutEffect(() => { void loadEvents(); }, []);

  const allEvents = useMemo(() => {
    let filtered = events;
    if (filterPlatform !== "all") filtered = filtered.filter((e) => e.platform === filterPlatform);
    if (filterStatus !== "all") filtered = filtered.filter((e) => e.status === filterStatus);
    return filtered;
  }, [events, filterPlatform, filterStatus]);

  const shown = useMemo(() => visibleEvents(allEvents, view), [allEvents, view]);
  const grouped = useMemo(() => shown.reduce<Record<string, ScheduleEvent[]>>((groups, event) => { const key = dateKey(event.scheduledAt, event.timezone); groups[key] = [...(groups[key] ?? []), event]; return groups; }, {}), [shown]);

  const monthGrid = useMemo(() => buildMonthGrid(calendarYear, calendarMonth), [calendarYear, calendarMonth]);

  const pendingItems = useMemo(() => (campaignPackItems ?? []).filter((item) => item.status === "draft" || item.status === "approved"), [campaignPackItems]);
  const needsApprovalCount = pendingItems.length;
  const scheduledCount = allEvents.filter((e) => e.status === "SCHEDULED").length;
  const publishedCount = allEvents.filter((e) => e.status === "READY").length;

  function openEdit(event: ScheduleEvent) { setEditing(event); setEditPlatform(event.platform); setEditStatus(event.status); setEditTime(getLocalInputValue(event.scheduledAt)); }
  function openDrawer(event: ScheduleEvent) { setDrawerEvent(event); setDrawerPackItem(null); }
  function openPackDrawer(item: CampaignPackItem) { setDrawerPackItem(item); setDrawerEvent(null); }
  async function saveEdit() { if (!window.studio || !editing || !editTime) return; setMessage("Saving schedule..."); try { const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || editing.timezone || "UTC"; const updated = await window.studio.updateScheduleEvent({ id: editing.id, platform: editPlatform, status: editStatus, scheduledAt: new Date(editTime).toISOString(), timezone }); setEvents((current) => current.map((event) => event.id === updated.id ? updated : event)); setEditing(null); setMessage("Schedule updated."); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update schedule"); } }
  async function cancelEvent(event: ScheduleEvent) { if (!window.studio) return; setMessage("Cancelling schedule..."); try { const updated = await window.studio.cancelScheduleEvent(event.id); setEvents((current) => current.map((item) => item.id === updated.id ? updated : item)); setEditing(null); setMessage("Schedule cancelled."); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not cancel schedule"); } }
  async function sendToPublishingQueue(event: ScheduleEvent) { if (!window.studio) return; setQueueing(true); setMessage("Sending to Publishing Queue..."); try { const result = await window.studio.sendScheduleEventToPublishingQueue(event.id); setEvents((current) => current.map((item) => item.id === result.scheduleEvent.id ? result.scheduleEvent : item)); setEditing(result.scheduleEvent); setMessage("Sent to Publishing Queue as a draft for its existing approval workflow."); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not send to Publishing Queue"); } finally { setQueueing(false); } }

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return (
    <div className="content-calendar content-calendar-v5">
      <PageHeader eyebrow="Content Calendar" title="Plan, review and manage your content across platforms." lead="Calendar entries are persisted ScheduleEvents. Publishing jobs are created later, after review." actions={<>
        <Button variant="ghost" onClick={onOpenRelease}>{activeReleaseId ? "Switch release" : "Release"}</Button>
        <Button variant="ghost">Today</Button>
        <Button variant="primary">+ Create content</Button>
      </>}>
        <Toolbar className="calendar-filter-bar" ariaLabel="Calendar filters">
          <Select value={filterPlatform} options={[{ value: "all", label: "All platforms" }, ...platforms.map((p) => ({ value: p, label: p }))]} onChange={(event) => setFilterPlatform(event.target.value as CampaignChannel | "all")} />
          <Select value={filterStatus} options={[{ value: "all", label: "All statuses" }, ...scheduleStatuses.map((s) => ({ value: s, label: s }))]} onChange={(event) => setFilterStatus(event.target.value as ScheduleEventStatus | "all")} />
        </Toolbar>
        <Toolbar className="calendar-kpi-bar" ariaLabel="Calendar statistics">
          <Tabs activeTab={view} onChange={(mode) => setView(mode as CalendarView)} tabs={[{ id: "week", label: "Week" }, { id: "month", label: "Month" }, { id: "list", label: "List" }]} ariaLabel="Calendar views" />
          <span className="kpi-counter"><b>{scheduledCount}</b> Scheduled</span>
          <span className="kpi-counter"><b>{needsApprovalCount}</b> Needs Approval</span>
          <span className="kpi-counter"><b>{publishedCount}</b> Published</span>
        </Toolbar>
      </PageHeader>

      <section className="content-calendar" aria-label="Content Calendar">
        <div className="content-calendar-layout">
          <div className="calendar-panel">
            <SectionCard eyebrow="Calendar" title={`${monthNames[calendarMonth]} ${calendarYear}`} actions={<>
              <Button variant="ghost" onClick={() => setCalendarMonth(calendarMonth - 1)}>Previous</Button>
              <Button variant="ghost" onClick={() => { setCalendarYear(new Date().getFullYear()); setCalendarMonth(new Date().getMonth()); }}>Today</Button>
              <Button variant="ghost" onClick={() => setCalendarMonth(calendarMonth + 1)}>Next</Button>
            </>}>
              <div className="calendar-month-header">
                {days.map((day) => <span key={day} className="calendar-weekday">{day.slice(0, 3)}</span>)}
              </div>
              <div className="calendar-month-grid">
                {monthGrid.map(({ date, currentMonth, dayNumber }, index) => {
                  const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
                  const dayEvents = (allEvents ?? []).filter((event) => { const d = new Date(event.scheduledAt); return d.getFullYear() === date.getFullYear() && d.getMonth() === date.getMonth() && d.getDate() === dayNumber; });
                  const isToday = date.toDateString() === new Date().toDateString();
                  const isSelected = selectedDate === key;
                  const tone = dayEvents.length > 0 ? (dayEvents.some((e) => e.status === "READY") ? "success" : dayEvents.some((e) => e.status === "SCHEDULED") ? "cyan" : dayEvents.some((e) => e.status === "CANCELLED") ? "danger" : "neutral") : undefined;
                  return (
                  <button key={index} className={`calendar-day-cell ${!currentMonth ? "calendar-day-other" : ""} ${isToday ? "calendar-day-today" : ""} ${isSelected ? "calendar-day-selected" : ""} ${tone ? `calendar-day-tone-${tone}` : ""}`} onClick={() => { if (dayEvents.length > 0) openEdit(dayEvents[0]); setSelectedDate(isSelected ? null : key); }} aria-label={`${date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "numeric", year: "numeric" })} - ${dayEvents.length} events`}>
                        <span className="calendar-day-number">{dayNumber}</span>
                        <span className="calendar-day-markers">{dayEvents.slice(0, 3).map((event) => <span key={event.id} className={`calendar-day-marker calendar-marker-${event.status.toLowerCase()}`} />)}</span>
                        {dayEvents.length > 0 && <span className="calendar-day-count">{dayEvents.length}</span>}
                        {dayEvents.length > 0 && dayEvents.slice(0, 3).map((event) => <span key={event.id} className="calendar-day-event-title">{event.campaignItemTitle} — {event.releaseTitle}</span>)}
                      </button>
                  );
                })}
              </div>
            </SectionCard>
          </div>

          <div className="approval-panel">
            <SectionCard eyebrow="Needs Approval" title={`Approval Queue ${needsApprovalCount > 0 ? `(${needsApprovalCount})` : ""}`} actions={<Button variant="ghost" onClick={() => setShowApprovalQueue(true)}>View all</Button>}>
              {pendingItems.length === 0 ? <div className="v4-empty"><strong>No items pending</strong><p>Content ready for approval appears here.</p></div> : (
                <div className="approval-list">
                  {pendingItems.map((item) => <button key={item.id} className="approval-row" onClick={() => openPackDrawer(item)}>
                    <span className="approval-item-title">{item.kind}</span>
                    <span className="approval-item-platform">{item.channel ?? "—"}</span>
                    <span className={`approval-item-status`}><StatusBadge label={item.status} tone={draftTone(item.status)} state="default" /></span>
                  </button>)}
                </div>
              )}
            </SectionCard>
          </div>
        </div>

        {view === "list" && !showApprovalQueue ? (
          <div className="calendar-list-view">
            {shown.length === 0 ? <SectionCard className="calendar-empty"><div className="v4-empty"><strong>No scheduled promo content for this view.</strong><span>Approved content appears here after it receives a ScheduleEvent.</span></div></SectionCard> : (
              <div className="calendar-list-stack">
                {Object.entries(grouped).map(([day, dayEvents]) => <SectionCard key={day} className="calendar-day"><header><span className="eyebrow">Scheduled day</span><h2>{day}</h2><span className="calendar-day-count">{dayEvents.length} item{dayEvents.length === 1 ? "" : "s"}</span></header><div className="calendar-event-stack">{dayEvents.map((event) => <button key={event.id} className={`calendar-event calendar-event-${event.status.toLowerCase()}`} onClick={() => openEdit(event)}><span className="calendar-event-time">{formatDateTime(event.scheduledAt, event.timezone)}</span><strong>{event.campaignItemTitle}</strong><span className="calendar-event-meta">{`${event.platform} · ${event.releaseTitle}`}</span><StatusBadge label={event.status} tone={statusTone(event.status)} /></button>)}</div></SectionCard>)}
              </div>
            )}
          </div>
        ) : null}

        {showApprovalQueue ? (
          <div className="approval-queue-view">
            <SectionCard eyebrow="Approval Queue" title="All items requiring review">
              {pendingItems.length === 0 ? <div className="v4-empty"><strong>No items pending approval</strong><p>Content ready for review appears here.</p></div> : (
                <div className="approval-queue-list">
                  {pendingItems.map((item) => <article key={item.id} className="approval-queue-row" onClick={() => openPackDrawer(item)}>
                    <span className="approval-item-title">{item.kind}</span>
                    <span className="approval-item-platform">{item.channel ?? "—"}</span>
                    <span className="approval-item-status"><StatusBadge label={item.status} tone={draftTone(item.status)} /></span>
                  </article>)}
                </div>
              )}
            </SectionCard>
          </div>
        ) : null}

        {message ? <p className="calendar-message" role="status">{message}</p> : null}
        {loading ? <SectionCard className="calendar-empty"><div className="v4-empty">Loading calendar...</div></SectionCard> : null}

        <Modal open={Boolean(editing)} title="Schedule details" description={editing ? `${editing.releaseTitle} · ${editing.campaignItemTitle}` : undefined} onClose={() => setEditing(null)}>
          {editing ? <div className="calendar-editor"><SectionCard><div className="calendar-editor-badges"><StatusBadge label={editing.status} tone={statusTone(editing.status)} state="active" /><StatusBadge label={editing.platform} tone="purple" /></div><Select label="Platform" value={editPlatform} options={platforms.map((platform) => ({ value: platform, label: platform }))} onChange={(event) => setEditPlatform(event.target.value as CampaignChannel)} /><Input label="Date and time" type="datetime-local" value={editTime} onChange={(event) => setEditTime(event.target.value)} /><Select label="Status" value={editStatus} options={scheduleStatuses.map((status) => ({ value: status, label: status }))} onChange={(event) => setEditStatus(event.target.value as ScheduleEventStatus)} /><div className="calendar-queue-state">{editing.publishingQueueId ? <p><strong>In Publishing Queue</strong> · {editing.publishingQueueId.slice(0, 8)} · queued {editing.queuedAt ? formatDateTime(editing.queuedAt, editing.timezone) : "now"}</p> : editing.status === "READY" && !queueSupportedPlatforms.has(editing.platform) ? <p>{editing.platform} publishing is not available yet.</p> : null}</div><div className="calendar-editor-actions"><Button disabled={!editTime} onClick={() => void saveEdit()}>Save schedule</Button>{editing.status === "READY" && !editing.publishingQueueId && queueSupportedPlatforms.has(editing.platform) ? <Button variant="secondary" disabled={queueing} onClick={() => void sendToPublishingQueue(editing)}>{queueing ? "Sending..." : "Send to Publishing Queue"}</Button> : null}<Button variant="ghost" onClick={() => void cancelEvent(editing)}>Cancel schedule</Button><Button variant="ghost" onClick={() => setEditing(null)}>Close</Button></div></SectionCard></div> : null}
        </Modal>

        <Modal open={Boolean(drawerEvent || drawerPackItem)} title="Content details" description={drawerEvent ? `${drawerEvent.releaseTitle} · ${drawerEvent.campaignItemTitle}` : drawerPackItem ? `${drawerPackItem.releaseTitle} · ${drawerPackItem.kind}` : undefined} onClose={() => { setDrawerEvent(null); setDrawerPackItem(null); }}>
          {drawerEvent ? <div className="calendar-editor"><SectionCard><div className="calendar-editor-badges"><StatusBadge label={drawerEvent.status} tone={statusTone(drawerEvent.status)} state="active" /><StatusBadge label={drawerEvent.platform} tone="purple" /></div><p><strong>Release:</strong> {drawerEvent.releaseTitle}</p><p><strong>Scheduled:</strong> {formatDateTime(drawerEvent.scheduledAt, drawerEvent.timezone)}</p><p><strong>Timezone:</strong> {drawerEvent.timezone}</p><p><strong>Campaign Item:</strong> {drawerEvent.campaignItemTitle}</p></SectionCard></div> : drawerPackItem ? <div className="calendar-editor"><SectionCard><div className="calendar-editor-badges"><StatusBadge label={drawerPackItem.status} tone={draftTone(drawerPackItem.status)} state="active" /><StatusBadge label={drawerPackItem.channel ?? "—"} tone="purple" /></div><p><strong>Release:</strong> {drawerPackItem.releaseTitle}</p><p><strong>Title:</strong> {drawerPackItem.kind}</p><p><strong>Type:</strong> {drawerPackItem.kind}</p><p><strong>Content:</strong> {drawerPackItem.content}</p><p><strong>Created:</strong> {new Date(drawerPackItem.createdAt).toLocaleDateString()}</p></SectionCard></div> : null}
        </Modal>
      </section>
    </div>
  );
}