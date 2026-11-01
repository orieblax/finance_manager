import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // 1. Try session from cookie or Bearer token
    let { data: { user } } = await supabase.auth.getUser();

    const authHeader = request.headers.get('Authorization');
    if (!user && authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
      if (!url || !key) {
        return NextResponse.json({ error: 'supabase configuration missing' }, { status: 500 });
      }
      const tokenClient = createAdminClient(url, key);
      const res = await tokenClient.auth.getUser(token);
      user = res.data.user;
    }

    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const monthKey = searchParams.get('month_key');

    // 2. Fetch snapshot for the requested month, or fall back to the most recent snapshot
    let snapshotData = null;

    if (monthKey && monthKey !== 'latest') {
      const { data, error } = await supabase
        .from('finance_snapshots')
        .select('*')
        .eq('user_id', user.id)
        .eq('month_key', monthKey)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      snapshotData = data;
    }

    // If not found by specific month or month was 'latest'/empty, get latest available snapshot
    if (!snapshotData) {
      const { data, error } = await supabase
        .from('finance_snapshots')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      snapshotData = data;
    }

    return NextResponse.json({
      found: !!snapshotData,
      user_id: user.id,
      month_key: snapshotData?.month_key || monthKey || 'latest',
      updated_at: snapshotData?.updated_at || null,
      payload: snapshotData?.payload || null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    let { data: { user } } = await supabase.auth.getUser();

    const authHeader = request.headers.get('Authorization');
    if (!user && authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
      if (!url || !key) {
        return NextResponse.json({ error: 'supabase configuration missing' }, { status: 500 });
      }
      const tokenClient = createAdminClient(url, key);
      const res = await tokenClient.auth.getUser(token);
      user = res.data.user;
    }

    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const monthKey = body.month_key || 'device_backup';
    const payload = body.payload;
    const deviceId = body.device_id || 'web-app';

    if (!payload) {
      return NextResponse.json({ error: 'missing payload' }, { status: 400 });
    }

    const { error } = await supabase
      .from('finance_snapshots')
      .upsert({
        user_id: user.id,
        month_key: monthKey,
        payload,
        device_id: deviceId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,month_key' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      month_key: monthKey,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'internal server error' }, { status: 500 });
  }
}
