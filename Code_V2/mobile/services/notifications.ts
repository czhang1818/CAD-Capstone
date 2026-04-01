import api from './api';
import { NotificationItem } from '../types/notification';

export const notificationService = {
    getMyNotifications: async (limit = 50): Promise<NotificationItem[]> => {
        const res = await api.get<NotificationItem[]>('/api/notifications', { params: { limit } });
        return res.data;
    },

    getUnreadCount: async (): Promise<number> => {
        const res = await api.get<{ count: number }>('/api/notifications/unread-count');
        return res.data.count;
    },

    markRead: async (id: string): Promise<void> => {
        await api.post(`/api/notifications/${id}/read`);
    },

    markAllRead: async (): Promise<void> => {
        await api.post('/api/notifications/read-all');
    },
};
