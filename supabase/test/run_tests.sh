#!/usr/bin/env bash
# Behaviour tests for schema.sql against a local Postgres with the Supabase stub (test/00_stub.sql).
# usage: PGHOST=/tmp PGPORT=5544 PGUSER=pgtest ./run_tests.sh
set -u
export PGOPTIONS='-c client_min_messages=warning'
HOST=${PGHOST:-/tmp}; PORT=${PGPORT:-5544}; USER_=${PGUSER:-pgtest}
ADMIN="psql -h $HOST -p $PORT -U $USER_ -d postgres -q"
DB="psql -h $HOST -p $PORT -U $USER_ -d uni_test -At -q"
DIR="$(cd "$(dirname "$0")" && pwd)"

$ADMIN -c "drop database if exists uni_test" -c "create database uni_test" >/dev/null
$DB -v ON_ERROR_STOP=1 -f "$DIR/00_stub.sql" >/dev/null 2>&1 || { echo "stub failed"; exit 1; }
$DB -v ON_ERROR_STOP=1 -f "$DIR/../schema.sql" >/dev/null 2>/tmp/schema_err.txt || { echo "schema failed"; cat /tmp/schema_err.txt; exit 1; }

PASS=0; FAIL=0
as() { local u=$1; shift; printf "\\\\o /dev/null\nselect set_config('request.jwt.claim.sub','%s',false);\nset role authenticated;\n\\\\o\n%s\n" "$u" "$*" | $DB 2>&1; }
admin_sql() { $DB -c "$1" 2>&1; }
ok()  { local name=$1; shift; local out; out=$("$@" 2>&1); if echo "$out" | grep -qiE "error|denied|violat"; then echo "FAIL  $name :: $out"; FAIL=$((FAIL+1)); else echo "pass  $name"; PASS=$((PASS+1)); fi; }
err() { local name=$1 pat=$2; shift 2; local out; out=$("$@" 2>&1); if echo "$out" | grep -qiE "$pat"; then echo "pass  $name"; PASS=$((PASS+1)); else echo "FAIL  $name (expected /$pat/) :: $out"; FAIL=$((FAIL+1)); fi; }
eq()  { local name=$1 want=$2 got=$3; if [ "$got" == "$want" ]; then echo "pass  $name"; PASS=$((PASS+1)); else echo "FAIL  $name want='$want' got='$got'"; FAIL=$((FAIL+1)); fi; }

mkuser() { admin_sql "insert into auth.users(email,email_confirmed_at,raw_user_meta_data) values ('$1', now(), '{\"full_name\":\"$2\"}') returning id" | head -1; }

# ---------------- sign-up ----------------
err "gmail rejected" "Only @student.uet.edu.pk" admin_sql "insert into auth.users(email,email_confirmed_at) values ('x@gmail.com', now())"
ADM=$(mkuser seadmin@student.uet.edu.pk "SE Admin")
A=$(mkuser ayesha@student.uet.edu.pk "Ayesha K")
B=$(mkuser hamza@student.uet.edu.pk "Hamza R")
C=$(mkuser sara@student.uet.edu.pk "Sara M")
D=$(mkuser bilal@student.uet.edu.pk "Bilal A")
eq "bootstrap admin flagged" "t" "$(admin_sql "select is_admin from profiles where id='$ADM'")"
eq "normal user not admin" "f" "$(admin_sql "select is_admin from profiles where id='$A'")"
eq "new accounts are not Pro" "f" "$(admin_sql "select is_pro from profiles where id='$A'")"
admin_sql "update profiles set is_pro=false, pro_until=null where id in ('$A','$B','$C')" >/dev/null
eq "zones seeded" "36" "$(admin_sql "select count(*) from zones")"
Z_CS=$(admin_sql "select id from zones where name='Department of Computer Science'")
Z_SSC=$(admin_sql "select id from zones where name='SSC (Main Cafe)'")
Z_MAIN=$(admin_sql "select id from zones where name='Main Block'")
Z_IQ=$(admin_sql "select id from zones where name='Iqbal Hall (Boys)'")
CAT=$(admin_sql "select id from categories where name='Books'")

