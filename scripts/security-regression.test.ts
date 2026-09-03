import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { publicCatalogData } from "../src/lib/privacy/public-catalog";
import { containsContact, redactContact } from "../src/lib/privacy/contact-redaction";
import { contactsAreShared } from "../src/lib/privacy/booking-contact";
import { confirmationTransition } from "../src/lib/booking/confirmation";
import { computeCommission, DEFAULT_RULES } from "../src/lib/commissions/rules";
import { acceptanceSchema, missingCurrentDocuments } from "../src/lib/legal/acceptance";
import { LEGAL_PACK_VERSION, PARTNER_REQUIRED_DOCS, VENUE_REQUIRED_DOCS, getLegalDocument } from "../src/lib/legal";
import { validSignatureImage } from "../src/lib/legal/signature-image";
import { privateLeadSummary } from "../src/lib/privacy/lead-summary";

test("legacy lead summaries never expose identity or contact prose",()=>{
  const summary=privateLeadSummary({id:42,name:"Private Person",phone:"+37369123456",email:"private@example.com",eventType:"wedding",eventDate:"2027-09-01",location:"Chișinău, https://vendor.md",guestCount:100,budget:1000,source:"form",message:"<p>Sună +373 69 123 456 sau private&#64;example.com</p>"});
  assert.equal(summary.name,"#42"); assert.equal(summary.phone,null); assert.equal(summary.email,null);
  assert.equal(containsContact(summary.message!),false); assert.equal(containsContact(summary.location!),false);
  assert.equal(summary.guestCount,100); assert.equal(summary.budget,1000);
});

