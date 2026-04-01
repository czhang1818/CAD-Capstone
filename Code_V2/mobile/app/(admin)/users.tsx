import { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Alert, TextInput as RNTextInput } from 'react-native';
import { Card, Text, Button, Chip, ActivityIndicator, Surface, Portal, Modal, TextInput } from 'react-native-paper';
import { COLORS } from '../../constants/config';
import { adminService, UserRecord } from '../../services/admin';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const ROLES = ['All', 'Volunteer', 'Coordinator', 'SystemAdmin'];
const ASSIGNABLE_ROLES = ['Volunteer', 'Coordinator', 'SystemAdmin'];

const ROLE_COLOR: Record<string, string> = {
    Volunteer: '#1565C0',
    Coordinator: '#4A148C',
    SystemAdmin: '#B71C1C',
};

export default function UsersScreen() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [search, setSearch] = useState('');
    const [selectedRole, setSelectedRole] = useState('All');

    // Reset password modal
    const [showReset, setShowReset] = useState(false);
    const [resetUserId, setResetUserId] = useState('');
    const [resetEmail, setResetEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [resetting, setResetting] = useState(false);

    // Change role modal
    const [showChangeRole, setShowChangeRole] = useState(false);
    const [changeRoleUserId, setChangeRoleUserId] = useState('');
    const [changeRoleEmail, setChangeRoleEmail] = useState('');
    const [newRole, setNewRole] = useState('Volunteer');
    const [changingRole, setChangingRole] = useState(false);

    const fetchUsers = useCallback(async () => {
        try {
            const results = await adminService.getUsers({
                role: selectedRole === 'All' ? undefined : selectedRole,
                search: search.trim() || undefined,
            });
            setUsers(results);
        } catch (err: any) {
            console.log('Fetch users error:', err.message);
        } finally {
            setLoading(false);
        }
    }, [selectedRole, search]);

    useEffect(() => { fetchUsers(); }, [fetchUsers]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchUsers();
        setRefreshing(false);
    }, [fetchUsers]);

    const handleBan = (user: UserRecord) => {
        const action = user.isBanned ? 'unban' : 'ban';
        Alert.alert(
            `${action.charAt(0).toUpperCase() + action.slice(1)} User`,
            `Are you sure you want to ${action} ${user.email}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: action.charAt(0).toUpperCase() + action.slice(1),
                    style: user.isBanned ? 'default' : 'destructive',
                    onPress: async () => {
                        try {
                            if (user.isBanned) await adminService.unbanUser(user.id);
                            else await adminService.banUser(user.id);
                            await fetchUsers();
                        } catch { Alert.alert('Error', `Failed to ${action} user`); }
                    }
                }
            ]
        );
    };

    const handleDelete = (user: UserRecord) => {
        Alert.alert(
            'Delete User',
            `Permanently delete ${user.email}? This action CANNOT be undone.\n\nThe user's email must match to confirm.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await adminService.deleteUser(user.id, user.email);
                            Alert.alert('Deleted', `User ${user.email} has been permanently removed.`);
                            await fetchUsers();
                        } catch (err: any) {
                            Alert.alert('Error', err.response?.data?.toString() || 'Failed to delete user');
                        }
                    }
                }
            ]
        );
    };

    const openResetPassword = (user: UserRecord) => {
        setResetUserId(user.id);
        setResetEmail(user.email);
        setNewPassword('');
        setShowReset(true);
    };

    const handleResetPassword = async () => {
        if (!newPassword.trim() || newPassword.length < 6) {
            Alert.alert('Invalid', 'Password must be at least 6 characters.');
            return;
        }
        setResetting(true);
        try {
            await adminService.resetPassword(resetUserId, newPassword);
            setShowReset(false);
            Alert.alert('Done', `Password reset for ${resetEmail}`);
        } catch (err: any) {
            Alert.alert('Error', err.response?.data?.toString() || 'Failed to reset password');
        } finally { setResetting(false); }
    };

    const openChangeRole = (user: UserRecord) => {
        setChangeRoleUserId(user.id);
        setChangeRoleEmail(user.email);
        setNewRole(user.role);
        setShowChangeRole(true);
    };

    const handleChangeRole = async () => {
        setChangingRole(true);
        try {
            await adminService.changeRole(changeRoleUserId, newRole);
            setShowChangeRole(false);
            Alert.alert('Done', `${changeRoleEmail} role changed to ${newRole}`);
            await fetchUsers();
        } catch (err: any) {
            Alert.alert('Error', err.response?.data?.toString() || 'Failed to change role');
        } finally { setChangingRole(false); }
    };

    if (loading) {
        return (<View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={COLORS.primary} /></View>);
    }

    return (
        <View style={styles.container}>
            {/* Search Bar */}
            <Surface style={styles.searchBar} elevation={2}>
                <MaterialCommunityIcons name="magnify" size={20} color={COLORS.textSecondary} />
                <RNTextInput
                    style={styles.searchInput}
                    placeholder="Search by email..."
                    placeholderTextColor={COLORS.textSecondary}
                    value={search}
                    onChangeText={setSearch}
                    returnKeyType="search"
                    onSubmitEditing={fetchUsers}
                />
            </Surface>

            {/* Role Filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roleRow} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
                {ROLES.map(role => (
                    <Chip key={role} selected={selectedRole === role} onPress={() => setSelectedRole(role)}
                        style={{ backgroundColor: selectedRole === role ? COLORS.primary : COLORS.surface }}
                        textStyle={{ color: selectedRole === role ? '#fff' : COLORS.text }}>{role}</Chip>
                ))}
            </ScrollView>

            {/* User List */}
            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}>
                <Text style={styles.count}>{users.length} users found</Text>
                {users.map(user => (
                    <Card key={user.id} style={styles.card} mode="outlined">
                        <Card.Content>
                            <View style={styles.row}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.email}>{user.email}</Text>
                                    <View style={styles.tagRow}>
                                        <View style={[styles.roleBadge, { backgroundColor: ROLE_COLOR[user.role] ?? '#555' }]}>
                                            <Text style={styles.roleText}>{user.role}</Text>
                                        </View>
                                        {user.isBanned && (
                                            <View style={styles.bannedBadge}><Text style={styles.bannedText}>BANNED</Text></View>
                                        )}
                                    </View>
                                    <Text style={styles.idText}>ID: {user.id.slice(0, 8)}… | Joined: {new Date(user.createdAt).toLocaleDateString()}</Text>
                                </View>
                            </View>
                        </Card.Content>
                        {user.role !== 'SystemAdmin' && (
                            <Card.Actions style={{ flexWrap: 'wrap', gap: 4 }}>
                                <Button compact mode="outlined" onPress={() => handleBan(user)}
                                    textColor={user.isBanned ? COLORS.success : COLORS.error}
                                    style={{ borderColor: user.isBanned ? COLORS.success : COLORS.error }}>
                                    {user.isBanned ? 'Unban' : 'Ban'}
                                </Button>
                                <Button compact mode="outlined" onPress={() => openResetPassword(user)} icon="lock-reset">Reset PW</Button>
                                <Button compact mode="outlined" onPress={() => openChangeRole(user)} icon="account-convert">Role</Button>
                                <Button compact mode="outlined" onPress={() => handleDelete(user)} textColor={COLORS.error} icon="delete">Delete</Button>
                            </Card.Actions>
                        )}
                    </Card>
                ))}
            </ScrollView>

            <Portal>
                {/* Reset Password */}
                <Modal visible={showReset} onDismiss={() => setShowReset(false)} contentContainerStyle={styles.modal}>
                    <Text variant="titleLarge" style={{ color: COLORS.text, marginBottom: 8 }}>Reset Password</Text>
                    <Text style={{ color: COLORS.textSecondary, marginBottom: 16, fontSize: 13 }}>Resetting password for: {resetEmail}</Text>
                    <TextInput label="New Password" value={newPassword} onChangeText={setNewPassword} mode="outlined" secureTextEntry
                        style={styles.input} outlineColor={COLORS.border} activeOutlineColor={COLORS.primary} textColor={COLORS.text} />
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                        <Button mode="outlined" onPress={() => setShowReset(false)} textColor={COLORS.textSecondary} style={{ flex: 1 }}>Cancel</Button>
                        <Button mode="contained" onPress={handleResetPassword} loading={resetting} disabled={!newPassword.trim() || resetting} buttonColor={COLORS.primary} style={{ flex: 1 }}>Reset</Button>
                    </View>
                </Modal>

                {/* Change Role */}
                <Modal visible={showChangeRole} onDismiss={() => setShowChangeRole(false)} contentContainerStyle={styles.modal}>
                    <Text variant="titleLarge" style={{ color: COLORS.text, marginBottom: 8 }}>Change Role</Text>
                    <Text style={{ color: COLORS.textSecondary, marginBottom: 16, fontSize: 13 }}>Changing role for: {changeRoleEmail}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                        {ASSIGNABLE_ROLES.map(r => (
                            <Chip key={r} selected={newRole === r} onPress={() => setNewRole(r)}
                                style={{ backgroundColor: newRole === r ? COLORS.primary + '30' : COLORS.surfaceLight }}
                                textStyle={{ color: newRole === r ? COLORS.primary : COLORS.textSecondary }}>{r}</Chip>
                        ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <Button mode="outlined" onPress={() => setShowChangeRole(false)} textColor={COLORS.textSecondary} style={{ flex: 1 }}>Cancel</Button>
                        <Button mode="contained" onPress={handleChangeRole} loading={changingRole} disabled={changingRole} buttonColor={COLORS.primary} style={{ flex: 1 }}>Change Role</Button>
                    </View>
                </Modal>
            </Portal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    searchBar: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        margin: 16, marginBottom: 8, padding: 12, borderRadius: 12,
        backgroundColor: COLORS.surface,
    },
    searchInput: { flex: 1, color: COLORS.text, fontSize: 16 },
    roleRow: { flexGrow: 0, paddingVertical: 8 },
    list: { padding: 16, gap: 8 },
    count: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 4 },
    card: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 12 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    email: { color: COLORS.text, fontWeight: 'bold', fontSize: 15, marginBottom: 4 },
    tagRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
    roleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
    roleText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
    bannedBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: COLORS.error },
    bannedText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
    idText: { color: COLORS.textSecondary, fontSize: 11 },
    modal: { backgroundColor: COLORS.surface, padding: 24, margin: 20, borderRadius: 16 },
    input: { marginBottom: 12, backgroundColor: COLORS.surfaceLight },
});