# ---------------- profiles ----------------
err "cannot self-promote to admin" "denied|cannot be changed" as $A "update profiles set is_admin=true where id='$A'"
err "cannot fake trust score"      "denied|cannot be changed" as $A "update profiles set trust_score=5 where id='$A'"
ok  "can edit own name/zone"       as $A "update profiles set display_name='Ayesha Khan', default_zone_id=$Z_CS where id='$A'"
eq  "other user's profile untouched" "Ayesha Khan" "$(admin_sql "select display_name from profiles where id='$A'")"
as $A "update profiles set display_name='hax' where id='$B'" >/dev/null
eq  "update other profile ignored" "Hamza R" "$(admin_sql "select display_name from profiles where id='$B'")"
as $B "update profiles set default_zone_id=$Z_SSC where id='$B'" >/dev/null

# ---------------- listings ----------------
ITEM=$(as $A "insert into items(owner_id,title,description,category_id,condition,mode,rent_price,deposit,sale_price,zone_id) values ('$A','Calculus: Early Transcendentals','Barely used',$CAT,'good','both',1200,500,4500,$Z_CS) returning id" | head -1)
ok  "create listing" test -n "$ITEM"
err "rent mode needs price" "rent_needs_price" as $A "insert into items(owner_id,title,category_id,condition,mode,zone_id) values ('$A','No price book',$CAT,'good','rent',$Z_CS)"
err "cannot create for someone else" "row-level security" as $B "insert into items(owner_id,title,category_id,condition,mode,rent_price,deposit,zone_id) values ('$A','Fake',$CAT,'good','rent',100,0,$Z_CS)"
err "cannot set status rented" "Invalid listing state" as $A "insert into items(owner_id,title,category_id,condition,mode,rent_price,deposit,zone_id,status) values ('$A','Sneaky',$CAT,'good','rent',100,0,$Z_CS,'rented')"
for i in 1 2 3 4; do as $A "insert into items(owner_id,title,category_id,condition,mode,rent_price,deposit,zone_id) values ('$A','Filler item $i',$CAT,'good','rent',100,0,$Z_CS)" >/dev/null; done
err "6th active listing blocked" "5 active listings" as $A "insert into items(owner_id,title,category_id,condition,mode,rent_price,deposit,zone_id) values ('$A','Sixth item',$CAT,'good','rent',100,0,$Z_CS)"

# ---------------- search ----------------
as $A "insert into items(owner_id,title,category_id,condition,mode,rent_price,deposit,zone_id) values ('$A','Zzz archived',$CAT,'good','rent',100,0,$Z_CS)" >/dev/null 2>&1
ITEM_FAR=$(as $D "insert into items(owner_id,title,description,category_id,condition,mode,rent_price,deposit,zone_id) values ('$D','Digital Logic Trainer Kit','',$CAT,'good','rent',450,200,$Z_IQ) returning id" | head -1)
ITEM_NEAR=$(as $D "insert into items(owner_id,title,description,category_id,condition,mode,sale_price,zone_id) values ('$D','Casio fx-991EX Calculator','',$CAT,'like_new','sell',3500,$Z_SSC) returning id" | head -1)
FIRST=$(as $B "select title from search_items(null,'all',null,$Z_SSC,'distance') limit 1")
eq "nearest to SSC first" "Casio fx-991EX Calculator" "$FIRST"
LAST_DIST=$(as $B "select distance_m from search_items(null,'all',null,$Z_SSC,'distance') where title like 'Digital%'")
test "$LAST_DIST" -gt 400 && echo "pass  distance SSC->Iqbal Hall plausible (${LAST_DIST}m)" && PASS=$((PASS+1)) || { echo "FAIL distance $LAST_DIST"; FAIL=$((FAIL+1)); }
eq "buy filter hides rent-only" "0" "$(as $B "select count(*) from search_items(null,'buy',null,$Z_SSC) where title like 'Digital%'")"
eq "rent filter hides sell-only" "0" "$(as $B "select count(*) from search_items(null,'rent',null,$Z_SSC) where title like 'Casio%'")"
eq "keyword by zone name" "1" "$(as $B "select count(*) from search_items('iqbal','all',null,$Z_SSC)")"
eq "keyword % is literal" "0" "$(as $B "select count(*) from search_items('%','all',null,$Z_SSC)")"

