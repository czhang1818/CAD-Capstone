import { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Text, Surface, Card, Chip, ActivityIndicator, Button, Badge } from 'react-native-paper';
import { router } from 'expo-router';
import { COLORS } from '../../constants/config';
import { useAuthStore } from '../../stores/authStore';
import { volunteerService, VolunteerProfile } from '../../services/volunteers';
import { notificationService } from '../../services/notifications';
import { AttendanceSummary } from '../../types/attendance';
import { AttendanceStatus } from '../../types/enums';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const STATUS_COLOR: Record<string, string> = {
    [AttendanceStatus.CheckedIn]: COLORS.primary,
    [AttendanceStatus.CheckedOut]: COLORS.success,
    [AttendanceStatus.Confirmed]: COLORS.success,
    [AttendanceStatus.Pending]: COLORS.warning,
    [AttendanceStatus.Disputed]: COLORS.error,
    [AttendanceStatus.Resolved]: COLORS.textSecondary,
};

const STATUS_ICON: Record<string, string> = {
    [AttendanceStatus.CheckedIn]: 'login',
    [AttendanceStatus.CheckedOut]: 'logout',
    [AttendanceStatus.Confirmed]: 'check-decagram',
    [AttendanceStatus.Pending]: 'clock-outline',
    [AttendanceStatus.Disputed]: 'alert-circle-outline',
    [AttendanceStatus.Resolved]: 'check-circle-outline',
};

function StatCard({ icon, value, label, color }: { icon: string; value: number | string; label: string; color: string }) {
    return (
        <Surface style={styles.statCard} elevation={1}>
            <View style={[styles.statIconBg, { backgroundColor: color + '18' }]}>
                <MaterialCommunityIcons name={icon} size={22} color={color} />
            </View>
            <Text variant="headlineSmall" style={[styles.statValue, { color }]}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
        </Surface>
    );
}

