import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');

    if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
      return jsonResponse({ error: 'Missing push configuration' }, 500);
    }

    const authHeader = req.headers.get('Authorization') || '';
    const userClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const { notificationId } = await req.json().catch(() => ({ notificationId: null }));
    if (!notificationId) {
      return jsonResponse({ error: 'notificationId is required' }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: notification, error: notificationError } = await adminClient
      .from('rn_notifications')
      .select('id, recipient_id, sender_id, type, message, tip_id, comment_id')
      .eq('id', notificationId)
      .single();

    if (notificationError || !notification) {
      return jsonResponse({ error: 'Notification not found' }, 404);
    }

    if (notification.sender_id && notification.sender_id !== userData.user.id) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    const { data: subscriptions, error: subscriptionError } = await adminClient
      .from('rn_push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', notification.recipient_id);

    if (subscriptionError) {
      return jsonResponse({ error: subscriptionError.message }, 500);
    }

    if (!subscriptions || subscriptions.length === 0) {
      return jsonResponse({ sent: 0, removed: 0 });
    }

    webpush.setVapidDetails(
      'mailto:admin@routenote.local',
      vapidPublicKey,
      vapidPrivateKey,
    );

    const payload = JSON.stringify({
      title: 'Route Note',
      body: notification.message || '새 알림이 도착했습니다.',
      url: '/routenote/',
      tag: notification.id,
      type: notification.type,
      tipId: notification.tip_id,
      commentId: notification.comment_id,
    });

    let sent = 0;
    const expiredIds: string[] = [];

    await Promise.allSettled(
      (subscriptions as PushSubscriptionRow[]).map(async (row) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: row.endpoint,
              keys: {
                p256dh: row.p256dh,
                auth: row.auth,
              },
            },
            payload,
          );
          sent += 1;
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            expiredIds.push(row.id);
          } else {
            console.error('Push send failed', err);
          }
        }
      }),
    );

    if (expiredIds.length > 0) {
      await adminClient
        .from('rn_push_subscriptions')
        .delete()
        .in('id', expiredIds);
    }

    return jsonResponse({ sent, removed: expiredIds.length });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});

