export interface NotificationItem {
    id: string;
    title: string;
    message: string;
    senderName: string | null;
    sentAt: string;
    isRead: boolean;
}
