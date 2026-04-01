import { useState, useCallback, useEffect } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Card, Text, Button, ActivityIndicator, Portal, Modal, TextInput, SegmentedButtons, Chip } from 'react-native-paper';
import { COLORS } from '../../constants/config';
import { useAuthStore } from '../../stores/authStore';
import { organizationService } from '../../services/organizations';
import { applicationService } from '../../services/applications';
import { ApplicationStatus } from '../../types/enums';
import { ApplicationSummary } from '../../types/application';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const STATUS_CHIP: Record<string, { color: string; bg: string }> = {
    [ApplicationStatus.Pending]: { color: COLORS.warning, bg: COLORS.warning + '18' },
    [ApplicationStatus.Approved]: { color: COLORS.success, bg: COLORS.success + '18' },
    [ApplicationStatus.Promoted]: { color: COLORS.success, bg: COLORS.success + '18' },
    [ApplicationStatus.Rejected]: { color: COLORS.error, bg: COLORS.error + '18' },
    [ApplicationStatus.Waitlisted]: { color: COLORS.secondary, bg: COLORS.secondary + '18' },
    [ApplicationStatus.NoShow]: { color: COLORS.error, bg: COLORS.error + '18' },
    [ApplicationStatus.Withdrawn]: { color: COLORS.textSecondary, bg: COLORS.surfaceLight },
};

