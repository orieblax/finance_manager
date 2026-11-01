import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'personal-finance-manager-nextjs-api',
    runtime: 'edge/node',
    timestamp: new Date().toISOString(),
  });
}
