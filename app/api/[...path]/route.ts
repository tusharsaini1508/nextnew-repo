import { NextRequest } from 'next/server';
import { handleLegacyApi } from '../../../lib/legacy-api';

type RouteContext = {
  params: {
    path?: string[];
  };
};

async function handle(request: NextRequest, context: RouteContext) {
  return handleLegacyApi(request, context.params.path ?? []);
}

export async function GET(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

export async function OPTIONS(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}
