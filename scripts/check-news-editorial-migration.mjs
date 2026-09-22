import { pathToFileURL } from 'node:url';
if (!process.argv[2]) throw new Error('Pass the absolute path to a separately installed PGlite dist/index.js');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create table public.news_articles (
 id uuid primary key, slug text, status text default 'pending', publication_status text default 'processing',
 duplicate_of uuid, published_manually boolean not null default false, published_at timestamptz,
 ai_title_ru text, ai_summary_ru text, ai_summary_long_ru text, ai_highlights_ru text[],
 ai_model text, ai_processed_at timestamptz, updated_at timestamptz default now(),
 duplicate_relation text, duplicate_confidence numeric, duplicate_reason text,
 dedup_status text, dedup_checked_at timestamptz, raw_payload jsonb, manual_published_at timestamptz, manual_published_by uuid);
create table public.tags (id uuid default gen_random_uuid() primary key,type text,slug text unique,name text);
create table public.news_article_tags (article_id uuid,tag_id uuid,confidence numeric,method text,primary key(article_id,tag_id));
grant select,insert,update,delete on public.news_articles to service_role;
grant select on public.news_articles to anon,authenticated;
`);
const oldMigration=readFileSync(new URL('../supabase/migrations/20260914115411_harden_admin_operations.sql', import.meta.url),'utf8');
await db.exec(oldMigration.slice(oldMigration.indexOf('create or replace function public.admin_save_news_article('),oldMigration.indexOf('create or replace function public.admin_moderate_social_post(')));
await db.exec(readFileSync(new URL('../supabase/migrations/20260922104144_news_editorial_verification.sql', import.meta.url),'utf8'));
const a='00000000-0000-0000-0000-000000000001', b='00000000-0000-0000-0000-000000000002';
await db.query(`insert into news_articles(id,slug,ai_title_ru,ai_summary_ru,ai_summary_long_ru) values ($1,'stable-url','Title','Summary','Body'),($2,'incoming',null,null,null)`,[a,b]);
await assert.rejects(db.query(`update news_articles set publication_status='published' where id=$1`,[a]),/news_editorial_verification_required/);
const source = { sources: [{article_id:a,url:'https://one.test',name:'First',authors:[]},{article_id:b,url:'https://two.test',name:'Second',authors:[]}] };
async function review(title,body='Body') {
 return (await db.query(`insert into news_editorial_reviews(article_id,decision,source_hash,source_snapshot,context_snapshot,attempts)
 values ($1,'PASS','hash',$2,'{}',$3) returning id`,[a,JSON.stringify(source),JSON.stringify([{draft:{title_ru:title,summary_ru:'Summary',details_ru:body}}])])).rows[0].id;
}
await review('Title');
await db.query(`update news_articles set publication_status='published',status='processed',published_at='2026-09-20',editorial_meta='{"version":1,"status":"passed"}' where id=$1`,[a]);
await assert.rejects(db.query(`update news_articles set ai_title_ru='Fabricated' where id=$1`,[a]),/news_editorial_verification_required/);
const before=(await db.query('select * from news_articles where id=$1',[a])).rows[0];
const reviewId=await review('Updated','More verified details');
const args=[b,a,reviewId,before.updated_at,JSON.stringify({version:1,status:'passed'}),'test-model'];
assert.equal((await db.query('select apply_verified_news_update($1,$2,$3,$4,$5,$6) as merged',args)).rows[0].merged,true);
const after=(await db.query('select * from news_articles where id=$1',[a])).rows[0];
assert.equal(after.slug,before.slug); assert.deepEqual(after.published_at,before.published_at); assert.equal(after.ai_title_ru,'Updated'); assert.ok(after.content_modified_at);
assert.equal((await db.query('select apply_verified_news_update($1,$2,$3,$4,$5,$6) as merged',args)).rows[0].merged,false);
assert.equal((await db.query('select count(*)::int as n from news_article_sources')).rows[0].n,2);
assert.equal((await db.query('select publication_status from news_articles where id=$1',[b])).rows[0].publication_status,'duplicate');
await db.exec('set role anon');
assert.equal((await db.query('select count(*)::int as n from news_article_sources')).rows[0].n,2);
await assert.rejects(db.query('select source_snapshot from news_editorial_reviews'),/permission denied/);
await assert.rejects(db.query('select apply_verified_news_update($1,$2,$3,$4,$5,$6)',args),/permission denied/);
await db.exec('reset role');
await db.query("update news_articles set publication_status='draft' where id=$1",[a]);
await db.exec('set role anon');
assert.equal((await db.query('select count(*)::int as n from news_article_sources')).rows[0].n,0);
await db.exec('reset role');
await db.query("update news_articles set publication_status='published',published_manually=true,ai_title_ru='Manual edit' where id=$1",[a]);
await db.query("select admin_save_news_article_editorial($1,'Edited','Lead','Details','published','{}',$1,now(),'opinion',array['Author'])",[a]);
const edited=(await db.query('select * from news_articles where id=$1',[a])).rows[0];
assert.equal(edited.editorial_meta.article_type,'opinion'); assert.deepEqual(edited.editorial_meta.source_authors,['Author']); assert.equal(edited.editorial_meta.status,'manually_reviewed'); assert.equal(edited.slug,'stable-url');
await assert.rejects(db.query("select admin_save_news_article_editorial($1,'Changed','Lead','Body','published','{}',$1,now(),'invented','{}')",[a]),/invalid_news_article_type/);
assert.equal((await db.query('select ai_title_ru from news_articles where id=$1',[a])).rows[0].ai_title_ru,'Edited');
await db.query("select admin_save_news_article_editorial($1,'Edited draft','Lead','Details','draft','{}',$1,now(),'news','{}')",[a]);
const held=(await db.query('select editorial_meta,raw_payload,published_manually from news_articles where id=$1',[a])).rows[0];
assert.equal(held.editorial_meta.status,'review');
assert.equal(held.raw_payload.aiFailureReason,'editorial_review_required');
assert.equal(held.published_manually,false);
await assert.rejects(db.query("update news_articles set publication_status='published' where id=$1",[a]),/news_editorial_verification_required/);
await db.exec('set role anon');
await assert.rejects(db.query("select admin_save_news_article_editorial($1,'Bad','Lead','Details','published','{}',$1,now(),'news','{}')",[a]),/permission denied/);
await db.exec('reset role');
console.log('SQL checks passed: publication gate, verified publication, tamper rejection, atomic merge, stable URL/date, replay protection, source RLS, private provenance, RPC permissions, manual review.');
await db.close();