eq "price sort ascending" "0" "$(as $B "select count(*) from (select rent_price, lag(rent_price) over () as prev from search_items(null,'rent',null,$Z_SSC,'price')) s where rent_price < prev")"
eq "defaults to own zone" "t" "$(as $B "select distance_m is not null from search_items(null,'all',null,null) limit 1")"
eq "pagination limit" "2" "$(as $B "select count(*) from search_items(null,'all',null,$Z_SSC,'distance',2,0)")"

# ---------------- request -> accept -> handover -> return -> review ----------------
err "own listing blocked" "own listing" as $A "select request_item('$ITEM','rent', current_date+1, current_date+30)"
err "return before start" "after the start" as $B "select request_item('$ITEM','rent', current_date+10, current_date+5)"
err "past start date" "in the past" as $B "select request_item('$ITEM','rent', current_date-2, current_date+30)"
err ">120 days" "120 days" as $B "select request_item('$ITEM','rent', current_date+1, current_date+200)"
err "sell-only not rentable" "not offered for rent" as $B "select request_item('$ITEM_NEAR','rent', current_date+1, current_date+30)"
TX=$(as $B "select request_item('$ITEM','rent', current_date+1, current_date+60,'Pickup after class')" | head -1)
ok  "request created" test -n "$TX"
eq  "item now requested" "requested" "$(admin_sql "select status from items where id='$ITEM'")"
err "second request blocked (BR-05)" "taken in the meantime" as $C "select request_item('$ITEM','rent', current_date+1, current_date+30)"
eq  "owner notified" "1" "$(admin_sql "select count(*) from notifications where user_id='$A' and kind='requests'")"
eq  "chat auto-created with system msg" "1" "$(admin_sql "select count(*) from messages where kind='system' and body like 'Rental request sent%'")"
eq  "outsider cannot see txn" "0" "$(as $C "select count(*) from transactions")"
eq  "participants see txn" "1" "$(as $B "select count(*) from transactions")"
err "requester cannot accept" "Request not found" as $B "select respond_request('$TX', true)"
err "cannot write txn directly" "denied|row-level" as $B "update transactions set status='returned' where id='$TX'"
ok  "owner accepts" as $A "select respond_request('$TX', true)"
eq  "item rented after accept" "rented" "$(admin_sql "select status from items where id='$ITEM'")"
err "owner cannot edit rented item" "active or completed" as $A "update items set title='Changed' where id='$ITEM'"
err "return before handover" "not active" as $B "select confirm_return('$TX')"
err "evidence path must be own" "Invalid photo path" as $B "select confirm_handover('$TX','ok',array['$A/$TX/x.jpg'])"
eq  "handover: first side -> accepted" "accepted" "$(as $B "select confirm_handover('$TX','Looks fine',array['$B/$TX/a.jpg'])" | head -1)"
err "double confirm blocked" "already confirmed" as $B "select confirm_handover('$TX')"
eq  "handover: both -> rented" "rented" "$(as $A "select confirm_handover('$TX')" | head -1)"
eq  "deposit held" "held" "$(admin_sql "select deposit_status from transactions where id='$TX'")"
eq  "outsider cannot read evidence" "0" "$(as $C "select count(*) from txn_evidence")"
eq  "participant reads evidence" "1" "$(as $B "select count(*) from txn_evidence")"
err "owner must record deposit outcome" "deposit" as $A "select confirm_return('$TX','all good')"
as $B "select confirm_return('$TX','returned clean')" >/dev/null
eq  "return: both -> returned" "returned" "$(as $A "select confirm_return('$TX','fine',null,'deducted')" | head -1)"
eq  "deposit deducted recorded" "deducted" "$(admin_sql "select deposit_status from transactions where id='$TX'")"
eq  "item available again" "available" "$(admin_sql "select status from items where id='$ITEM'")"
eq  "swaps counted" "1|1" "$(admin_sql "select string_agg(swaps_count::text,'|') from profiles where id in ('$A','$B')")"
err "outsider cannot review" "not found" as $C "select submit_review('$TX', 5)"
ok  "renter reviews owner" as $B "select submit_review('$TX', 5, 'Great')"
err "one review per party" "already reviewed" as $B "select submit_review('$TX', 4)"
err "rating range" "between 1 and 5|violates" as $A "select submit_review('$TX', 9)"
as $A "select submit_review('$TX', 4, 'ok')" >/dev/null
eq  "trust score = avg" "5.00" "$(admin_sql "select trust_score from profiles where id='$A'")"
err "cannot insert review directly" "denied|row-level" as $C "insert into reviews(txn_id,reviewer_id,reviewee_id,rating) values ('$TX','$C','$A',1)"

