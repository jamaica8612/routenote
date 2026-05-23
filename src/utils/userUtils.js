export const isDemoUser = (user) => user?.id?.startsWith('demo-') || false;

export const getDbUserId = (user) => (isDemoUser(user) ? null : user?.id || null);
