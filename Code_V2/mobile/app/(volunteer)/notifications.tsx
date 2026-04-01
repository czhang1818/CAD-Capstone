import { useState, useCallback, useEffect } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { Text, Surface, Button, ActivityIndicator, Divider } from 'react-native-paper';
import { COLORS } from '../../constants/config';
import { notificationService } from '../../services/notifications';
import { NotificationItem } from '../../types/notification';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function NotificationsScreen() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);

    const load = useCallback(async () => {
        try {
            const [items, count] = await Promise.all([
                notificationService.getMyNotifications(),
                notificationService.getUnreadCount(),
            ]);
            setNotifications(items);
            setUnreadCount(count);
        } catch (err: any) {
            console.log('Notification load error:', err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    }, [load]);

    const handleMarkRead = async (id: string) => {
        try {
            await notificationService.markRead(id);
            setNotifications(prev =>
                prev.map(n => n.id === id ? { ...n, isRead: true } : n)
            );
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch { }
    };

    const handleMarkAllRead = async () => {
        try {
            await notificationService.markAllRead();
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch { }
    };

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'Just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `${diffHr}h ago`;
        const diffDay = Math.floor(diffHr / 24);
        if (diffDay < 7) return `${diffDay}d ago`;
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    if (loading) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header bar with unread count + mark all */}
            {notifications.length > 0 && (
                <View style={styles.headerBar}>
                    <View style={styles.unreadBadgeRow}>
                        <MaterialCommunityIcons name="bell" size={18} color={COLORS.primary} />
                        <Text style={styles.unreadLabel}>
                            {unreadCount > 0 ? `${unreadCount} unread` : 'All read'}
                        </Text>
                    </View>
                    {unreadCount > 0 && (
                        <Button
                            compact
                            mode="text"
                            textColor={COLORS.primary}
                            onPress={handleMarkAllRead}
                            icon="check-all"
                        >
                            Mark all read
                        </Button>
                    )}
                </View>
            )}

            <FlatList
                data={notifications}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.list}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
                ItemSeparatorComponent={() => <Divider style={styles.separator} />}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={[styles.notifItem, !item.isRead && styles.notifUnread]}
                        onPress={() => !item.isRead && handleMarkRead(item.id)}
                        activeOpacity={item.isRead ? 1 : 0.7}
                    >
                        <View style={[styles.iconBg, { backgroundColor: item.isRead ? COLORS.surfaceLight : COLORS.primary + '18' }]}>
                            <MaterialCommunityIcons
                                name={item.isRead ? 'bell-outline' : 'bell-ring'}
                                size={20}
                                color={item.isRead ? COLORS.textSecondary : COLORS.primary}
                            />
                        </View>
                        <View style={styles.notifContent}>
                            <View style={styles.notifTitleRow}>
                                <Text style={[styles.notifTitle, !item.isRead && { color: COLORS.text, fontWeight: '700' }]} numberOfLines={1}>
                                    {item.title}
                                </Text>
                                {!item.isRead && <View style={styles.unreadDot} />}
                            </View>
                            <Text style={styles.notifMessage} numberOfLines={2}>
                                {item.message}
                            </Text>
                            <View style={styles.notifMeta}>
                                {item.senderName && (
                                    <Text style={styles.sender}>{item.senderName}</Text>
                                )}
                                <Text style={styles.time}>{formatTime(item.sentAt)}</Text>
                            </View>
                        </View>
                    </TouchableOpacity>
                )}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <MaterialCommunityIcons name="bell-sleep-outline" size={64} color={COLORS.border} />
                        <Text style={styles.emptyTitle}>No Notifications</Text>
                        <Text style={styles.emptyText}>
                            You're all caught up! Notifications about your applications, shifts, and organizations will appear here.
                        </Text>
                    </View>
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },

    headerBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: COLORS.surface,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    unreadBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    unreadLabel: { color: COLORS.text, fontSize: 14, fontWeight: '600' },

    list: { paddingHorizontal: 0 },
    separator: { backgroundColor: COLORS.border, height: 1 },

    notifItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 16,
        backgroundColor: COLORS.surface,
    },
    notifUnread: {
        backgroundColor: COLORS.primary + '06',
    },
    iconBg: {
        width: 40, height: 40, borderRadius: 12,
        justifyContent: 'center', alignItems: 'center',
        marginRight: 12, flexShrink: 0,
    },
    notifContent: { flex: 1, minWidth: 0 },
    notifTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    notifTitle: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '500', flex: 1 },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary, flexShrink: 0 },
    notifMessage: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 4 },
    notifMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
    sender: { color: COLORS.primary, fontSize: 12, fontWeight: '600' },
    time: { color: COLORS.textSecondary, fontSize: 11 },

    empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
    emptyTitle: { color: COLORS.text, fontWeight: '700', fontSize: 18, marginTop: 14 },
    emptyText: { color: COLORS.textSecondary, marginTop: 8, textAlign: 'center', lineHeight: 20, fontSize: 14 },
});