# decline + cancel paths
TX2=$(as $C "select request_item('$ITEM','rent', current_date+1, current_date+30)" | head -1)
as $A "select respond_request('$TX2', false)" >/dev/null
eq "decline frees item" "available" "$(admin_sql "select status from items where id='$ITEM'")"
TX3=$(as $C "select request_item('$ITEM','buy')" | head -1)
as $C "select cancel_request('$TX3')" >/dev/null
eq "cancel frees item" "available" "$(admin_sql "select status from items where id='$ITEM'")"
TX4=$(as $C "select request_item('$ITEM_NEAR','buy')" | head -1)
as $D "select respond_request('$TX4', true)" >/dev/null
eq "buy accept -> sold" "sold" "$(admin_sql "select status from items where id='$ITEM_NEAR'")"
as $C "select confirm_handover('$TX4')" >/dev/null; as $D "select confirm_handover('$TX4')" >/dev/null
eq "buy handover -> completed" "completed" "$(admin_sql "select status from transactions where id='$TX4'")"

# account deletion blocked by active txn
TX5=$(as $C "select request_item('$ITEM','rent', current_date+1, current_date+30)" | head -1)
err "cannot delete account with active request" "active requests" as $C "select delete_my_account()"
as $C "select cancel_request('$TX5')" >/dev/null

# ---------------- chat ----------------
CONV=$(as $C "select start_conversation('$ITEM')" | head -1)
ok  "start conversation" test -n "$CONV"
eq  "idempotent conversation" "$CONV" "$(as $C "select start_conversation('$ITEM')" | head -1)"
ok  "send message" as $C "insert into messages(conversation_id,sender_id,body) values ('$CONV','$C','Is this still available?')"
eq  "owner sees unread 1" "1" "$(as $A "select unread from my_conversations() where id='$CONV'")"
as $A "select mark_conversation_read('$CONV')" >/dev/null
eq  "unread cleared" "0" "$(as $A "select unread from my_conversations() where id='$CONV'")"
eq  "outsider sees no messages" "0" "$(as $D "select count(*) from messages where conversation_id='$CONV'")"
err "outsider cannot post in chat" "row-level" as $D "insert into messages(conversation_id,sender_id,body) values ('$CONV','$D','hi')"
err "cannot spoof sender" "row-level" as $C "insert into messages(conversation_id,sender_id,body) values ('$CONV','$A','spoof')"
err "cannot send system msg" "row-level" as $C "insert into messages(conversation_id,sender_id,kind,body) values ('$CONV','$C','system','fake')"
as $A "insert into blocks(blocker_id,blocked_id) values ('$A','$C')" >/dev/null
err "blocked user cannot message" "row-level" as $C "insert into messages(conversation_id,sender_id,body) values ('$CONV','$C','still there?')"
as $A "delete from blocks where blocker_id='$A'" >/dev/null
eq "message notification created" "1" "$(admin_sql "select count(*) from notifications where user_id='$A' and kind='messages'")"
as $A "update user_private set notification_prefs = notification_prefs || '{\"messages\":false}' where user_id='$A'" >/dev/null
as $C "insert into messages(conversation_id,sender_id,body) values ('$CONV','$C','second')" >/dev/null
eq "muted category creates none" "1" "$(admin_sql "select count(*) from notifications where user_id='$A' and kind='messages'")"

