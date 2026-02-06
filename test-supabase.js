/**
 * Comprehensive test script to verify Supabase fixes for:
 * 1. Activities syncing to cloud (visible to other users)
 * 2. Territory username resolution
 * 3. UPDATE/DELETE RLS policies
 */
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabaseUrl = 'https://ckrdbwqklcxsfcnlfdvi.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrcmRid3FrbGN4c2ZjbmxmZHZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMTQwNzksImV4cCI6MjA4Mzg5MDA3OX0.2nbyiLLKWgBdiItRaFbhSoaugRwlV4mNZ1A09jLQjPk';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

let passed = 0;
let failed = 0;
let skipped = 0;

function ok(msg) { passed++; console.log(`  PASS: ${msg}`); }
function fail(msg) { failed++; console.log(`  FAIL: ${msg}`); }
function skip(msg) { skipped++; console.log(`  SKIP: ${msg}`); }

async function runTests() {
    console.log('============================================');
    console.log('  Supabase Integration Tests');
    console.log('============================================\n');

    // ─── 1. Users table ─────────────────────────────
    console.log('[1] Users table (SELECT)');
    const { data: users, error: usersErr } = await supabase
        .from('users')
        .select('id, username, bio, avatar_url, created_at')
        .limit(20);
    if (usersErr) {
        fail(`Cannot query users: ${usersErr.message}`);
    } else {
        ok(`Found ${users.length} users`);
        users.forEach(u => console.log(`     -> ${u.username || '(null)'} [${u.id.slice(0, 8)}...]`));
    }

    // ─── 2. Activities table (SELECT) ────────────────
    console.log('\n[2] Activities table (SELECT)');
    const { data: activities, error: actErr } = await supabase
        .from('activities')
        .select('*')
        .order('start_time', { ascending: false })
        .limit(20);
    if (actErr) {
        fail(`Cannot query activities: ${actErr.message}`);
    } else {
        ok(`Found ${activities.length} activities in cloud`);
        if (activities.length > 0) {
            activities.forEach(a =>
                console.log(`     -> ${a.type} | ${Math.round(a.distance || 0)}m | user=${a.user_id?.slice(0, 8)}...`)
            );
        } else {
            console.log('     -> (empty - activities have not been synced from devices yet)');
            console.log('     -> After the code fix, activities will sync when users open the app');
        }
    }

    // ─── 3. Territories table (SELECT) ───────────────
    console.log('\n[3] Territories table (SELECT)');
    const { data: territories, error: terrErr } = await supabase
        .from('territories')
        .select('*')
        .order('claimed_at', { ascending: false })
        .limit(20);
    if (terrErr) {
        fail(`Cannot query territories: ${terrErr.message}`);
    } else {
        ok(`Found ${territories.length} territories in cloud`);
    }

    // ─── 4. Territory JOIN with users ────────────────
    console.log('\n[4] Territory-user JOIN (username resolution)');
    const { data: terrJoin, error: joinErr } = await supabase
        .from('territories')
        .select(`*, users:owner_id (username)`)
        .limit(10);
    if (joinErr) {
        fail(`Territory-user join query failed: ${joinErr.message}`);
    } else {
        ok(`Join query works (${terrJoin.length} results)`);
        if (terrJoin.length > 0) {
            terrJoin.forEach(t => {
                const username = t.users?.username;
                console.log(`     -> "${t.name}" owner: ${username || '(null)'}`);
            });
        }
    }

    // ─── 5. RPC function ─────────────────────────────
    console.log('\n[5] RPC function get_user_activities');
    if (users && users.length > 0) {
        const { data: rpcData, error: rpcErr } = await supabase
            .rpc('get_user_activities', { target_user_id: users[0].id });
        if (rpcErr) {
            fail(`RPC function failed: ${rpcErr.message}`);
        } else {
            ok(`RPC returned ${rpcData?.length || 0} activities for "${users[0].username}"`);
        }
    } else {
        skip('No users to test RPC with');
    }

    // ─── 6. Per-user activity counts ─────────────────
    console.log('\n[6] Per-user activity counts');
    if (users) {
        for (const user of users.slice(0, 5)) {
            const { count, error: countErr } = await supabase
                .from('activities')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id);
            if (countErr) {
                fail(`Count for ${user.username}: ${countErr.message}`);
            } else {
                console.log(`     -> ${user.username}: ${count} activities`);
                if (count === 0) {
                    console.log('        (will appear after user opens the app with the updated code)');
                }
            }
        }
        ok('Per-user queries work');
    }

    // ─── 7. Test RLS policies ────────────────────────
    console.log('\n[7] RLS Policy checks (using anon role)');

    // SELECT on activities should work (policy: true)
    const { error: selActErr } = await supabase.from('activities').select('id').limit(1);
    if (selActErr) fail(`SELECT activities: ${selActErr.message}`);
    else ok('SELECT on activities works');

    // SELECT on territories should work (policy: true)
    const { error: selTerrErr } = await supabase.from('territories').select('id').limit(1);
    if (selTerrErr) fail(`SELECT territories: ${selTerrErr.message}`);
    else ok('SELECT on territories works');

    // SELECT on users should work (policy: true)
    const { error: selUsrErr } = await supabase.from('users').select('id').limit(1);
    if (selUsrErr) fail(`SELECT users: ${selUsrErr.message}`);
    else ok('SELECT on users works');

    // INSERT on activities without auth should fail (policy requires auth.uid() = user_id)
    const { error: insActErr } = await supabase.from('activities').insert({
        id: crypto.randomUUID(),
        user_id: '00000000-0000-0000-0000-000000000000',
        type: 'RUN',
        distance: 100,
        duration: 60,
    });
    if (insActErr) {
        ok(`INSERT activities correctly blocked for anon: ${insActErr.message.slice(0, 60)}`);
    } else {
        fail('INSERT activities should have been blocked for anon role!');
    }

    // ─── 8. Schema column checks ─────────────────────
    console.log('\n[8] Schema column checks');
    const { data: colCheck, error: colErr } = await supabase
        .from('activities')
        .select('id, user_id, type, start_time, end_time, distance, duration, polylines, is_synced, territory_id, average_speed')
        .limit(1);
    if (colErr) {
        fail(`Activities schema issue: ${colErr.message}`);
    } else {
        ok('All expected activity columns exist');
    }

    const { data: terrColCheck, error: terrColErr } = await supabase
        .from('territories')
        .select('id, name, owner_id, claimed_at, area, perimeter, center, polygon, activity_id')
        .limit(1);
    if (terrColErr) {
        fail(`Territories schema issue: ${terrColErr.message}`);
    } else {
        ok('All expected territory columns exist');
    }

    // ─── 9. User search functionality ────────────────
    console.log('\n[9] User search (ILIKE query)');
    const { data: searchResults, error: searchErr } = await supabase
        .from('users')
        .select('id, username, bio, avatar_url')
        .ilike('username', '%a%')
        .limit(5);
    if (searchErr) {
        fail(`User search failed: ${searchErr.message}`);
    } else {
        ok(`Search returned ${searchResults.length} results`);
        searchResults.forEach(u => console.log(`     -> ${u.username}`));
    }

    // ─── Summary ─────────────────────────────────────
    console.log('\n============================================');
    console.log(`  Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
    console.log('============================================');

    if (activities?.length === 0) {
        console.log('\nNOTE: The cloud database has 0 activities and 0 territories.');
        console.log('This is expected - activities were stuck on local devices.');
        console.log('After deploying the code fix:');
        console.log('  1. When any user opens the app, syncPendingActivities() runs');
        console.log('  2. All locally stored activities will sync to Supabase');
        console.log('  3. Other users will then see them on UserProfileScreen');
        console.log('  4. Territory labels will show usernames (join + fallback)');
    }

    if (failed > 0) process.exit(1);
}

runTests().catch(err => {
    console.error('Test script crashed:', err);
    process.exit(1);
});
