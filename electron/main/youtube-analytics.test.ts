import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { analyticsRows, buildCountriesQuery, buildDailyQuery, buildDeviceTypesQuery, buildTopVideosQuery, buildTrafficSourcesQuery, rangeDates, sanitizedQueryShape, YouTubeAnalyticsService } from "./youtube-analytics.js";
import { sanitizeYouTubeError } from "./youtube-oauth.js";
test("Analytics maps rows by column headers and accepts missing rows",()=>{const rows=analyticsRows({columnHeaders:[{name:"views"},{name:"day"}],rows:[[12,"2026-09-01"]]},r=>({day:r.day,views:r.views}));assert.deepEqual(rows,[{day:"2026-09-01",views:12}]);assert.deepEqual(analyticsRows({columnHeaders:[]},r=>r),[])});
test("Analytics date ranges support 7, 28, and 90 days",()=>{const now=new Date("2026-09-18T12:00:00Z");assert.equal(rangeDates("7d",now).startDate,"2026-09-11");assert.equal(rangeDates("28d",now).startDate,"2026-08-21");assert.equal(rangeDates("90d",now).startDate,"2026-06-20")});
test("Daily query uses supported combination",()=>{const q=buildDailyQuery("7d");assert.equal(q.dimensions,"day");assert.equal(q.metrics,"views,estimatedMinutesWatched,averageViewDuration,likes,comments");assert.equal(q.sort,undefined);});
test("Top videos query uses supported combination with maxResults",()=>{const q=buildTopVideosQuery("28d");assert.equal(q.dimensions,"video");assert.equal(q.metrics,"views,estimatedMinutesWatched,averageViewDuration,likes,comments");assert.equal(q.sort,"-views");assert.equal(q.maxResults,200);});
test("Traffic sources query uses supported combination",()=>{const q=buildTrafficSourcesQuery("7d");assert.equal(q.dimensions,"insightTrafficSourceType");assert.equal(q.metrics,"views,estimatedMinutesWatched");assert.equal(q.sort,"-views");});
test("Device types query uses supported combination",()=>{const q=buildDeviceTypesQuery("7d");assert.equal(q.dimensions,"deviceType");assert.equal(q.metrics,"views,estimatedMinutesWatched");assert.equal(q.sort,undefined);});
test("Countries query uses supported combination",()=>{const q=buildCountriesQuery("7d");assert.equal(q.dimensions,"country");assert.equal(q.metrics,"views");assert.equal(q.sort,"-views");});
test("Sanitized query shape omits tokens and filters",()=>{const shape=sanitizedQueryShape({dimensions:"day",metrics:"views",sort:"-views",maxResults:200,startDate:"2026-09-01",endDate:"2026-09-07"});assert.deepEqual(shape,{dimensions:"day",metrics:"views",sort:"-views",maxResults:200,startDate:"2026-09-01",endDate:"2026-09-07"}); const withToken=sanitizeYouTubeError("Bearer abc access_token=secret"); assert.ok(!withToken.includes("secret"));});
test("Partial failure does not kill entire sync and preserves prior snapshot",async()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),"yt-analytics-"));
  const token=async()=>"fake-token";
  const channelData={channelId:"UC123", videos:[{videoId:"vid1",title:"A",thumbnails:{medium:{url:"http://img"}} } as any, {videoId:"vid2",title:"B",thumbnails:{} as any}] } as any;
  const dataProvider=async()=>channelData;
  const svc=new YouTubeAnalyticsService(dir,token,dataProvider);
  const originalFetch=global.fetch;
  (global as any).fetch=async(url:string)=>{
    const u=new URL(url);
    const dim=u.searchParams.get("dimensions");
    const metrics=u.searchParams.get("metrics") ?? "";
    if(dim==="country"){
      return { ok:false, status:400, text:async()=>"The query is not supported." } as any;
    }
    const headersFor=(dim:string)=>{
      if(dim==="day") return [{name:"day"},{name:"views"},{name:"estimatedMinutesWatched"},{name:"averageViewDuration"},{name:"likes"},{name:"comments"}];
      if(dim==="video") return [{name:"video"},{name:"views"},{name:"estimatedMinutesWatched"},{name:"averageViewDuration"},{name:"likes"},{name:"comments"}];
      if(dim==="insightTrafficSourceType") return [{name:"insightTrafficSourceType"},{name:"views"},{name:"estimatedMinutesWatched"}];
      if(dim==="deviceType") return [{name:"deviceType"},{name:"views"},{name:"estimatedMinutesWatched"}];
      return [];
    };
    const rowsFor=(dim:string)=>{
      if(dim==="day") return [["2026-09-01",10,20,30,1,2]];
      if(dim==="video") return [["vid1",5,10,15,3,1]];
      if(dim==="insightTrafficSourceType") return [["SEARCH",7,14]];
      if(dim==="deviceType") return [["MOBILE",8,16]];
      return [];
    };
    return { ok:true, status:200, text:async()=>JSON.stringify({columnHeaders:headersFor(dim!),rows:rowsFor(dim!)}), json:async()=>({columnHeaders:headersFor(dim!),rows:rowsFor(dim!)}) } as any;
  };
  try{
    const first=await svc.syncAnalytics("7d");
    assert.equal(first.ok,false);
    assert.ok(first.sanitizedError?.includes("countries unavailable") || first.sanitizedError?.includes("country"));
    assert.ok(first.snapshot);
    assert.equal(first.snapshot!.timeSeries.length,1);
    assert.equal(first.snapshot!.videos.length,2);
    const v1=first.snapshot!.videos.find(v=>v.videoId==="vid1")!;
    assert.equal(v1.likes,3);
    assert.equal(v1.likesSource,"analytics-period");
    assert.equal(v1.comments,1);
    assert.equal(v1.commentsSource,"analytics-period");
    const v2=first.snapshot!.videos.find(v=>v.videoId==="vid2")!;
    assert.equal(v2.title,"B");
    assert.equal(v2.likes,null);
    assert.equal(v2.likesSource,null);
    assert.equal(v2.comments,null);
    assert.equal(v2.commentsSource,null);
    assert.equal(first.snapshot!.countries.length,0);
    const second=await svc.syncAnalytics("7d");
    assert.equal(second.snapshot?.timeSeries.length,1);
  } finally { (global as any).fetch=originalFetch; rmSync(dir,{recursive:true,force:true}); }
});
test("Failed unsupported sub-query not killing entire sync yields partial snapshot with sanitized error",async()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),"yt-analytics2-"));
  const token=async()=>"tok";
  const dataProvider=async()=>({channelId:"UC999", videos:[]} as any);
  const svc=new YouTubeAnalyticsService(dir,token,dataProvider);
  const orig=global.fetch;
  (global as any).fetch=async(url:string)=>{
    const dim=new URL(url).searchParams.get("dimensions");
    if(dim==="deviceType") return { ok:false, status:400, text:async()=>"The query is not supported. countries"} as any;
    const h=(dim:string)=>{
      if(dim==="day") return [{name:"day"},{name:"views"},{name:"estimatedMinutesWatched"},{name:"averageViewDuration"},{name:"likes"},{name:"comments"}];
      if(dim==="video") return [{name:"video"},{name:"views"},{name:"estimatedMinutesWatched"},{name:"averageViewDuration"},{name:"likes"},{name:"comments"}];
      if(dim==="insightTrafficSourceType") return [{name:"insightTrafficSourceType"},{name:"views"},{name:"estimatedMinutesWatched"}];
      if(dim==="country") return [{name:"country"},{name:"views"}];
      return [];
    };
    return { ok:true, status:200, text:async()=>JSON.stringify({columnHeaders:h(dim!),rows:[]}), json:async()=>({columnHeaders:h(dim!),rows:[]}) } as any;
  };
  try{
    const res=await svc.syncAnalytics("28d");
    assert.ok(!res.ok || res.sanitizedError?.includes("devices unavailable") || res.sanitizedError?.includes("deviceType"));
    assert.ok(res.snapshot);
  } finally { (global as any).fetch=orig; rmSync(dir,{recursive:true,force:true}); }
});
test("Top videos query sends maxResults=200 and all metrics in one request",async()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),"yt-analytics3-"));
  const token=async()=>"tok";
  const dataProvider=async()=>({channelId:"UC333", videos:[{videoId:"v1",title:"Title1",thumbnails:{medium:{url:"http://img1"}}} as any]} as any);
  const svc=new YouTubeAnalyticsService(dir,token,dataProvider);
  const orig=global.fetch;
  const capturedUrls:string[]=[];
  (global as any).fetch=async(url:string)=>{
    capturedUrls.push(url);
    const u=new URL(url);
    const dim=u.searchParams.get("dimensions");
    const h=(dim:string)=>{
      if(dim==="day") return [{name:"day"},{name:"views"},{name:"estimatedMinutesWatched"},{name:"averageViewDuration"},{name:"likes"},{name:"comments"}];
      if(dim==="video") return [{name:"video"},{name:"views"},{name:"estimatedMinutesWatched"},{name:"averageViewDuration"},{name:"likes"},{name:"comments"}];
      if(dim==="insightTrafficSourceType") return [{name:"insightTrafficSourceType"},{name:"views"},{name:"estimatedMinutesWatched"}];
      if(dim==="country") return [{name:"country"},{name:"views"}];
      if(dim==="deviceType") return [{name:"deviceType"},{name:"views"},{name:"estimatedMinutesWatched"}];
      return [];
    };
    const r=(dim:string)=>{
      if(dim==="day") return [["2026-09-01",10,20,30,1,2]];
      if(dim==="video") return [["v1",100,50,60,7,3]];
      return [];
    };
    return { ok:true, status:200, text:async()=>JSON.stringify({columnHeaders:h(dim!),rows:r(dim!)}), json:async()=>({columnHeaders:h(dim!),rows:r(dim!)}) } as any;
  };
  try{
    const res=await svc.syncAnalytics("7d");
    assert.ok(res.snapshot);
    const videoUrl=new URL(capturedUrls.find(u=>u.includes("dimensions=video"))!);
    assert.equal(videoUrl.searchParams.get("maxResults"),"200");
    assert.equal(videoUrl.searchParams.get("sort"),"-views");
    assert.equal(videoUrl.searchParams.get("metrics"),"views,estimatedMinutesWatched,averageViewDuration,likes,comments");
    assert.equal(videoUrl.searchParams.get("ids"),"channel==MINE");
    assert.ok(videoUrl.searchParams.get("startDate"));
    assert.ok(videoUrl.searchParams.get("endDate"));
    const v=res.snapshot!.videos.find((v:any)=>v.videoId==="v1")!;
    assert.equal(v.views,100);
    assert.equal(v.estimatedMinutesWatched,50);
    assert.equal(v.averageViewDuration,60);
    assert.equal(v.likes,7);
    assert.equal(v.likesSource,"analytics-period");
    assert.equal(v.comments,3);
    assert.equal(v.commentsSource,"analytics-period");
  } finally { (global as any).fetch=orig; rmSync(dir,{recursive:true,force:true}); }
});
test("Merge by videoId combines analytics with Phase 1 data API metadata",async()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),"yt-analytics4-"));
  const token=async()=>"tok";
  const dataProvider=async()=>({channelId:"UC444", videos:[
    {videoId:"va",title:"VideoA",thumbnails:{medium:{url:"http://imgA"}}, viewCount:1000, likeCount:50, commentCount:5} as any,
    {videoId:"vb",title:"VideoB",thumbnails:{default:{url:"http://imgB"}}, viewCount:2000, likeCount:80, commentCount:12} as any,
    {videoId:"vc",title:"VideoC",thumbnails:{}, viewCount:500, likeCount:10, commentCount:2} as any,
  ]} as any);
  const svc=new YouTubeAnalyticsService(dir,token,dataProvider);
  const orig=global.fetch;
  (global as any).fetch=async(url:string)=>{
    const dim=new URL(url).searchParams.get("dimensions");
    const h=(dim:string)=>{
      if(dim==="day") return [{name:"day"},{name:"views"},{name:"estimatedMinutesWatched"},{name:"averageViewDuration"},{name:"likes"},{name:"comments"}];
      if(dim==="video") return [{name:"video"},{name:"views"},{name:"estimatedMinutesWatched"},{name:"averageViewDuration"},{name:"likes"},{name:"comments"}];
      if(dim==="insightTrafficSourceType") return [{name:"insightTrafficSourceType"},{name:"views"},{name:"estimatedMinutesWatched"}];
      if(dim==="country") return [{name:"country"},{name:"views"}];
      if(dim==="deviceType") return [{name:"deviceType"},{name:"views"},{name:"estimatedMinutesWatched"}];
      return [];
    };
    const r=(dim:string)=>{
      if(dim==="day") return [];
      if(dim==="video") return [["va",90,45,55,5,1],["vb",70,35,40,null,null]];
      return [];
    };
    return { ok:true, status:200, text:async()=>JSON.stringify({columnHeaders:h(dim!),rows:r(dim!)}), json:async()=>({columnHeaders:h(dim!),rows:r(dim!)}) } as any;
  };
  try{
    const res=await svc.syncAnalytics("7d");
    assert.ok(res.snapshot);
    const vids=res.snapshot!.videos;
    assert.equal(vids.length,3);
    const va=vids.find(v=>v.videoId==="va")!;
    assert.equal(va.title,"VideoA");
    assert.equal(va.thumbnailUrl,"http://imgA");
    assert.equal(va.views,90);
    assert.equal(va.estimatedMinutesWatched,45);
    assert.equal(va.averageViewDuration,55);
    assert.equal(va.likes,5);
    assert.equal(va.likesSource,"analytics-period");
    assert.equal(va.comments,1);
    assert.equal(va.commentsSource,"analytics-period");
    const vb=vids.find(v=>v.videoId==="vb")!;
    assert.equal(vb.title,"VideoB");
    assert.equal(vb.thumbnailUrl,"http://imgB");
    assert.equal(vb.views,70);
    assert.equal(vb.likes,null);
    assert.equal(vb.likesSource,null);
    assert.equal(vb.comments,null);
    assert.equal(vb.commentsSource,null);
    const vc=vids.find(v=>v.videoId==="vc")!;
    assert.equal(vc.title,"VideoC");
    assert.equal(vc.thumbnailUrl,null);
    assert.equal(vc.views,500);
    assert.equal(vc.likes,10);
    assert.equal(vc.likesSource,"data-api-lifetime");
    assert.equal(vc.comments,2);
    assert.equal(vc.commentsSource,"data-api-lifetime");
  } finally { (global as any).fetch=orig; rmSync(dir,{recursive:true,force:true}); }
});
test("No mixing of period and lifetime semantics for likes and comments",async()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),"yt-analytics5-"));
  const token=async()=>"tok";
  const dataProvider=async()=>({channelId:"UC555", videos:[
    {videoId:"vm",title:"Mixed",thumbnails:{}, likeCount:100, commentCount:20} as any,
  ]} as any);
  const svc=new YouTubeAnalyticsService(dir,token,dataProvider);
  const orig=global.fetch;
  (global as any).fetch=async(url:string)=>{
    const dim=new URL(url).searchParams.get("dimensions");
    const h=(dim:string)=>{
      if(dim==="day") return [{name:"day"},{name:"views"},{name:"estimatedMinutesWatched"},{name:"averageViewDuration"},{name:"likes"},{name:"comments"}];
      if(dim==="video") return [{name:"video"},{name:"views"},{name:"estimatedMinutesWatched"},{name:"averageViewDuration"},{name:"likes"},{name:"comments"}];
      if(dim==="insightTrafficSourceType") return [{name:"insightTrafficSourceType"},{name:"views"},{name:"estimatedMinutesWatched"}];
      if(dim==="country") return [{name:"country"},{name:"views"}];
      if(dim==="deviceType") return [{name:"deviceType"},{name:"views"},{name:"estimatedMinutesWatched"}];
      return [];
    };
    const r=(dim:string)=>{
      if(dim==="day") return [];
      if(dim==="video") return [["vm",200,100,80,7,3]];
      return [];
    };
    return { ok:true, status:200, text:async()=>JSON.stringify({columnHeaders:h(dim!),rows:r(dim!)}), json:async()=>({columnHeaders:h(dim!),rows:r(dim!)}) } as any;
  };
  try{
    const res=await svc.syncAnalytics("7d");
    assert.ok(res.snapshot);
    const v=res.snapshot!.videos[0];
    assert.equal(v.videoId,"vm");
    assert.equal(v.views,200);
    assert.equal(v.likes,7);
    assert.equal(v.likesSource,"analytics-period");
    assert.equal(v.comments,3);
    assert.equal(v.commentsSource,"analytics-period");
    assert.notEqual(v.likesSource,"data-api-lifetime");
    assert.notEqual(v.commentsSource,"data-api-lifetime");
  } finally { (global as any).fetch=orig; rmSync(dir,{recursive:true,force:true}); }
});
test("Videos from data API without analytics playback get lifetime labels",async()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),"yt-analytics6-"));
  const token=async()=>"tok";
  const dataProvider=async()=>({channelId:"UC666", videos:[
    {videoId:"vl",title:"Lifetime",thumbnails:{}, viewCount:200, likeCount:200, commentCount:30} as any,
  ]} as any);
  const svc=new YouTubeAnalyticsService(dir,token,dataProvider);
  const orig=global.fetch;
  (global as any).fetch=async(url:string)=>{
    const dim=new URL(url).searchParams.get("dimensions");
    const h=(dim:string)=>{
      if(dim==="day") return [{name:"day"},{name:"views"},{name:"estimatedMinutesWatched"},{name:"averageViewDuration"},{name:"likes"},{name:"comments"}];
      if(dim==="video") return [{name:"video"},{name:"views"},{name:"estimatedMinutesWatched"},{name:"averageViewDuration"},{name:"likes"},{name:"comments"}];
      if(dim==="insightTrafficSourceType") return [{name:"insightTrafficSourceType"},{name:"views"},{name:"estimatedMinutesWatched"}];
      if(dim==="country") return [{name:"country"},{name:"views"}];
      if(dim==="deviceType") return [{name:"deviceType"},{name:"views"},{name:"estimatedMinutesWatched"}];
      return [];
    };
    return { ok:true, status:200, text:async()=>JSON.stringify({columnHeaders:h(dim!),rows:[]}), json:async()=>({columnHeaders:h(dim!),rows:[]}) } as any;
  };
  try{
    const res=await svc.syncAnalytics("7d");
    assert.ok(res.snapshot);
    assert.equal(res.snapshot!.videos.length,1);
    const v=res.snapshot!.videos[0];
    assert.equal(v.videoId,"vl");
    assert.equal(v.title,"Lifetime");
    assert.equal(v.views,200);
    assert.equal(v.likes,200);
    assert.equal(v.likesSource,"data-api-lifetime");
    assert.equal(v.comments,30);
    assert.equal(v.commentsSource,"data-api-lifetime");
  } finally { (global as any).fetch=orig; rmSync(dir,{recursive:true,force:true}); }
});
