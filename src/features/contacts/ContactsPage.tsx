import { useEffect, useMemo, useState } from "react";
import type { ArtistAlias, ContactChannel, ContactRelationshipStatus, ContactSummary, ContactType, ReleaseSummary, TaskSummary, UpsertContactInput } from "../../../electron/shared/contracts";
import { artists } from "../../data/artists";

const emptyContact: UpsertContactInput = {
  name: "",
  contactType: "artist",
  relationshipStatus: "new",
  artistId: null,
  releaseId: null,
  organization: "",
  email: "",
  phone: "",
  website: "",
  socialHandle: "",
  preferredChannel: "email",
  consent: false,
  notes: "",
  nextFollowUpAt: null,
  createFollowUpTask: false
};

interface ContactsPageProps {
  releases: ReleaseSummary[];
  onTasksChanged?: (tasks: TaskSummary[]) => void;
}

export function ContactsPage({ releases, onTasksChanged }: ContactsPageProps) {
  const [contacts, setContacts] = useState<ContactSummary[]>([]);
  const [contactDraft, setContactDraft] = useState<UpsertContactInput>(emptyContact);
  const [contactQuery, setContactQuery] = useState("");
  const [contactStatusFilter, setContactStatusFilter] = useState<ContactRelationshipStatus | "all">("all");
  const [contactMessage, setContactMessage] = useState("");
  const [interactionSummary, setInteractionSummary] = useState("");
  const [interactionChannel, setInteractionChannel] = useState<ContactChannel | "meeting">("email");
  const [interactionDirection, setInteractionDirection] = useState<"outbound" | "inbound" | "note">("note");

  useEffect(() => {
    if (!window.studio) return;
    void window.studio.listContacts().then(setContacts).catch((error) => setContactMessage(error instanceof Error ? error.message : "Could not load contacts"));
  }, []);

  const visibleContacts = useMemo(() => contacts.filter((contact) =>
    (contactStatusFilter === "all" || contact.relationshipStatus === contactStatusFilter) &&
    (!contactQuery.trim() || `${contact.name} ${contact.organization ?? ""} ${contact.email ?? ""} ${contact.socialHandle ?? ""}`.toLowerCase().includes(contactQuery.trim().toLowerCase()))
  ), [contacts, contactQuery, contactStatusFilter]);
  const selectedContact = contacts.find((contact) => contact.id === contactDraft.id);

  async function saveContact() {
    if (!window.studio) return;
    setContactMessage("Saving contact...");
    try {
      const saved = await window.studio.saveContact(contactDraft);
      setContacts(await window.studio.listContacts());
      setContactDraft({
        ...emptyContact,
        id: saved.id,
        name: saved.name,
        contactType: saved.contactType,
        relationshipStatus: saved.relationshipStatus,
        artistId: saved.artistId,
        releaseId: saved.releaseId,
        organization: saved.organization ?? "",
        email: saved.email ?? "",
        phone: saved.phone ?? "",
        website: saved.website ?? "",
        socialHandle: saved.socialHandle ?? "",
        preferredChannel: saved.preferredChannel,
        consent: saved.consent,
        notes: saved.notes,
        nextFollowUpAt: saved.nextFollowUpAt,
        createFollowUpTask: false
      });
      setContactMessage(`Saved ${saved.name}.`);
      onTasksChanged?.(await window.studio.listTasks());
    } catch (error) {
      setContactMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Could not save contact");
    }
  }

  function editContact(contact: ContactSummary) {
    setContactDraft({
      id: contact.id,
      name: contact.name,
      contactType: contact.contactType,
      relationshipStatus: contact.relationshipStatus,
      artistId: contact.artistId,
      releaseId: contact.releaseId,
      organization: contact.organization ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      website: contact.website ?? "",
      socialHandle: contact.socialHandle ?? "",
      preferredChannel: contact.preferredChannel,
      consent: contact.consent,
      notes: contact.notes,
      nextFollowUpAt: contact.nextFollowUpAt,
      createFollowUpTask: false
    });
    setInteractionSummary("");
  }

  async function removeContact(id: string) {
    if (!window.studio || !window.confirm("Delete this contact and its interaction history?")) return;
    await window.studio.deleteContact(id);
    setContacts(await window.studio.listContacts());
    if (contactDraft.id === id) setContactDraft(emptyContact);
  }

  async function addContactInteraction() {
    if (!window.studio || !contactDraft.id || !interactionSummary.trim()) return;
    const updated = await window.studio.addContactInteraction({
      contactId: contactDraft.id,
      channel: interactionChannel,
      direction: interactionDirection,
      summary: interactionSummary,
      occurredAt: new Date().toISOString()
    });
    setContacts(await window.studio.listContacts());
    editContact(updated);
    setInteractionSummary("");
    setContactMessage("Interaction added to history.");
  }

  return <div className="page-content crm-page">
    <header><div><span className="eyebrow">Contacts & CRM V1</span><h1>Relationships move releases forward.</h1><p>Local contact database for collaborators, labels, promoters, press and playlist curators.</p></div></header>
    <div className="crm-toolbar">
      <input placeholder="Search name, organization, email or handle..." value={contactQuery} onChange={(event) => setContactQuery(event.target.value)} />
      <select value={contactStatusFilter} onChange={(event) => setContactStatusFilter(event.target.value as ContactRelationshipStatus | "all")}><option value="all">All relationship statuses</option>{(["new", "to-contact", "contacted", "conversation", "collaboration", "declined", "inactive"] as ContactRelationshipStatus[]).map((status) => <option key={status}>{status}</option>)}</select>
      <button className="primary" onClick={() => { setContactDraft(emptyContact); setInteractionSummary(""); setContactMessage(""); }}>+ New contact</button>
    </div>
    <div className="crm-layout">
      <section className="panel crm-list">{visibleContacts.map((contact) => <article className={contactDraft.id === contact.id ? "selected" : ""} key={contact.id} onClick={() => editContact(contact)}><div><strong>{contact.name}</strong><span>{contact.relationshipStatus}</span></div><p>{contact.organization || contact.contactType} · {contact.artistName ?? "All aliases"}</p><small>{contact.email || contact.socialHandle || contact.phone || "No contact channel entered"}</small>{contact.nextFollowUpAt && <em>FOLLOW UP · {new Date(contact.nextFollowUpAt).toLocaleString()}</em>}</article>)}{visibleContacts.length === 0 && <div className="analytics-empty">No contacts match this filter.</div>}</section>
      <section className="panel crm-editor">
        <div className="crm-editor-heading"><div><span className="eyebrow">{contactDraft.id ? "Edit relationship" : "New relationship"}</span><h2>{contactDraft.name || "Contact details"}</h2></div>{contactDraft.id && <button className="danger-button" onClick={() => void removeContact(contactDraft.id!)}>Delete</button>}</div>
        <div className="crm-form-grid">
          <label>Name<input value={contactDraft.name} onChange={(event) => setContactDraft({ ...contactDraft, name: event.target.value })} /></label>
          <label>Organization<input value={contactDraft.organization} onChange={(event) => setContactDraft({ ...contactDraft, organization: event.target.value })} /></label>
          <label>Contact type<select value={contactDraft.contactType} onChange={(event) => setContactDraft({ ...contactDraft, contactType: event.target.value as ContactType })}>{(["artist", "vocalist", "producer", "label", "promoter", "playlist-curator", "press", "other"] as ContactType[]).map((type) => <option key={type}>{type}</option>)}</select></label>
          <label>Relationship status<select value={contactDraft.relationshipStatus} onChange={(event) => setContactDraft({ ...contactDraft, relationshipStatus: event.target.value as ContactRelationshipStatus })}>{(["new", "to-contact", "contacted", "conversation", "collaboration", "declined", "inactive"] as ContactRelationshipStatus[]).map((status) => <option key={status}>{status}</option>)}</select></label>
          <label>Artist alias<select value={contactDraft.artistId ?? ""} onChange={(event) => setContactDraft({ ...contactDraft, artistId: (event.target.value || null) as ArtistAlias | null, releaseId: null })}><option value="">All / unassigned</option>{artists.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select></label>
          <label>Related release<select value={contactDraft.releaseId ?? ""} onChange={(event) => setContactDraft({ ...contactDraft, releaseId: event.target.value || null })}><option value="">No release</option>{releases.filter((release) => !contactDraft.artistId || release.artistId === contactDraft.artistId).map((release) => <option value={release.id} key={release.id}>{release.title} · {release.artistName}</option>)}</select></label>
          <label>Email<input type="email" value={contactDraft.email} onChange={(event) => setContactDraft({ ...contactDraft, email: event.target.value })} /></label>
          <label>Phone<input value={contactDraft.phone} onChange={(event) => setContactDraft({ ...contactDraft, phone: event.target.value })} /></label>
          <label>Website<input value={contactDraft.website} onChange={(event) => setContactDraft({ ...contactDraft, website: event.target.value })} /></label>
          <label>Social handle<input value={contactDraft.socialHandle} onChange={(event) => setContactDraft({ ...contactDraft, socialHandle: event.target.value })} /></label>
          <label>Preferred channel<select value={contactDraft.preferredChannel} onChange={(event) => setContactDraft({ ...contactDraft, preferredChannel: event.target.value as ContactChannel })}>{(["email", "instagram", "tiktok", "soundcloud", "phone", "other"] as ContactChannel[]).map((channel) => <option key={channel}>{channel}</option>)}</select></label>
          <label>Next follow-up<input type="datetime-local" value={contactDraft.nextFollowUpAt?.slice(0, 16) ?? ""} onChange={(event) => setContactDraft({ ...contactDraft, nextFollowUpAt: event.target.value || null, createFollowUpTask: event.target.value ? contactDraft.createFollowUpTask : false })} /></label>
          <label className="crm-consent"><input type="checkbox" checked={contactDraft.consent} onChange={(event) => setContactDraft({ ...contactDraft, consent: event.target.checked })} /> Consent to continued contact recorded</label>
          <label className="crm-consent"><input type="checkbox" disabled={!contactDraft.nextFollowUpAt || !contactDraft.releaseId} checked={Boolean(contactDraft.createFollowUpTask)} onChange={(event) => setContactDraft({ ...contactDraft, createFollowUpTask: event.target.checked })} /> Create task for this follow-up</label>
          <label className="wide">Notes<textarea rows={4} value={contactDraft.notes} onChange={(event) => setContactDraft({ ...contactDraft, notes: event.target.value })} /></label>
        </div>
        <div className="crm-actions"><p>{contactMessage || "Information stays in the local SQLite database."}</p><button className="primary" disabled={!contactDraft.name.trim()} onClick={() => void saveContact()}>Save contact</button></div>
        {contactDraft.id && <><div className="interaction-editor"><select value={interactionDirection} onChange={(event) => setInteractionDirection(event.target.value as typeof interactionDirection)}><option value="note">Internal note</option><option value="outbound">Outgoing</option><option value="inbound">Incoming</option></select><select value={interactionChannel} onChange={(event) => setInteractionChannel(event.target.value as typeof interactionChannel)}>{(["email", "instagram", "tiktok", "soundcloud", "phone", "meeting", "other"] as const).map((channel) => <option key={channel}>{channel}</option>)}</select><input placeholder="What happened?" value={interactionSummary} onChange={(event) => setInteractionSummary(event.target.value)} /><button disabled={!interactionSummary.trim()} onClick={() => void addContactInteraction()}>Add history</button></div><div className="interaction-history">{selectedContact?.interactions.map((interaction) => <article key={interaction.id}><div><strong>{interaction.direction.toUpperCase()} · {interaction.channel}</strong><small>{new Date(interaction.occurredAt).toLocaleString()}</small></div><p>{interaction.summary}</p></article>)}{selectedContact?.interactions.length === 0 && <div className="analytics-empty">No interaction history yet.</div>}</div></>}
      </section>
    </div>
  </div>;
}
