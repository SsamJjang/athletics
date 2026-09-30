-- =====================================================================
-- GCS Athletics — WHO IS AN ADMIN
--
-- ✏️  EDIT THE LIST BELOW, then paste this whole file into
--     Supabase Studio -> SQL Editor -> Run.
--     (Run schema.sql once before the first time you run this.)
--
-- Admins can create and edit events, notices, sports and athlete
-- spotlights, see sign-up lists, and verify or revoke parent accounts.
--
-- * Capital letters and stray spaces don't matter.
-- * Takes effect immediately — no redeploy, no re-login. Every RLS policy
--   calls public.is_admin(), which reads this list on each request.
-- * Removing someone here removes their admin rights on their next click.
-- * An admin email does not have to be @gcssongdo.co.kr (a coach's personal
--   address works) — they sign in through the Parent tab in that case.
-- =====================================================================

drop function if exists public.admin_emails();

create function public.admin_emails()
returns text[]
language sql
stable
as $fn$
  select array[
    -- ↓↓↓ one address per line, each in single quotes, comma between ↓↓↓
    'choi.jenny@gcssongdo.co.kr',
    'ivonen.mikael@gcssongdo.co.kr',
    '29hahm.joohee@gcssongdo.co.kr',
    '29kim.sunjoong@gcssongdo.co.kr',
    '27kim.yuha@gcssongdo.co.kr',
    '31kim.yuha@gcssongdo.co.kr',
    '27tak.eunjae@gcssongdo.co.kr',
    '27lee.daheun@gcssongdo.co.kr',
    '28an.jiwoo@gcssongdo.co.kr',
    '29kim.jihoo@gcssongdo.co.kr',
    '32kweon.aiden@gcssongdo.co.kr',
    '32joo.yvonne@gcssongdo.co.kr',
    '28gu.hajun@gcssongdo.co.kr'
    -- ↑↑↑ no comma after the last one ↑↑↑
  ]::text[];
$fn$;