# ---------------- feed ----------------
POST=$(as $A "insert into posts(author_id,body,item_id) values ('$A','Selling my calculator!','$ITEM') returning id" | head -1)
ok  "create post with linked listing" test -n "$POST"
err "cannot link someone else's listing" "own listings" as $B "insert into posts(author_id,body,item_id) values ('$B','x','$ITEM')"
err "cannot set like_count" "Invalid post" as $B "insert into posts(author_id,body,like_count) values ('$B','cheat',99)"
ok  "attach post image" as $A "insert into post_images(post_id,path,position) values ('$POST','$A/p1.jpg',0)"
err "image path must be own folder" "row-level" as $A "insert into post_images(post_id,path,position) values ('$POST','$B/p1.jpg',1)"
as $B "insert into post_likes(post_id,user_id) values ('$POST','$B')" >/dev/null
err "double like blocked" "duplicate" as $B "insert into post_likes(post_id,user_id) values ('$POST','$B')"
as $C "insert into comments(post_id,author_id,body) values ('$POST','$C','Nice')" >/dev/null
eq  "counters" "1|1" "$(admin_sql "select like_count||'|'||comment_count from posts where id='$POST'")"
eq  "like/comment notifications" "2" "$(admin_sql "select count(*) from notifications where user_id='$A' and kind in ('likes','comments')")"
as $B "update posts set body='hijack' where id='$POST'" >/dev/null 2>&1
eq  "other user cannot edit post" "Selling my calculator!" "$(admin_sql "select body from posts where id='$POST'")"
as $B "delete from posts where id='$POST'" >/dev/null
eq  "other user cannot delete post" "1" "$(admin_sql "select count(*) from posts where id='$POST'")"
as $B "delete from post_likes where post_id='$POST' and user_id='$B'" >/dev/null
eq  "unlike updates counter" "0" "$(admin_sql "select like_count from posts where id='$POST'")"

# ---------------- reports / moderation ----------------
RID=$(as $B "select submit_report('post','$POST','spam','test')" | head -1)
ok  "report created" test -n "$RID"
err "duplicate report" "already reported" as $B "select submit_report('post','$POST','spam')"
err "cannot report yourself" "yourself" as $A "select submit_report('user','$A','spam')"
eq  "reporter cannot see others' reports" "0" "$(as $C "select count(*) from reports")"
err "non-admin cannot see queue" "Admins only" as $B "select * from admin_report_queue()"
err "non-admin cannot resolve" "Admins only" as $B "select admin_resolve_report('$RID','remove')"
eq  "admin sees queue" "1" "$(as $ADM "select count(*) from admin_report_queue()")"
as $ADM "select admin_resolve_report('$RID','remove','Spam post')" >/dev/null
eq  "post removed from feed" "0" "$(as $C "select count(*) from posts where id='$POST'")"
eq  "author still sees own removed post" "1" "$(as $A "select count(*) from posts where id='$POST'")"
eq  "audit log written" "1" "$(as $ADM "select count(*) from admin_actions where action='report_remove'")"
# BR-06 auto suspend: 3 upheld against A within 30 days
for n in 1 2; do
  P=$(as $A "insert into posts(author_id,body) values ('$A','spam $n') returning id" | head -1)
  R=$(as $B "select submit_report('post','$P','spam')" | head -1)
  as $ADM "select admin_resolve_report('$R','remove')" >/dev/null
done
eq  "auto-suspended after 3 upheld (BR-06)" "t" "$(admin_sql "select is_suspended from profiles where id='$A'")"
err "suspended user cannot post" "Verify your university email|row-level" as $A "insert into posts(author_id,body) values ('$A','still here')"
err "suspended user cannot create listing" "Verify your university email|row-level" as $A "insert into items(owner_id,title,category_id,condition,mode,rent_price,deposit,zone_id) values ('$A','Another',$CAT,'good','rent',100,0,$Z_CS)"
eq  "suspended user's listings hidden" "0" "$(as $B "select count(*) from items where owner_id='$A'")"
as $ADM "select admin_set_suspended('$A', false)" >/dev/null
eq  "reinstated" "f" "$(admin_sql "select is_suspended from profiles where id='$A'")"
eq  "admin cannot be suspended" "f" "$(as $ADM "select admin_set_suspended('$ADM', true, 'x')" >/dev/null; admin_sql "select is_suspended from profiles where id='$ADM'")"
eq  "admin stats" "t" "$(as $ADM "select (admin_stats()->>'users')::int >= 5")"
ok  "admin manages zones" as $ADM "insert into zones(name,category,lat,lng) values ('Central Library','Hub',31.5780,74.3560)"
err "user cannot manage zones" "row-level|denied" as $B "insert into zones(name,category,lat,lng) values ('Hack','Hub',31.5,74.3)"

