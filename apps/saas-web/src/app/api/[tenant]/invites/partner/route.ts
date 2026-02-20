import { NextRequest } from 'next/server';
import { POST as createInvite } from '../../team/route';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const body = await request.json().catch(() => ({}));
  const rewritten = {
    ...body,
    invitation_type: 'partner',
  };

  const nextRequest = new NextRequest(
    new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(rewritten),
    })
  );

  return createInvite(nextRequest, { params });
}
