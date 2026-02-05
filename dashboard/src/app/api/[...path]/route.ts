import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

async function proxyRequest(request: NextRequest, path: string[]) {
  const backendPath = `/api/v1/${path.join('/')}`;
  const url = `${BACKEND_URL}${backendPath}`;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const options: RequestInit = {
      method: request.method,
      headers,
    };

    // Add body for POST, PUT, PATCH requests
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      try {
        const body = await request.json();
        options.body = JSON.stringify(body);
      } catch {
        // No body or invalid JSON
      }
    }

    // Forward query parameters
    const searchParams = request.nextUrl.searchParams.toString();
    const fullUrl = searchParams ? `${url}?${searchParams}` : url;

    console.log(`[API Proxy] ${request.method} ${fullUrl}`);

    const response = await fetch(fullUrl, options);

    // Handle non-JSON responses
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
    } else {
      const text = await response.text();
      return new NextResponse(text, {
        status: response.status,
        headers: { 'Content-Type': contentType || 'text/plain' }
      });
    }
  } catch (error: any) {
    console.error(`[API Proxy] Error:`, error);
    return NextResponse.json(
      { error: error.message || 'Failed to connect to backend' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path);
}