export default function ApplicationsScreen() {
    const { linkedGrainId } = useAuthStore();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [allApps, setAllApps] = useState<ApplicationSummary[]>([]);
    const [tab, setTab] = useState('pending');

    // Reject modal state
    const [showReject, setShowReject] = useState(false);
    const [rejectAppId, setRejectAppId] = useState('');
    const [rejectReason, setRejectReason] = useState('');
    const [rejecting, setRejecting] = useState(false);

    const fetchApps = useCallback(async () => {
        try {
            if (!linkedGrainId) return;
            const apps = await organizationService.getApplications(linkedGrainId);
            setAllApps(apps);
        } catch (err: any) {
            console.log('Fetch error:', err.message);
        } finally {
            setLoading(false);
        }
    }, [linkedGrainId]);

    useEffect(() => { fetchApps(); }, [fetchApps]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchApps();
        setRefreshing(false);
    }, [fetchApps]);

    const filtered = allApps.filter(a => {
        if (tab === 'pending') return a.status === ApplicationStatus.Pending;
        if (tab === 'waitlisted') return a.status === ApplicationStatus.Waitlisted;
        return true; // all
    });

    const handleApprove = (app: ApplicationSummary) => {
        Alert.alert('Approve', `Approve ${app.volunteerName || 'this volunteer'} for "${app.opportunityTitle}"?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Approve', onPress: async () => {
                try { await applicationService.approve(app.applicationId); Alert.alert('Approved! ✅'); await fetchApps(); }
                catch { Alert.alert('Error', 'Failed to approve'); }
            }},
        ]);
    };

    const openReject = (appId: string) => {
        setRejectAppId(appId); setRejectReason(''); setShowReject(true);
    };

    const handleRejectSubmit = async () => {
        if (!rejectReason.trim()) { Alert.alert('Required', 'Please provide a reason.'); return; }
        setRejecting(true);
        try { await applicationService.reject(rejectAppId, rejectReason); setShowReject(false); Alert.alert('Rejected'); await fetchApps(); }
        catch { Alert.alert('Error', 'Failed to reject'); }
        finally { setRejecting(false); }
    };

    const handlePromote = async (app: ApplicationSummary) => {
        try { await applicationService.promote(app.applicationId); Alert.alert('Promoted', 'Volunteer moved from waitlist to approved.'); await fetchApps(); }
        catch { Alert.alert('Error', 'Failed to promote'); }
    };

    const handleWaitlist = async (app: ApplicationSummary) => {
        try { await applicationService.waitlist(app.applicationId); Alert.alert('Waitlisted'); await fetchApps(); }
        catch { Alert.alert('Error', 'Failed to waitlist'); }
    };

    if (loading) {
        return (<View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={COLORS.primary} /></View>);
    }

    const pendingCount = allApps.filter(a => a.status === ApplicationStatus.Pending).length;
    const waitlistCount = allApps.filter(a => a.status === ApplicationStatus.Waitlisted).length;

    return (
        <View style={styles.container}>
            <SegmentedButtons
                value={tab}
                onValueChange={setTab}
                buttons={[
                    { value: 'pending', label: `Pending (${pendingCount})` },
                    { value: 'waitlisted', label: `Waitlist (${waitlistCount})` },
                    { value: 'all', label: `All (${allApps.length})` },
                ]}
                style={styles.tabs}
                theme={{ colors: { secondaryContainer: COLORS.primary + '30', onSecondaryContainer: COLORS.primary } }}
            />

            <FlatList
                data={filtered}
                keyExtractor={item => item.applicationId}
                contentContainerStyle={styles.list}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
                renderItem={({ item }) => {
                    const chipStyle = STATUS_CHIP[item.status] || { color: COLORS.textSecondary, bg: COLORS.surfaceLight };
                    const isPending = item.status === ApplicationStatus.Pending;
                    const isWaitlisted = item.status === ApplicationStatus.Waitlisted;

                    return (
                        <Card style={styles.card} mode="outlined">
                            <Card.Content>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <Text variant="titleMedium" style={styles.name}>
                                        {item.volunteerName || `Volunteer ${item.volunteerId.substring(0, 8)}…`}
                                    </Text>
                                    <Chip compact style={{ backgroundColor: chipStyle.bg }} textStyle={{ color: chipStyle.color, fontSize: 10 }}>{item.status}</Chip>
                                </View>
                                <Text style={styles.meta}>📋 {item.opportunityTitle}</Text>
                                <Text style={styles.meta}>🕑 {item.shiftName} — {new Date(item.shiftStartTime).toLocaleDateString()}</Text>
                                <Text style={styles.date}>Applied {new Date(item.appliedAt).toLocaleDateString()}</Text>
                            </Card.Content>
                            {(isPending || isWaitlisted) && (
                                <Card.Actions>
                                    <Button compact textColor={COLORS.error} icon="close-circle-outline" onPress={() => openReject(item.applicationId)}>Reject</Button>
                                    {isPending && (
                                        <>
                                            <Button compact onPress={() => handleWaitlist(item)}>Waitlist</Button>
                                            <Button compact mode="contained" buttonColor={COLORS.success} icon="check-circle-outline" onPress={() => handleApprove(item)}>Approve</Button>
                                        </>
                                    )}
                                    {isWaitlisted && (
                                        <Button compact mode="contained" buttonColor={COLORS.primary} icon="arrow-up-bold" onPress={() => handlePromote(item)}>Promote</Button>
                                    )}
                                </Card.Actions>
                            )}
                        </Card>
                    );
                }}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <MaterialCommunityIcons name="clipboard-check-outline" size={56} color={COLORS.textSecondary} />
                        <Text style={styles.emptyTitle}>
                            {tab === 'pending' ? 'All caught up! 🎉' : tab === 'waitlisted' ? 'No waitlisted applications' : 'No applications yet'}
                        </Text>
                        <Text style={styles.emptyText}>
                            {tab === 'pending' ? 'No pending applications to review.' : 'Pull down to refresh.'}
                        </Text>
                    </View>
                }
            />

            {/* Reject Reason Modal */}
            <Portal>
                <Modal visible={showReject} onDismiss={() => setShowReject(false)} contentContainerStyle={styles.modal}>
                    <Text variant="titleLarge" style={{ color: COLORS.text, marginBottom: 8 }}>Reject Application</Text>
                    <Text style={{ color: COLORS.textSecondary, marginBottom: 16, lineHeight: 20 }}>
                        Provide a reason so the volunteer understands why their application was not accepted.
                    </Text>
                    <TextInput label="Reason for rejection *" value={rejectReason} onChangeText={setRejectReason} mode="outlined" multiline numberOfLines={3} style={styles.input} outlineColor={COLORS.border} activeOutlineColor={COLORS.error} textColor={COLORS.text} />
                    <Button mode="contained" onPress={handleRejectSubmit} loading={rejecting} disabled={!rejectReason.trim() || rejecting} buttonColor={COLORS.error} style={{ marginTop: 8 }}>Confirm Reject</Button>
                    <Button onPress={() => setShowReject(false)} textColor={COLORS.textSecondary} style={{ marginTop: 8 }}>Cancel</Button>
                </Modal>
            </Portal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    tabs: { marginHorizontal: 16, marginTop: 16 },
    list: { padding: 16 },
    card: { marginBottom: 12, backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 12 },
    name: { color: COLORS.text, marginBottom: 4, flex: 1 },
    meta: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4 },
    date: { color: COLORS.textSecondary, fontSize: 11, marginTop: 6, fontStyle: 'italic' },
    empty: { alignItems: 'center', paddingTop: 60 },
    emptyTitle: { color: COLORS.text, fontWeight: 'bold', fontSize: 18, marginTop: 12 },
    emptyText: { color: COLORS.textSecondary, marginTop: 4 },
    modal: { backgroundColor: COLORS.surface, padding: 24, margin: 20, borderRadius: 16 },
    input: { marginBottom: 12, backgroundColor: COLORS.surfaceLight },
});