function QuickAction({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) {
    return (
        <TouchableOpacity style={styles.actionCard} onPress={onPress}>
            <View style={[styles.actionIconBg, { backgroundColor: color + '18' }]}>
                <MaterialCommunityIcons name={icon} size={26} color={color} />
            </View>
            <Text style={styles.actionLabel}>{label}</Text>
        </TouchableOpacity>
    );
}

export default function DashboardScreen() {
    const { linkedGrainId, email } = useAuthStore();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [profile, setProfile] = useState<VolunteerProfile | null>(null);
    const [attendanceHistory, setAttendanceHistory] = useState<AttendanceSummary[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);

    const load = useCallback(async () => {
        if (!linkedGrainId) { setLoading(false); return; }
        try {
            const [p, attendance, notifCount] = await Promise.all([
                volunteerService.getProfile(linkedGrainId),
                volunteerService.getAttendance(linkedGrainId),
                notificationService.getUnreadCount().catch(() => 0),
            ]);
            setProfile(p);
            setUnreadCount(notifCount);
            setAttendanceHistory(
                attendance
                    .sort((a, b) => {
                        const aTime = a.checkInTime ? new Date(a.checkInTime).getTime() : 0;
                        const bTime = b.checkInTime ? new Date(b.checkInTime).getTime() : 0;
                        return bTime - aTime;
                    })
                    .slice(0, 5)
            );
        } catch (err: any) {
            console.log('Dashboard load error:', err.message);
        } finally {
            setLoading(false);
        }
    }, [linkedGrainId]);

    useEffect(() => { load(); }, [load]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    }, [load]);

    const displayName = profile?.firstName || email?.split('@')[0] || 'Volunteer';

    if (loading) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        >
            {/* Greeting Banner */}
            <View style={styles.heroBanner}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.heroSmall}>Welcome back,</Text>
                    <Text style={styles.heroName}>{displayName} 👋</Text>
                    <Text style={styles.heroSub}>Making a difference, one shift at a time.</Text>
                </View>
                <MaterialCommunityIcons name="hand-heart" size={52} color={COLORS.primary} />
            </View>

            {/* Impact Stats */}
            <Text style={styles.sectionTitle}>Your Impact</Text>
            <View style={styles.statsRow}>
                <StatCard icon="clock-check-outline" value={profile?.totalHours ?? 0} label="Hours" color={COLORS.primary} />
                <StatCard icon="check-decagram" value={profile?.completedOpportunities ?? 0} label="Completed" color={COLORS.success} />
                <StatCard icon="star-four-points" value={profile?.impactScore ?? 0} label="Score" color={COLORS.warning} />
            </View>

            {/* Quick Actions */}
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <Surface style={styles.actionsGrid} elevation={1}>
                <QuickAction icon="compass" label="Explore" color={COLORS.primary} onPress={() => router.push('/(volunteer)/home')} />
                <QuickAction icon="qrcode-scan" label="Check In" color={COLORS.success} onPress={() => router.push('/(volunteer)/checkin')} />
                <View style={{ position: 'relative', flex: 1 }}>
                    <QuickAction icon="bell-outline" label="Inbox" color="#0ea5e9" onPress={() => router.push('/(volunteer)/notifications')} />
                    {unreadCount > 0 && (
                        <Badge size={18} style={styles.badge}>{unreadCount > 9 ? '9+' : unreadCount}</Badge>
                    )}
                </View>
                <QuickAction icon="clipboard-list" label="Apps" color="#7C3AED" onPress={() => router.push('/(volunteer)/my-applications')} />
            </Surface>

            {/* Attendance History */}
            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Attendance History</Text>
                <Button compact textColor={COLORS.primary} onPress={() => router.push('/(volunteer)/attendance')}>
                    View All
                </Button>
            </View>

            {attendanceHistory.length === 0 ? (
                <Card style={styles.emptyCard} mode="outlined">
                    <Card.Content style={styles.emptyContent}>
                        <MaterialCommunityIcons name="calendar-blank-outline" size={48} color={COLORS.border} />
                        <Text style={styles.emptyTitle}>No Attendance Yet</Text>
                        <Text style={styles.emptyText}>Check in to your first shift to see history here.</Text>
                        <Button compact textColor={COLORS.primary} onPress={() => router.push('/(volunteer)/home')} style={{ marginTop: 10 }}>
                            Find Opportunities
                        </Button>
                    </Card.Content>
                </Card>
            ) : (
                attendanceHistory.map(rec => {
                    const color = STATUS_COLOR[rec.status] ?? COLORS.textSecondary;
                    const icon = STATUS_ICON[rec.status] ?? 'clock-outline';
                    return (
                        <Card key={rec.attendanceId} style={styles.historyCard} mode="outlined">
                            <Card.Content style={styles.historyRow}>
                                <View style={[styles.historyIconBg, { backgroundColor: color + '18' }]}>
                                    <MaterialCommunityIcons name={icon} size={20} color={color} />
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={styles.historyTitle} numberOfLines={1}>{rec.opportunityTitle}</Text>
                                    <View style={styles.historyMeta}>
                                        {rec.checkInTime ? (
                                            <Text style={styles.historyDate}>
                                                {new Date(rec.checkInTime).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </Text>
                                        ) : null}
                                        {rec.totalHours > 0 && (
                                            <Text style={styles.historyHours}>{rec.totalHours.toFixed(1)}h</Text>
                                        )}
                                    </View>
                                </View>
                                <Chip
                                    compact
                                    style={[styles.statusChip, { backgroundColor: color + '18' }]}
                                    textStyle={{ color, fontSize: 10, fontWeight: '600' }}
                                >
                                    {rec.status}
                                </Chip>
                            </Card.Content>
                        </Card>
                    );
                })
            )}

            <View style={{ height: 24 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    content: { padding: 16 },

    heroBanner: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: COLORS.surface,
        borderRadius: 16, padding: 20, marginBottom: 20,
        borderWidth: 1, borderColor: COLORS.border,
    },
    heroSmall: { color: COLORS.textSecondary, fontSize: 13 },
    heroName: { color: COLORS.text, fontSize: 22, fontWeight: '700', marginTop: 2 },
    heroSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4 },

    sectionTitle: { color: COLORS.text, fontWeight: '700', fontSize: 15, marginBottom: 10 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },

    statsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
    statCard: {
        flex: 1, alignItems: 'center', padding: 14, borderRadius: 12,
        backgroundColor: COLORS.surface,
    },
    statIconBg: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
    statValue: { fontWeight: '700', fontSize: 20 },
    statLabel: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },

    actionsGrid: {
        flexDirection: 'row', justifyContent: 'space-between',
        backgroundColor: COLORS.surface, borderRadius: 16,
        padding: 16, marginBottom: 20,
    },
    actionCard: { alignItems: 'center', flex: 1 },
    actionIconBg: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
    actionLabel: { color: COLORS.text, fontSize: 11, fontWeight: '600', textAlign: 'center' },
    badge: { position: 'absolute', top: -2, right: 8, backgroundColor: COLORS.error, color: '#fff', fontWeight: '700' },

    emptyCard: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 12 },
    emptyContent: { alignItems: 'center', paddingVertical: 28 },
    emptyTitle: { color: COLORS.text, fontWeight: '700', fontSize: 16, marginTop: 10 },
    emptyText: { color: COLORS.textSecondary, marginTop: 4, textAlign: 'center', fontSize: 13 },

    historyCard: { marginBottom: 8, backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 12 },
    historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    historyIconBg: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    historyTitle: { color: COLORS.text, fontWeight: '600', fontSize: 14 },
    historyMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
    historyDate: { color: COLORS.textSecondary, fontSize: 12 },
    historyHours: { color: COLORS.primary, fontSize: 12, fontWeight: '600' },
    statusChip: { borderRadius: 8, flexShrink: 0 },
});
