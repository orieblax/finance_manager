import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { createClient as createSupabaseJsClient, type SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

async function getAuthenticatedSupabase(
  request: NextRequest
): Promise<{ client: SupabaseClient<any, 'public', any>; user: any } | null> {
  const cookieStore = await cookies();
  const cookieClient = createClient(cookieStore);

  // 1. Prefer Bearer token if explicitly supplied by client (most reliable across PWA / Android TWA)
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const key =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      '';
    if (token && url && key && !url.includes('placeholder')) {
      const tokenClient = createSupabaseJsClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      });
      const { data } = await tokenClient.auth.getUser(token);
      if (data?.user) {
        return { client: tokenClient, user: data.user };
      }
    }
  }

  // 2. Fall back to SSR cookie session
  const {
    data: { user },
  } = await cookieClient.auth.getUser();

  if (user) {
    return { client: cookieClient as unknown as SupabaseClient<any, 'public', any>, user };
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedSupabase(request);
    if (!auth) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const { client: supabase, user } = auth;
    const { searchParams } = new URL(request.url);
    const monthKey = searchParams.get('month_key');

    // Fetch snapshot for the requested month, or fall back to the most recent snapshot
    let snapshotData = null;

    if (monthKey && monthKey !== 'latest') {
      const { data, error } = await supabase
        .from('finance_snapshots')
        .select('*')
        .eq('user_id', user.id)
        .eq('month_key', monthKey)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
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
        return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
      }
      snapshotData = data;
    }

    const parsedPayload =
      typeof snapshotData?.payload === 'string'
        ? JSON.parse(snapshotData.payload)
        : snapshotData?.payload || null;

    return NextResponse.json(
      {
        found: !!snapshotData,
        user_id: user.id,
        month_key: snapshotData?.month_key || monthKey || 'latest',
        updated_at: snapshotData?.updated_at || null,
        payload: parsedPayload,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedSupabase(request);
    if (!auth) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const { client: supabase, user } = auth;
    const body = await request.json();
    const monthKey = body.month_key || 'device_backup';
    const payload = typeof body.payload === 'string' ? JSON.parse(body.payload) : body.payload;
    const deviceId = body.device_id || 'web-app';

    if (!payload) {
      return NextResponse.json({ error: 'missing payload' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const updatedAt = new Date().toISOString();
    const { error } = await supabase.from('finance_snapshots').upsert(
      {
        user_id: user.id,
        month_key: monthKey,
        payload,
        device_id: deviceId,
        updated_at: updatedAt,
      },
      { onConflict: 'user_id,month_key' }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    return NextResponse.json(
      {
        success: true,
        month_key: monthKey,
        updated_at: updatedAt,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
