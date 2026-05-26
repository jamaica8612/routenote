import { supabase } from '../supabaseClient';

const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export function getPushSupportState() {
  if (!vapidPublicKey) return { supported: false, reason: 'missing-key' };
  if (!('serviceWorker' in navigator)) return { supported: false, reason: 'service-worker' };
  if (!('PushManager' in window)) return { supported: false, reason: 'push-manager' };
  if (!('Notification' in window)) return { supported: false, reason: 'notification' };
  return { supported: true, reason: null };
}

export async function getPushPermissionState() {
  const support = getPushSupportState();
  if (!support.supported) return 'unsupported';
  return Notification.permission;
}

export async function enablePushNotifications(userId) {
  const support = getPushSupportState();
  if (!support.supported) {
    throw new Error('이 브라우저에서는 푸시 알림을 지원하지 않습니다.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('알림 권한이 허용되지 않았습니다.');
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  const json = subscription.toJSON();
  const { error } = await supabase
    .from('rn_push_subscriptions')
    .upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        user_agent: navigator.userAgent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    );

  if (error) throw error;
  return subscription;
}

export async function sendPushForNotification(notificationId) {
  if (!notificationId) return;
  try {
    await supabase.functions.invoke('rn-send-push', {
      body: { notificationId },
    });
  } catch (err) {
    console.warn('Push notification send failed:', err.message);
  }
}