test("public catalogue removes nested contacts, contact prose and anonymous prices", () => {
  const data = {phone:"+37369123456", userId:"private", descriptionRo:"<p>Scrie la test@example.com, https://vendor.md</p>", packages:[{price:450, includes:"Sună +373 69 123 456", email:"a@b.md"}], images:[{url:"https://cdn.example.com/photo.webp"}]};
  const anon = publicCatalogData(data);
  assert.equal(anon.phone,null); assert.equal(anon.userId,null); assert.equal(anon.packages[0].price,null);
  assert.equal(containsContact(anon.descriptionRo),false); assert.equal(containsContact(anon.packages[0].includes),false);
  assert.equal(anon.images[0].url,data.images[0].url);
  const client = publicCatalogData(data,true);
  assert.equal(client.packages[0].price,450); assert.equal(client.packages[0].email,null);
});
test("redaction handles email, phone, messenger, websites and zero-width evasion",()=>{
  for(const value of ["test@example.com","+373 69 123 456","https://example.md","www.example.md","t.me/person","@contact_name","test\u200b@example.com"]) {
    assert.equal(containsContact(value),true,value);
    assert.equal(containsContact(redactContact(value)),false,value);
  }
  assert.equal(containsContact("Nuntă, 120 invitați, 14:00, buget 1500 EUR"),false);
});
test("contacts stay private until final bilateral confirmation",()=>{
  for(const status of ["pending","accepted","rejected","cancelled"]) assert.equal(contactsAreShared(status),false);
  assert.equal(contactsAreShared("confirmed_by_client"),true);
  assert.equal(contactsAreShared("completed"),true);
});
test("artist and venue use different final confirmation steps",()=>{
  const step=(venue:boolean,action:"accept"|"client_confirm"|"venue_confirm",status="accepted",clientConfirmed=false)=>confirmationTransition({venue,action,status,clientConfirmed});
  assert.equal(step(false,"accept","pending"),"accepted");
  assert.equal(step(false,"client_confirm"),"confirmed_by_client");
  assert.equal(step(true,"client_confirm"),"awaiting_venue");
  assert.equal(step(true,"venue_confirm"),null);
  assert.equal(step(true,"venue_confirm","accepted",true),"confirmed_by_client");
  assert.equal(step(false,"venue_confirm","accepted",true),null);
  assert.equal(step(false,"client_confirm","pending"),null);
});
test("contract fee schedule has inclusive boundaries and exact cents",()=>{
  assert.equal(computeCommission({vendorType:"artist",baseAmount:450},DEFAULT_RULES)?.amount,22.5);
  const fee=(eventType:string,guestCount?:number)=>computeCommission({vendorType:"venue",baseAmount:0,eventType,guestCount},DEFAULT_RULES)?.amount;
  assert.equal(fee("wedding"),200);
  for(const [kind,count,amount] of [["cumatrie",80,100],["cumatrie",81,150],["birthday",40,50],["birthday",41,80],["birthday",80,80],["birthday",81,100],["corporate",80,100],["corporate",81,150],["corporate",150,150],["corporate",151,200],["other",30,50]] as const) assert.equal(fee(kind,count),amount);
  assert.equal(fee("other",31),undefined); assert.equal(fee("birthday"),undefined); assert.equal(fee("birthday",0),undefined);
});
test("onboarding rejects missing, stale, mismatched and incomplete acceptance",()=>{
  const valid={subjectType:"artist",accepted:true,packVersion:LEGAL_PACK_VERSION,signatureName:"QA Partner",signatureImage:"data:image/png;base64,QUJD",locale:"ro",documents:[...PARTNER_REQUIRED_DOCS],identity:{partnerType:"individual",legalName:"QA Partner",idNumber:"TEST1234",legalAddress:"Adresă exclusiv de test"}};
  assert.equal(acceptanceSchema.safeParse(valid).success,true);
  for(const changes of [{accepted:false},{packVersion:"0"},{documents:[]},{signatureImage:""},{signatureName:"Alt Nume"},{documents:[...VENUE_REQUIRED_DOCS]}]) assert.equal(acceptanceSchema.safeParse({...valid,...changes}).success,false);
  assert.equal(missingCurrentDocuments([],"venue").length,VENUE_REQUIRED_DOCS.length);
  const evidence=PARTNER_REQUIRED_DOCS.map(documentSlug=>({documentSlug,documentVersion:getLegalDocument(documentSlug)!.version,packVersion:LEGAL_PACK_VERSION,signatureImage:"fixture",contentHash:"fixture",documentBlocks:[{text:"fixture"}],legalName:"QA Partner",idNumber:"TEST1234",legalAddress:"Test address"}));
  assert.deepEqual(missingCurrentDocuments(evidence,"artist"),[]);
  assert.deepEqual(missingCurrentDocuments(evidence.map(x=>({...x,signatureImage:null})),"artist"),[...PARTNER_REQUIRED_DOCS]);
});
test("signature validation rejects blank and invalid images",async()=>{
  const png=async(color:string)=>"data:image/png;base64,"+(await sharp({create:{width:200,height:80,channels:3,background:color}}).png().toBuffer()).toString("base64");
  assert.equal(await validSignatureImage(await png("white")),false);
  assert.equal(await validSignatureImage(await png("black")),false);
  assert.equal(await validSignatureImage("data:image/png;base64,QUJD"),false);
  const fixture=await sharp(Buffer.from('<svg width="200" height="80"><rect width="200" height="80" fill="white"/><path d="M10 50 Q40 5 60 50T150 30" fill="none" stroke="black" stroke-width="3"/></svg>')).png().toBuffer();
  assert.equal(await validSignatureImage("data:image/png;base64,"+fixture.toString("base64")),true);
});
test("all event-picker images have different contents",()=>{
  const source=readFileSync("src/app/[locale]/(public)/planifica/client.tsx","utf8");
  const paths=[...source.matchAll(/image:\s*"(\/images\/redesign\/event-[^"]+)"/g)].map(m=>m[1]);
  assert.ok(paths.length>=10);
  const hashes=paths.map(p=>createHash("sha256").update(readFileSync("public"+p)).digest("hex"));
  assert.equal(new Set(hashes).size,paths.length);
});
