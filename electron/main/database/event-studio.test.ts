import assert from "node:assert/strict"; import { mkdtempSync, rmSync } from "node:fs"; import os from "node:os"; import path from "node:path"; import test from "node:test"; import { StudioDatabase } from "./database.js";
test("Event Studio persists CRUD, lineup, assets and approved calendar milestones",()=>{const directory=mkdtempSync(path.join(os.tmpdir(),"mam-events-")),file=path.join(directory,"studio.sqlite");let database=new StudioDatabase(file);try{database.initialize();const event=database.saveEvent({kind:"ORGANIZER",name:"Sonic Ark Night",status:"PLANNED",date:"2026-10-24",doorsTime:"20:00",startTime:"22:00",endTime:"05:00",timezone:"Europe/Berlin",venue:"Club Test",address:"Teststrasse 1",genre:"Psytrance",description:"Technical event test",ticketUrl:"https://example.test/tickets",eventUrl:null,socialLinks:["https://example.test/event"],organizer:"Sonic Ark Records",lineup:[{artistName:"The Arkadiusz",performanceStart:"23:00",performanceEnd:"00:30"}]});assert.equal(event.lineup[0]?.artistName,"The Arkadiusz");const asset=database.attachEventAsset({eventId:event.id,kind:"POSTER",filePath:path.join(directory,"poster.png"),fileName:"poster.png",mimeType:"image/png",metadata:{ratio:"4:5"}});assert.equal(database.getEvent(event.id)?.assets[0]?.id,asset.id);const milestone=database.saveEventCampaignItem({eventId:event.id,title:"Event announcement",contentType:"EVENT_ANNOUNCEMENT",language:"de",platform:"Facebook",tone:"direct",content:"Confirmed facts only",scheduledAt:"2026-09-12T18:00:00.000Z",status:"REVIEW"});assert.equal(database.updateEventCampaignItem(milestone.id,{status:"APPROVED"}).status,"APPROVED");database.close();database=new StudioDatabase(file);database.initialize();assert.equal(database.getEvent(event.id)?.venue,"Club Test");assert.equal(database.listEventCampaignItems(event.id)[0]?.status,"APPROVED");database.deleteEvent(event.id);assert.equal(database.listEvents().length,0);}finally{database.close();rmSync(directory,{recursive:true,force:true});}});
test("Event Studio rejects invalid dates, timezone, URLs and lineup",()=>{const directory=mkdtempSync(path.join(os.tmpdir(),"mam-events-invalid-")),database=new StudioDatabase(path.join(directory,"studio.sqlite"));try{database.initialize();const base={kind:"GUEST_APPEARANCE" as const,name:"Appearance",status:"DRAFT" as const,date:"2026-10-24",timezone:"Europe/Berlin",venue:"Venue"};assert.throws(()=>database.saveEvent({...base,date:"24-10-2026"}),/Invalid event date/);assert.throws(()=>database.saveEvent({...base,timezone:"Mars\/Base"}),/Invalid schedule timezone/);assert.throws(()=>database.saveEvent({...base,ticketUrl:"javascript:alert(1)"}),/http or https/);assert.throws(()=>database.saveEvent({...base,lineup:[{artistName:""}]}),/artist name/);}finally{database.close();rmSync(directory,{recursive:true,force:true});}});

test("approved Event Studio content enters the shared Publishing Queue with source identity",()=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),"mam-event-queue-")),file=path.join(directory,"studio.sqlite");
  let database=new StudioDatabase(file);
  try{
    database.initialize();
    const event=database.saveEvent({kind:"ORGANIZER",name:"Sonic Ark Night",status:"ANNOUNCED",date:"2026-10-24",timezone:"Europe/Berlin",venue:"Club Test"});
    const approved=database.saveEventCampaignItem({eventId:event.id,title:"Event announcement",contentType:"EVENT_ANNOUNCEMENT",language:"en",platform:"Facebook",tone:"direct",content:"Facts only",scheduledAt:"2026-10-20T18:00:00.000Z",status:"APPROVED"});
    const queued=database.enqueueEventCampaignItem(approved.id);
    assert.equal(queued.sourceType,"event");
    assert.equal(queued.sourceId,event.id);
    assert.equal(queued.sourceTitle,"Sonic Ark Night");
    assert.equal(queued.releaseId,null);
    assert.equal(queued.eventCampaignItemId,approved.id);
    assert.equal(database.listEventCampaignItems(event.id)[0]?.publishingQueueId,queued.id);
    assert.throws(()=>database.enqueueEventCampaignItem(approved.id),/already in the publishing queue/);
    assert.equal(database.reviewPublishingQueueItem({id:queued.id,action:"APPROVE",actor:"tester"}).status,"approved");
    assert.equal(database.reviewPublishingQueueItem({id:queued.id,action:"SCHEDULE",actor:"tester"}).status,"scheduled");
    database.updateEventCampaignItem(approved.id,{status:"REJECTED"});
    assert.throws(()=>database.getPublishingExportData(queued.id),/no longer approved/);
    database.updateEventCampaignItem(approved.id,{status:"APPROVED"});
    database.close();database=new StudioDatabase(file);database.initialize();
    assert.equal(database.getPublishingQueueItem(queued.id)?.sourceTitle,"Sonic Ark Night");
  }finally{database.close();rmSync(directory,{recursive:true,force:true});}
});

test("event queue rejects missing, unapproved and unsupported sources",()=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),"mam-event-queue-invalid-")),database=new StudioDatabase(path.join(directory,"studio.sqlite"));
  try{
    database.initialize();
    assert.throws(()=>database.enqueueEventCampaignItem("missing"),/not found/);
    const event=database.saveEvent({kind:"GUEST_APPEARANCE",name:"Guest set",status:"PLANNED",date:"2026-11-01",timezone:"Europe/Berlin",venue:"Club"});
    const review=database.saveEventCampaignItem({eventId:event.id,title:"Review",contentType:"ARTIST_ANNOUNCEMENT",language:"de",platform:"Facebook",tone:"clear",content:"Copy",scheduledAt:"2026-10-25T18:00:00.000Z",status:"REVIEW"});
    assert.throws(()=>database.enqueueEventCampaignItem(review.id),/Approve the event campaign item/);
    const unsupported=database.saveEventCampaignItem({eventId:event.id,title:"TikTok",contentType:"COUNTDOWN",language:"de",platform:"TikTok",tone:"clear",content:"Copy",scheduledAt:"2026-10-31T18:00:00.000Z",status:"APPROVED"});
    assert.throws(()=>database.enqueueEventCampaignItem(unsupported.id),/not supported by publishing yet/);
  }finally{database.close();rmSync(directory,{recursive:true,force:true});}
});