# ---------------- pro / reminders / expiry ----------------
admin_sql "update profiles set is_pro=true, pro_until=now()+interval '30 days' where id='$B'" >/dev/null
BI=$(as $B "insert into items(owner_id,title,category_id,condition,mode,rent_price,deposit,zone_id) values ('$B','Boost me',$CAT,'good','rent',100,0,$Z_CS) returning id" | head -1)
ok  "pro can boost" as $B "select boost_item('$BI')"
err "free user cannot boost" "Pro feature" as $C "select boost_item('$BI')"
TX6=$(as $C "select request_item('$ITEM','rent', current_date, current_date+1)" | head -1)
as $A "select respond_request('$TX6', true)" >/dev/null; as $A "select confirm_handover('$TX6')" >/dev/null; as $C "select confirm_handover('$TX6')" >/dev/null
eq  "reminder run sends one rental" "1" "$(admin_sql "select send_return_reminders()")"
eq  "both parties reminded" "2" "$(admin_sql "select count(*) from notifications where kind='reminders'")"
eq  "reminders only once per day" "0" "$(admin_sql "select send_return_reminders()")"
TX7=$(as $D "select request_item('$BI','rent', current_date+1, current_date+10)" | head -1)
admin_sql "update transactions set created_at = now() - interval '80 hours' where id='$TX7'" >/dev/null
eq  "stale request expired" "1" "$(admin_sql "select expire_stale_requests()")"
eq  "item freed after expiry" "available" "$(admin_sql "select status from items where id='$BI'")"
err "users cannot call cron helpers" "permission denied" as $B "select send_return_reminders()"
err "users cannot call notify()" "permission denied" as $B "select notify('$A','system','x')"
err "anon cannot read items" "permission denied" bash -c "printf 'set role anon;\nselect count(*) from items;\n' | $DB 2>&1"

# ---------------- listing delete rules ----------------
admin_sql "delete from items where owner_id='$A' and title like 'Filler%'; update items set status='available' where id='$ITEM'" >/dev/null
err "cannot delete listing with history" "transaction history" as $A "delete from items where id='$ITEM'"
DEL_ITEM=$(as $A "insert into items(owner_id,title,category_id,condition,mode,rent_price,deposit,zone_id) values ('$A','Deletable thing',$CAT,'good','rent',100,0,$Z_CS) returning id" | head -1)
as $A "delete from items where id='$DEL_ITEM'" >/dev/null
eq "listing without history can be deleted" "0" "$(admin_sql "select count(*) from items where id='$DEL_ITEM'")"

# ---------------- account deletion ----------------
as $D "delete from items where owner_id='$D' and status='available'" >/dev/null
ok  "account deletion cascades" as $B "select delete_my_account()"
eq  "profile gone" "0" "$(admin_sql "select count(*) from profiles where id='$B'")"
eq  "auth user gone" "0" "$(admin_sql "select count(*) from auth.users where id='$B'")"

# ---------------- push tokens (003) ----------------
TOK="ExponentPushToken[abcdefghijklmnop]"
ok  "register token" as $A "select register_device_token('$TOK','android')"
eq  "token stored for A" "$A" "$(admin_sql "select user_id from device_tokens where token='$TOK'")"
ok  "token moves to next user" as $C "select register_device_token('$TOK','android')"
eq  "token now belongs to C" "$C" "$(admin_sql "select user_id from device_tokens where token='$TOK'")"
err "short token rejected" "Invalid token" as $C "select register_device_token('x')"
as $A "select unregister_device_token('$TOK')" >/dev/null
eq  "A cannot remove C's token" "1" "$(admin_sql "select count(*) from device_tokens where token='$TOK'")"

echo; echo "passed=$PASS failed=$FAIL"; [ $FAIL -eq 0 ]
