import { progressBus } from '@/lib/progress-bus';
import type { ProgressEvent } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get('projectId');

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const listener = (data: ProgressEvent) => {
        if (!projectId || data.projectId === projectId) {
          const chunk = `data: ${JSON.stringify(data)}\n\n`;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            // Stream closed
            progressBus.off('progress', listener);
          }
        }
      };

      progressBus.on('progress', listener);

      // Send initial keepalive
      controller.enqueue(encoder.encode(': keepalive\n\n'));

      // Cleanup when client disconnects
      req.signal.addEventListener('abort', () => {
        progressBus.off('progress', listener);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
