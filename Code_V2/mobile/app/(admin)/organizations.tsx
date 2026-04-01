import { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert, RefreshControl } from 'react-native';
import { Text, TextInput, Button, Card, Surface, ActivityIndicator, Chip, SegmentedButtons, Portal, Modal } from 'react-native-paper';
import { COLORS } from '../../constants/config';
import { useAuthStore } from '../../stores/authStore';
import { adminService, OrganizationSummary } from '../../services/admin';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const STATUS_COLOR: Record<string, string> = {
    PendingApproval: COLORS.warning,
    Approved: COLORS.success,
    Rejected: COLORS.error,
    Suspended: COLORS.error,
};

export default function OrganizationsScreen() {
    const { logout } = useAuthStore();
    const [tab, setTab] = useState('pending');
    const [pendingOrgs, setPendingOrgs] = useState<OrganizationSummary[]>([]);
    const [allOrgs, setAllOrgs] = useState<OrganizationSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingActionId, setLoadingActionId] = useState<string | null>(null);
    const [rejectReason, setRejectReason] = useState<{ [id: string]: string }>({});

    // Reassign coordinator modal
    const [showReassign, setShowReassign] = useState(false);
    const [reassignOrgId, setReassignOrgId] = useState('');
    const [reassignUserId, setReassignUserId] = useState('');
    const [reassigning, setReassigning] = useState(false);

    // Add coordinator modal
    const [showAddCoord, setShowAddCoord] = useState(false);
    const [addCoordOrgId, setAddCoordOrgId] = useState('');
    const [addCoordUserId, setAddCoordUserId] = useState('');
    const [addingCoord, setAddingCoord] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const [pending, all] = await Promise.all([
                adminService.getPendingOrganizations(),
                adminService.getAllOrganizations().catch(() => []),
            ]);
            setPendingOrgs(pending);
            setAllOrgs(all);
        } catch (err: any) {
            console.error('Admin fetch error', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, [fetchData]);

    const handleApproveOrg = async (orgId: string) => {
        setLoadingActionId(orgId);
        try {
            await adminService.approveOrg(orgId);
            Alert.alert('Success', 'Organization approved!');
            fetchData();
        } catch (err: any) {
            Alert.alert('Error', err.response?.data?.toString() || 'Failed to approve');
        } finally { setLoadingActionId(null); }
    };

    const handleRejectOrg = async (orgId: string) => {
        const reason = rejectReason[orgId] || '';
        if (!reason.trim()) { Alert.alert('Required', 'Please enter a rejection reason.'); return; }
        setLoadingActionId(orgId);
        try {
            await adminService.rejectOrg(orgId, reason);
            Alert.alert('Success', 'Organization rejected');
            fetchData();
        } catch (err: any) {
            Alert.alert('Error', err.response?.data?.toString() || 'Failed to reject');
        } finally { setLoadingActionId(null); }
    };

    const handleReassign = async () => {
        if (!reassignOrgId || !reassignUserId.trim()) return;
        setReassigning(true);
        try {
            await adminService.reassignCoordinator(reassignOrgId, reassignUserId);
            setShowReassign(false);
            Alert.alert('Success', 'Coordinator reassigned');
            fetchData();
        } catch (err: any) {
            Alert.alert('Error', err.response?.data?.toString() || 'Failed to reassign');
        } finally { setReassigning(false); }
    };

    const handleAddCoord = async () => {
        if (!addCoordOrgId || !addCoordUserId.trim()) return;
        setAddingCoord(true);
        try {
            await adminService.addCoordinatorToOrg(addCoordOrgId, addCoordUserId);
            setShowAddCoord(false);
            Alert.alert('Success', 'Coordinator added to organization');
            fetchData();
        } catch (err: any) {
            Alert.alert('Error', err.response?.data?.toString() || 'Failed to add coordinator');
        } finally { setAddingCoord(false); }
    };

    if (loading) {
        return (<View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={COLORS.primary} /></View>);
    }

    const displayOrgs = tab === 'pending' ? pendingOrgs : allOrgs;

    return (
        <View style={styles.container}>
            {/* Header */}
            <Surface style={styles.header} elevation={2}>
                <MaterialCommunityIcons name="shield-crown" size={36} color={COLORS.primary} />
                <Text variant="headlineSmall" style={{ color: COLORS.text, marginTop: 8 }}>Admin Panel</Text>
                <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>Organization Management</Text>
            </Surface>

            <SegmentedButtons
                value={tab}
                onValueChange={setTab}
                buttons={[
                    { value: 'pending', label: `Pending (${pendingOrgs.length})` },
                    { value: 'all', label: `All (${allOrgs.length})` },
                ]}
                style={styles.tabs}
                theme={{ colors: { secondaryContainer: COLORS.primary + '30', onSecondaryContainer: COLORS.primary } }}
            />

            <ScrollView
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
            >
                {displayOrgs.length === 0 ? (
                    <Card style={styles.emptyCard} mode="outlined">
                        <Card.Content style={{ alignItems: 'center', padding: 24 }}>
                            <MaterialCommunityIcons name={tab === 'pending' ? 'check-circle-outline' : 'office-building-outline'} size={48} color={COLORS.textSecondary} />
                            <Text style={{ color: COLORS.textSecondary, marginTop: 12 }}>
                                {tab === 'pending' ? 'No pending organizations to review.' : 'No organizations found.'}
                            </Text>
                        </Card.Content>
                    </Card>
                ) : (
                    displayOrgs.map(org => {
                        const statusColor = STATUS_COLOR[org.status] || COLORS.textSecondary;
                        const isPending = org.status === 'PendingApproval';

                        return (
                            <Card key={org.orgId} style={styles.card} mode="outlined">
                                <Card.Content>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                        <Text style={styles.cardTitle}>{org.name}</Text>
                                        <Chip compact style={{ backgroundColor: statusColor + '18' }} textStyle={{ color: statusColor, fontSize: 10 }}>{org.status}</Chip>
                                    </View>
                                    <Text style={styles.cardDesc}>{org.description}</Text>
                                    <Text style={styles.cardMeta}>Created: {new Date(org.createdAt).toLocaleDateString()}</Text>
                                    {org.proofUrl ? <Text style={{ color: COLORS.primary, fontSize: 12, marginBottom: 8 }}>📎 Proof: {org.proofUrl}</Text> : null}

                                    {isPending && (
                                        <>
                                            <TextInput
                                                label="Rejection Reason"
                                                value={rejectReason[org.orgId] || ''}
                                                onChangeText={(text) => setRejectReason(prev => ({ ...prev, [org.orgId]: text }))}
                                                mode="outlined"
                                                style={styles.input}
                                                outlineColor={COLORS.border}
                                                activeOutlineColor={COLORS.primary}
                                                textColor={COLORS.text}
                                            />
                                            <View style={styles.btnRow}>
                                                <Button mode="contained" buttonColor={COLORS.success} onPress={() => handleApproveOrg(org.orgId)}
                                                    loading={loadingActionId === org.orgId} disabled={!!loadingActionId} style={styles.btn}>Approve</Button>
                                                <Button mode="contained" buttonColor={COLORS.error} onPress={() => handleRejectOrg(org.orgId)}
                                                    loading={loadingActionId === org.orgId} disabled={!!loadingActionId} style={styles.btn}>Reject</Button>
                                            </View>
                                        </>
                                    )}

                                    {!isPending && (
                                        <View style={styles.btnRow}>
                                            <Button compact icon="account-switch" mode="outlined" onPress={() => { setReassignOrgId(org.orgId); setReassignUserId(''); setShowReassign(true); }}>Reassign</Button>
                                            <Button compact icon="account-plus" mode="outlined" onPress={() => { setAddCoordOrgId(org.orgId); setAddCoordUserId(''); setShowAddCoord(true); }}>Add Coord</Button>
                                        </View>
                                    )}
                                </Card.Content>
                            </Card>
                        );
                    })
                )}

                <Button mode="outlined" onPress={logout} textColor={COLORS.error} style={{ marginTop: 24, marginBottom: 40, borderColor: COLORS.error }}>Logout</Button>
            </ScrollView>

            <Portal>
                {/* Reassign Coordinator */}
                <Modal visible={showReassign} onDismiss={() => setShowReassign(false)} contentContainerStyle={styles.modal}>
                    <Text variant="titleLarge" style={{ color: COLORS.text, marginBottom: 8 }}>Reassign Coordinator</Text>
                    <Text style={{ color: COLORS.textSecondary, marginBottom: 16, fontSize: 13 }}>Enter the User ID of the new primary coordinator for this organization.</Text>
                    <TextInput label="Coordinator User ID" value={reassignUserId} onChangeText={setReassignUserId} mode="outlined" style={styles.input} outlineColor={COLORS.border} activeOutlineColor={COLORS.primary} textColor={COLORS.text} />
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                        <Button mode="outlined" onPress={() => setShowReassign(false)} textColor={COLORS.textSecondary} style={{ flex: 1 }}>Cancel</Button>
                        <Button mode="contained" onPress={handleReassign} loading={reassigning} disabled={!reassignUserId.trim() || reassigning} buttonColor={COLORS.primary} style={{ flex: 1 }}>Reassign</Button>
                    </View>
                </Modal>

                {/* Add Coordinator */}
                <Modal visible={showAddCoord} onDismiss={() => setShowAddCoord(false)} contentContainerStyle={styles.modal}>
                    <Text variant="titleLarge" style={{ color: COLORS.text, marginBottom: 8 }}>Add Coordinator</Text>
                    <Text style={{ color: COLORS.textSecondary, marginBottom: 16, fontSize: 13 }}>Add an additional coordinator to this organization.</Text>
                    <TextInput label="Coordinator User ID" value={addCoordUserId} onChangeText={setAddCoordUserId} mode="outlined" style={styles.input} outlineColor={COLORS.border} activeOutlineColor={COLORS.primary} textColor={COLORS.text} />
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                        <Button mode="outlined" onPress={() => setShowAddCoord(false)} textColor={COLORS.textSecondary} style={{ flex: 1 }}>Cancel</Button>
                        <Button mode="contained" onPress={handleAddCoord} loading={addingCoord} disabled={!addCoordUserId.trim() || addingCoord} buttonColor={COLORS.primary} style={{ flex: 1 }}>Add</Button>
                    </View>
                </Modal>
            </Portal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    header: { alignItems: 'center', padding: 20, borderRadius: 16, backgroundColor: COLORS.surface, margin: 16, marginBottom: 0 },
    tabs: { marginHorizontal: 16, marginTop: 12 },
    content: { padding: 16 },
    emptyCard: { backgroundColor: COLORS.surfaceLight, borderColor: COLORS.border, marginBottom: 16 },
    card: { marginBottom: 16, backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 12 },
    cardTitle: { color: COLORS.text, fontWeight: 'bold', fontSize: 16, marginBottom: 4, flex: 1 },
    cardDesc: { color: COLORS.textSecondary, marginBottom: 8 },
    cardMeta: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 12 },
    input: { marginBottom: 12, backgroundColor: COLORS.surfaceLight, height: 40 },
    btnRow: { flexDirection: 'row', gap: 12 },
    btn: { flex: 1 },
    modal: { backgroundColor: COLORS.surface, padding: 24, margin: 20, borderRadius: 16 },
});
