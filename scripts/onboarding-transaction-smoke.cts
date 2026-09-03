/**
 * Exercises real route handlers and PostgreSQL constraints in ONE rolled-back
 * transaction. Auth, mail and post-response effects are mocked. No Clerk user,
 * public listing, sent email or legally operative signature is created.
 * Run with SMOKE_ENV_FILE pointing to a private env file, never commit secrets.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const sharp = require("sharp");
const postgres = require("postgres");
const { drizzle } = require("drizzle-orm/postgres-js");
const { eq } = require("drizzle-orm");
const envFile = process.env.SMOKE_ENV_FILE;
if (!envFile) throw Error("SMOKE_ENV_FILE required");
Object.assign(process.env, require("dotenv").parse(fs.readFileSync(envFile)));
const sql = postgres(process.env.DATABASE_URL, { ssl:"require", prepare:false, max:1 });
const root = path.resolve(__dirname, "..");
const originalLoad = Module._load;
const server = require("next/server");
const schema = require("../src/lib/db/schema");
let txDb, current;
let queued = 0;
const forbiddenFetch = global.fetch;
global.fetch = async () => { throw Error("Outbound HTTP disabled in smoke test"); };
Module._load = function (request, parent, isMain) {
  if (request === "@clerk/nextjs/server") return {
    auth: async () => ({userId:current?.clerkId ?? null}),
    currentUser: async () => current ? ({id:current.clerkId, firstName:"QA", lastName:current.kind,
      primaryEmailAddress:{emailAddress:current.email, verification:{status:"verified"}},
      phoneNumbers:[], imageUrl:null}) : null,
  };
  if (request === "next/server") return {...server, after:()=>{queued++;}};
  let resolved; try { resolved = Module._resolveFilename(request,parent); } catch {}
  if (request === "@/lib/db" || resolved === path.join(root,"src/lib/db/index.ts")) return {db:txDb};
  if (request === "@/lib/email/send" || resolved === path.join(root,"src/lib/email/send.ts")) return {sendEmail:async()=>({}),dataUrlToAttachment:()=>null};
  if (request === "@/lib/push/expo" || resolved === path.join(root,"src/lib/push/expo.ts")) return {sendPushToUser:async()=>({})};
  return originalLoad.call(this,request,parent,isMain);
};
const rollback = new Error("EXPECTED_SMOKE_ROLLBACK");
const checks=[];
const ok=(label)=>{checks.push(label);console.log("PASS",label);};
(async()=>{
 try {
 try {
  await drizzle(sql,{schema}).transaction(async transaction=>{
   txDb=transaction;
   const legal=require("../src/lib/legal");
   const accept=require("../src/app/api/legal/accept/route");
   const nativeAccept=require("../src/app/api/v1/legal/accept/route");
   const artistRoute=require("../src/app/api/auth/register-artist/route");
   const venueRoute=require("../src/app/api/auth/register-venue/route");
   const bookingRoute=require("../src/app/api/booking-requests/[id]/route");
   const copy=require("../src/app/api/legal/accept/[id]/copy/route");
   const signatureImage="data:image/png;base64,"+(await sharp(Buffer.from('<svg width="200" height="80"><rect width="200" height="80" fill="white"/><path d="M10 50 Q40 5 60 50T150 30" fill="none" stroke="black" stroke-width="3"/></svg>')).png().toBuffer()).toString("base64");
   const personas={};
   for(const kind of ["artist","venue","client","admin"]) {
    const id=randomUUID(); const clerkId="qa_rollback_"+id;
    const [row]=await txDb.insert(schema.users).values({clerkId,email:id+"@example.invalid",name:"QA "+kind,role:kind==="admin"?"admin":"user"}).returning();
    personas[kind]={...row,kind};
   }
   const [category]=await txDb.select().from(schema.categories).where(eq(schema.categories.isActive,true)).limit(1);
   const req=(route,body)=>new server.NextRequest("https://epetrecere.md"+route,{method:"POST",headers:{"content-type":"application/json","user-agent":"QA rollback fixture"},body:JSON.stringify(body)});
   const payloads={
    artist:{name:"QA Artist Rollback",phone:"+15555550181",categoryId:category.id,location:"Chișinău",imageUrl:"https://example.invalid/photo.webp",packages:[{hours:2,minutes:0,price:450}]},
    venue:{name:"QA Venue Rollback",phone:"+15555550182",city:"Chișinău",address:"Adresă fictivă pentru test, 1",capacityMin:20,capacityMax:100,imageUrls:["https://example.invalid/hall.webp"]},
   };
   const ids={};
   const acceptanceIds={};
   for(const kind of ["artist","venue"]) {
    current=personas[kind]; const route=kind==="artist"?artistRoute:venueRoute;
    let response=await route.POST(req("/api/auth/register-"+kind,payloads[kind]));
    assert.equal(response.status,409,await response.text()); ok(kind+": registration without contract blocked");
    const body={subjectType:kind,accepted:true,packVersion:legal.LEGAL_PACK_VERSION,signatureName:"QA "+kind,
      signatureImage,locale:"ro",documents:[...(kind==="artist"?legal.PARTNER_REQUIRED_DOCS:legal.VENUE_REQUIRED_DOCS)],
      identity:{partnerType:"individual",legalName:"QA "+kind,idNumber:"ROLLBACK-TEST",legalAddress:"Adresă fictivă, test exclusiv tehnic"}};
    response=await accept.POST(req("/api/legal/accept",body)); assert.equal(response.status,200,await response.text());
    const rows=await txDb.select().from(schema.legalAcceptances).where(eq(schema.legalAcceptances.userId,current.id));
    assert.equal(rows.length,body.documents.length);
    for(const row of rows) assert.equal(row.contentHash,createHash("sha256").update(row.documentBlocks.map(b=>b.text).join("\n")).digest("hex"));
    acceptanceIds[kind]=rows[0].id; ok(kind+": complete immutable snapshot, signature, timestamp and hash saved");
    const nativeBody={...body}; delete nativeBody.packVersion; delete nativeBody.documents; delete nativeBody.accepted;
    response=await nativeAccept.POST(req("/api/v1/legal/accept",nativeBody));
    assert.equal(response.status,legal.LEGAL_PACK_VERSION==="2.0"?200:400); ok(kind+": legacy native submission is pinned to its actual legal version");
    response=await accept.POST(req("/api/legal/accept",{...body,identity:{...body.identity,legalAddress:"Changed party address"}}));
    assert.equal(response.status,409); ok(kind+": signed snapshot cannot be substituted on retry");
    response=await accept.POST(req("/api/legal/accept",body)); assert.equal(response.status,200);
    assert.equal((await txDb.select().from(schema.legalAcceptances).where(eq(schema.legalAcceptances.userId,current.id))).length,rows.length); ok(kind+": signing retry does not duplicate evidence");
    response=await route.POST(req("/api/auth/register-"+kind,payloads[kind])); const result=await response.json();
    assert.equal(response.status,200,JSON.stringify(result));
    ids[kind]=result.artistId??result.venueId;
    const table=kind==="artist"?schema.artists:schema.venues;
    const [profile]=await txDb.select().from(table).where(eq(table.id,ids[kind]));
    assert.equal(profile.isActive,false);
    const linked=await txDb.select().from(schema.legalAcceptances).where(eq(schema.legalAcceptances.userId,current.id));
    assert.ok(linked.every(x=>(kind==="artist"?x.artistId:x.venueId)===ids[kind])); ok(kind+": onboarding saves profile for moderation and links signed documents");
    response=await copy.GET(req("/copy",{}),{params:Promise.resolve({id:String(rows[0].id)})});
    assert.equal(response.status,200); assert.equal(response.headers.get("Cache-Control"),"private, no-store");
    const html=await response.text(); assert.ok(html.includes(rows[0].contentHash)); ok(kind+": owner downloads exact signed copy");
   }
   current=personas.client;
   let response=await copy.GET(req("/copy",{}),{params:Promise.resolve({id:String(acceptanceIds.artist)})});
   assert.equal(response.status,404); ok("client cannot download another account's signed contract");
   current=personas.admin;
   response=await copy.GET(req("/copy",{}),{params:Promise.resolve({id:String(acceptanceIds.artist)})});
   assert.equal(response.status,200);
   const adminNotices=await txDb.select().from(schema.notifications).where(eq(schema.notifications.userId,personas.admin.id));
   assert.ok(adminNotices.filter(n=>n.type==="legal_signed").length>=2); ok("administrator receives both contract notifications and may read signed copies");
   await assert.rejects(txDb.transaction(async savepoint=>{
     await savepoint.update(schema.legalAcceptances).set({signatureName:"Modified"}).where(eq(schema.legalAcceptances.id,acceptanceIds.artist));
   }),e=>e.cause?.code==="42501");
   ok("database itself rejects modification of signature evidence");
   for(const kind of ["artist","venue"]) {
    const [booking]=await txDb.insert(schema.bookingRequests).values({artistId:kind==="artist"?ids.artist:null,venueId:kind==="venue"?ids.venue:null,clientUserId:personas.client.id,clientName:"QA Client",clientPhone:"+15555550183",clientEmail:personas.client.email,eventType:"wedding",eventDate:"2027-09-01",guestCount:100,agreedPrice:450,status:"pending",source:"platform"}).returning();
    const put=async(action,extra={})=>bookingRoute.PUT(req("/api/booking-requests/"+booking.id,{action,...extra}),{params:Promise.resolve({id:String(booking.id)})});
    current=personas.client; response=await put("accept"); assert.equal(response.status,403);
    current=personas[kind]; response=await put("accept",{agreedPrice:450}); assert.equal(response.status,200,await response.text());
    assert.equal((await txDb.select().from(schema.commissions).where(eq(schema.commissions.bookingRequestId,booking.id))).length,0); ok(kind+": vendor offer creates no premature fee");
    current=personas.client; response=await put("client_confirm"); assert.equal(response.status,200,await response.text());
    if(kind==="venue") {
     const [waiting]=await txDb.select().from(schema.bookingRequests).where(eq(schema.bookingRequests.id,booking.id));
     assert.equal(waiting.status,"accepted"); assert.ok(waiting.clientConfirmedAt); assert.equal(waiting.confirmedAt,null);
     assert.equal((await txDb.select().from(schema.commissions).where(eq(schema.commissions.bookingRequestId,booking.id))).length,0);
     response=await put("venue_confirm"); assert.equal(response.status,403);
     current=personas.venue; response=await put("venue_confirm"); assert.equal(response.status,200,await response.text());
    }
    const fees=await txDb.select().from(schema.commissions).where(eq(schema.commissions.bookingRequestId,booking.id));
    assert.equal(fees.length,1); assert.equal(fees[0].amount,kind==="artist"?22.5:200);
    response=await put(kind==="artist"?"client_confirm":"venue_confirm"); assert.equal(response.status,200);
    assert.equal((await txDb.select().from(schema.commissions).where(eq(schema.commissions.bookingRequestId,booking.id))).length,1);
    ok(kind+": bilateral confirmation records exactly one correct fee; retry is safe");
   }
   current=personas.artist;
   const feed=require("../src/app/api/lead-matches/route");
   const unlock=require("../src/app/api/lead-matches/[id]/unlock/route");
   const leadStatus=require("../src/app/api/lead-matches/[id]/status/route");
   const [lead]=await txDb.insert(schema.leads).values({name:"Private Client",phone:"+15555550183",email:"private@example.invalid",message:"Call +15555550183 or private@example.invalid",eventType:"wedding",eventDate:"2027-09-01"}).returning();
   const [match]=await txDb.insert(schema.leadMatches).values({leadId:lead.id,artistId:ids.artist,reasons:["Email private@example.invalid"],status:"matched"}).returning();
   response=await leadStatus.POST(req("/status",{status:"contacted"}),{params:Promise.resolve({id:String(match.id)})});
   assert.equal(response.status,200);
   for(const status of ["matched","seen","unlocked","contacted","won","lost"]) {
    await txDb.update(schema.leadMatches).set({status}).where(eq(schema.leadMatches.id,match.id));
    response=await feed.GET(); assert.equal(response.status,200);
    const body=await response.json(); const item=body.matches.find(m=>m.id===match.id);
    assert.equal(item.lead.phone,null); assert.equal(item.lead.email,null); assert.equal(item.lead.name,"#"+lead.id);
    assert.ok(!JSON.stringify(item).includes("private@example.invalid")); assert.ok(!JSON.stringify(item).includes("+15555550183"));
   }
   ok("every legacy lead status keeps contacts and message/reason prose private");
   response=await unlock.POST(); assert.equal(response.status,410);
   assert.equal((await txDb.select().from(schema.vendorCredits).where(eq(schema.vendorCredits.artistId,ids.artist))).length,0);
   ok("obsolete contact unlock is retired without charging or creating a wallet");
   const {executeTool}=require("../src/lib/ai/tools");
   assert.match(await executeTool("get_leads",{},ids.artist),/not permitted/);
   const aiBookings=JSON.parse(await executeTool("get_my_bookings",{},ids.artist));
   assert.equal(aiBookings.length,1); assert.equal(aiBookings[0].agreedPrice,450);
   assert.equal(aiBookings[0].status,"confirmed_by_client"); assert.equal(aiBookings[0].clientPhone,undefined);
   ok("vendor AI sees current scoped bookings and cannot invoke administrator tools");
   throw rollback;
  });
 } catch(e) { if(e!==rollback) throw e; }
 console.log(JSON.stringify({checks:checks.length,rolledBack:true,externalEffectsSkipped:queued}));
 } finally {Module._load=originalLoad;global.fetch=forbiddenFetch;await sql.end();}
})().catch(e=>{console.error(e);process.exitCode=1;});
