import { useState, useEffect, useCallback } from 'react';
import { View, FlatList, StyleSheet, ScrollView, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { Text, Card, Chip, Button, Surface, FAB, Portal, Modal, TextInput, ActivityIndicator, Divider, Checkbox } from 'react-native-paper';
import { useLocalSearchParams, router } from 'expo-router';
import { COLORS } from '../../../constants/config';
import { useAuthStore } from '../../../stores/authStore';
import { opportunityService } from '../../../services/opportunities';
import { applicationService } from '../../../services/applications';
import { attendanceService } from '../../../services/attendance';
import { skillService, Skill } from '../../../services/skills';
import { certificateService, CertificateTemplate } from '../../../services/certificates';
import { taskService, EventTask } from '../../../services/tasks';
import { OpportunityState, Shift } from '../../../types/opportunity';
import { ApplicationSummary } from '../../../types/application';
import { OpportunityStatus, ApplicationStatus } from '../../../types/enums';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const STATUS_COLORS: Record<string, string> = {
    [OpportunityStatus.Draft]: COLORS.textSecondary,
    [OpportunityStatus.Published]: COLORS.success,
    [OpportunityStatus.InProgress]: COLORS.primary,
    [OpportunityStatus.Completed]: '#4CAF50',
    [OpportunityStatus.Cancelled]: COLORS.error,
};

export default function OpportunityDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { linkedGrainId, email } = useAuthStore();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [opp, setOpp] = useState<OpportunityState | null>(null);
    const [applications, setApplications] = useState<ApplicationSummary[]>([]);
    const [actionLoading, setActionLoading] = useState(false);

    // Add Shift
    const [showAddShift, setShowAddShift] = useState(false);
    const [shiftName, setShiftName] = useState('');
    const [shiftStart, setShiftStart] = useState('');
    const [shiftEnd, setShiftEnd] = useState('');
    const [shiftCapacity, setShiftCapacity] = useState('10');

    // Edit Shift
    const [showEditShift, setShowEditShift] = useState(false);
    const [editShiftId, setEditShiftId] = useState('');
    const [editShiftName, setEditShiftName] = useState('');
    const [editShiftStart, setEditShiftStart] = useState('');
    const [editShiftEnd, setEditShiftEnd] = useState('');
    const [editShiftCapacity, setEditShiftCapacity] = useState('10');

    // Cancel
    const [showCancel, setShowCancel] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [cancelling, setCancelling] = useState(false);

    // Skills
    const [showSkills, setShowSkills] = useState(false);
    const [allSkills, setAllSkills] = useState<Skill[]>([]);
    const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(new Set());
    const [savingSkills, setSavingSkills] = useState(false);

    // Issue Certificate
    const [showIssueCert, setShowIssueCert] = useState(false);
    const [certTemplates, setCertTemplates] = useState<CertificateTemplate[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
    const [certTargetVolunteerId, setCertTargetVolunteerId] = useState<string | null>(null);
    const [certTargetName, setCertTargetName] = useState<string>('');
    const [issuingCert, setIssuingCert] = useState(false);

    // Edit Info
    const [showEditInfo, setShowEditInfo] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editCategory, setEditCategory] = useState('');
    const [savingInfo, setSavingInfo] = useState(false);

    // Notify Volunteers
    const [showNotify, setShowNotify] = useState(false);
    const [notifyMsg, setNotifyMsg] = useState('');
    const [notifyTarget, setNotifyTarget] = useState<'Approved' | 'All'>('All');
    const [sending, setSending] = useState(false);

    // Tasks
    const [tasks, setTasks] = useState<EventTask[]>([]);
    const [showAddTask, setShowAddTask] = useState(false);
    const [taskTitle, setTaskTitle] = useState('');
    const [taskNote, setTaskNote] = useState('');

    const fetchOpp = useCallback(async () => {
        try {
            if (!id) return;
            const [data, apps, taskList] = await Promise.all([
                opportunityService.getById(id),
                applicationService.getForOpportunity(id),
                taskService.getForOpportunity(id).catch(() => [] as EventTask[]),
            ]);
            setOpp(data);
            setApplications(apps);
            setTasks(taskList);
        } catch (err: any) {
            Alert.alert('Error', 'Failed to load opportunity');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { fetchOpp(); }, [fetchOpp]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchOpp();
        setRefreshing(false);
    }, [fetchOpp]);

    // ── Actions ──────────────────────────────────────────────────────
    const handlePublish = async () => {
        if (!id) return;
        setActionLoading(true);
        try {
            await opportunityService.publish(id);
            Alert.alert('Success', 'Opportunity published!');
            await fetchOpp();
        } catch (err: any) {
            Alert.alert('Error', err.response?.data?.toString() || 'Failed to publish');
        } finally { setActionLoading(false); }
    };

    const handleCancelSubmit = async () => {
        if (!id || !cancelReason) return;
        setCancelling(true);
        try {
            await opportunityService.cancel(id, cancelReason);
            setShowCancel(false);
            Alert.alert('Done', 'Opportunity cancelled');
            await fetchOpp();
        } catch (err: any) {
            Alert.alert('Error', err.response?.data?.toString() || 'Failed to cancel');
        } finally { setCancelling(false); }
    };

    const handleRecover = async () => {
        if (!id) return;
        Alert.alert('Recover', 'Re-open this cancelled opportunity?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Recover', onPress: async () => {
                try { await opportunityService.recover(id); Alert.alert('Done', 'Opportunity recovered to Draft'); await fetchOpp(); }
                catch { Alert.alert('Error', 'Failed to recover'); }
            }},
        ]);
    };

    const handleClone = async () => {
        if (!id) return;
        Alert.alert('Clone', 'Create a copy of this opportunity?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Clone', onPress: async () => {
                try {
                    const result = await opportunityService.clone(id);
                    Alert.alert('Cloned!', `New opportunity created.`);
                    router.push({ pathname: '/(coordinator)/opportunities/[id]', params: { id: result.opportunityId } });
                } catch { Alert.alert('Error', 'Failed to clone'); }
            }},
        ]);
    };

    // ── Shifts ───────────────────────────────────────────────────────
    const handleAddShift = async () => {
        if (!shiftName || !shiftStart || !shiftEnd || !id) return;
        setActionLoading(true);
        try {
            await opportunityService.addShift(id, {
                name: shiftName,
                startTime: new Date(shiftStart).toISOString(),
                endTime: new Date(shiftEnd).toISOString(),
                maxCapacity: parseInt(shiftCapacity) || 10,
            });
            setShowAddShift(false);
            setShiftName(''); setShiftStart(''); setShiftEnd(''); setShiftCapacity('10');
            Alert.alert('Success', 'Shift added!');
            await fetchOpp();
        } catch (err: any) {
            Alert.alert('Error', err.response?.data?.toString() || 'Failed to add shift');
        } finally { setActionLoading(false); }
    };

    const openEditShift = (shift: Shift) => {
        setEditShiftId(shift.shiftId);
        setEditShiftName(shift.name);
        setEditShiftStart(new Date(shift.startTime).toISOString().slice(0, 16).replace('T', ' '));
        setEditShiftEnd(new Date(shift.endTime).toISOString().slice(0, 16).replace('T', ' '));
        setEditShiftCapacity(String(shift.maxCapacity));
        setShowEditShift(true);
    };

    const handleEditShift = async () => {
        if (!id || !editShiftId || !editShiftName || !editShiftStart || !editShiftEnd) return;
        setActionLoading(true);
        try {
            await opportunityService.updateShift(id, editShiftId, {
                name: editShiftName,
                startTime: new Date(editShiftStart).toISOString(),
                endTime: new Date(editShiftEnd).toISOString(),
                maxCapacity: parseInt(editShiftCapacity) || 10,
            });
            setShowEditShift(false);
            Alert.alert('Success', 'Shift updated!');
            await fetchOpp();
        } catch (err: any) {
            Alert.alert('Error', err.response?.data?.toString() || 'Failed to update shift');
        } finally { setActionLoading(false); }
    };

    const handleRemoveShift = (shift: Shift) => {
        if (!id) return;
        Alert.alert('Remove Shift', `Delete "${shift.name}"?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => {
                try { await opportunityService.removeShift(id, shift.shiftId); Alert.alert('Deleted'); await fetchOpp(); }
                catch { Alert.alert('Error', 'Failed to delete shift'); }
            }},
        ]);
    };

    // ── Applications ─────────────────────────────────────────────────
    const handleApproveApp = async (appId: string) => {
        try { await applicationService.approve(appId); Alert.alert('Approved'); await fetchOpp(); }
        catch { Alert.alert('Error', 'Failed to approve'); }
    };

    const handleRejectApp = async (appId: string) => {
        try { await applicationService.reject(appId, 'Rejected by coordinator'); Alert.alert('Rejected'); await fetchOpp(); }
        catch { Alert.alert('Error', 'Failed to reject'); }
    };

    const handlePromoteApp = async (appId: string) => {
        try { await applicationService.promote(appId); Alert.alert('Promoted', 'Volunteer promoted from waitlist'); await fetchOpp(); }
        catch { Alert.alert('Error', 'Failed to promote'); }
    };

    const handleWaitlistApp = async (appId: string) => {
        try { await applicationService.waitlist(appId); Alert.alert('Waitlisted'); await fetchOpp(); }
        catch { Alert.alert('Error', 'Failed to waitlist'); }
    };

    // ── Skills ───────────────────────────────────────────────────────
    const openSkillsModal = async () => {
        try { const list = await skillService.getAll(); setAllSkills(list); setSelectedSkillIds(new Set(opp?.requiredSkillIds || [])); setShowSkills(true); }
        catch { Alert.alert('Error', 'Failed to load skills'); }
    };

    const handleSaveSkills = async () => {
        if (!id) return;
        setSavingSkills(true);
        try { await skillService.setRequiredSkills(id, Array.from(selectedSkillIds)); setShowSkills(false); Alert.alert('Success', 'Required skills updated'); await fetchOpp(); }
        catch { Alert.alert('Error', 'Failed to save skills'); }
        finally { setSavingSkills(false); }
    };

    const toggleSkill = (skillId: string) => {
        setSelectedSkillIds(prev => { const n = new Set(prev); if (n.has(skillId)) n.delete(skillId); else n.add(skillId); return n; });
    };

    // ── Edit Info ────────────────────────────────────────────────────
    const openEditInfo = () => {
        setEditTitle(opp?.info.title || '');
        setEditDesc(opp?.info.description || '');
        setEditCategory(opp?.info.category || '');
        setShowEditInfo(true);
    };

    const handleSaveInfo = async () => {
        if (!id || !editTitle) return;
        setSavingInfo(true);
        try {
            await opportunityService.updateInfo(id, { title: editTitle, description: editDesc, category: editCategory });
            setShowEditInfo(false);
            Alert.alert('Success', 'Opportunity updated!');
            await fetchOpp();
        } catch (err: any) {
            Alert.alert('Error', err.response?.data?.toString() || 'Failed to update');
        } finally { setSavingInfo(false); }
    };

    // ── Notify ───────────────────────────────────────────────────────
    const handleNotify = async () => {
        if (!id || !notifyMsg) return;
        setSending(true);
        try {
            const res = await opportunityService.notifyVolunteers(id, { message: notifyMsg, targetStatus: notifyTarget });
            setShowNotify(false);
            setNotifyMsg('');
            Alert.alert('Sent!', `Notification sent to ${res.sent} volunteer(s).`);
        } catch (err: any) {
            Alert.alert('Error', err.response?.data?.toString() || 'Failed to send');
        } finally { setSending(false); }
    };

    // ── Certificate ──────────────────────────────────────────────────
    const openIssueCert = async (volunteerId: string, volunteerName: string) => {
        try { const list = await certificateService.getTemplates(); setCertTemplates(list); setSelectedTemplateId(list.length > 0 ? list[0].id : null); setCertTargetVolunteerId(volunteerId); setCertTargetName(volunteerName); setShowIssueCert(true); }
        catch { Alert.alert('Error', 'Failed to load templates'); }
    };

    const handleIssueCert = async () => {
        if (!certTargetVolunteerId || !selectedTemplateId) return;
        setIssuingCert(true);
        try {
            const result = await certificateService.generate(certTargetVolunteerId, selectedTemplateId);
            setShowIssueCert(false);
            Alert.alert('Certificate Issued!', `Certificate generated for ${certTargetName}.\n\nDownload URL:\n${result.downloadUrl}`);
        } catch (err: any) {
            Alert.alert('Error', err.response?.data?.toString() || 'Failed to generate');
        } finally { setIssuingCert(false); }
    };

    // ── Tasks ────────────────────────────────────────────────────────
    const handleAddTask = async () => {
        if (!id || !taskTitle || !linkedGrainId) return;
        try {
            await taskService.create(id, { title: taskTitle, note: taskNote || undefined, createdByGrainId: linkedGrainId, createdByEmail: email || undefined });
            setShowAddTask(false);
            setTaskTitle('');
            setTaskNote('');
            await fetchOpp();
        } catch { Alert.alert('Error', 'Failed to create task'); }
    };

    const handleToggleTask = async (task: EventTask) => {
        if (!id) return;
        try { const updated = await taskService.toggleComplete(id, task.id); setTasks(prev => prev.map(t => t.id === task.id ? updated : t)); }
        catch { Alert.alert('Error', 'Failed to update task'); }
    };

    const handleDeleteTask = (task: EventTask) => {
        if (!id) return;
        Alert.alert('Delete Task', `Delete "${task.title}"?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => {
                try { await taskService.delete(id, task.id); setTasks(prev => prev.filter(t => t.id !== task.id)); }
                catch { Alert.alert('Error', 'Failed to delete'); }
            }},
        ]);
    };

    // ── Loading ──────────────────────────────────────────────────────
    if (loading) {
        return (<View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={COLORS.primary} /></View>);
    }
    if (!opp) {
        return (<View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><Text style={{ color: COLORS.textSecondary }}>Opportunity not found</Text></View>);
    }

    const pendingApps = applications.filter(a => a.status === ApplicationStatus.Pending);
    const waitlistedApps = applications.filter(a => a.status === ApplicationStatus.Waitlisted);
    const confirmedApps = applications.filter(a => a.status === ApplicationStatus.Promoted || a.status === ApplicationStatus.Approved);
    const isCancelled = opp.status === OpportunityStatus.Cancelled;

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}>
                {/* Header */}
                <Surface style={styles.header} elevation={2}>
                    <View style={styles.titleRow}>
                        <Text variant="headlineSmall" style={styles.title}>{opp.info.title}</Text>
                        <Chip compact style={{ backgroundColor: (STATUS_COLORS[opp.status] || COLORS.textSecondary) + '20' }}
                            textStyle={{ color: STATUS_COLORS[opp.status], fontSize: 12 }}>{opp.status}</Chip>
                    </View>
                    <Chip compact icon="tag" style={styles.categoryChip} textStyle={{ color: COLORS.primary, fontSize: 11 }}>{opp.info.category}</Chip>
                    <Text style={styles.desc}>{opp.info.description}</Text>
                    <View style={styles.statsRow}>
                        <View style={styles.stat}><MaterialCommunityIcons name="clock-outline" size={18} color={COLORS.primary} /><Text style={styles.statText}>{opp.shifts.length} shifts</Text></View>
                        <View style={styles.stat}><MaterialCommunityIcons name="account-check" size={18} color={COLORS.success} /><Text style={styles.statText}>{opp.confirmedVolunteerIds.length} confirmed</Text></View>
                        <View style={styles.stat}><MaterialCommunityIcons name="account-clock" size={18} color={COLORS.warning} /><Text style={styles.statText}>{waitlistedApps.length} waitlisted</Text></View>
                    </View>
                </Surface>

                {/* Actions */}
                <View style={styles.actions}>
                    {opp.status === OpportunityStatus.Draft && (
                        <>
                            <Button mode="contained" buttonColor={COLORS.success} onPress={handlePublish} loading={actionLoading} icon="publish" style={styles.actionBtn}>Publish</Button>
                            <Button mode="outlined" onPress={openEditInfo} icon="pencil" style={styles.actionBtn}>Edit</Button>
                        </>
                    )}
                    {opp.status === OpportunityStatus.Published && (
                        <>
                            <Button mode="outlined" onPress={openEditInfo} icon="pencil" style={styles.actionBtn}>Edit</Button>
                            <Button mode="outlined" onPress={() => setShowNotify(true)} icon="bell-ring" style={styles.actionBtn}>Notify</Button>
                        </>
                    )}
                    {isCancelled && (
                        <Button mode="contained" buttonColor={COLORS.success} onPress={handleRecover} icon="refresh" style={styles.actionBtn}>Recover</Button>
                    )}
                </View>
                <View style={styles.actions}>
                    <Button mode="outlined" onPress={openSkillsModal} icon="star-plus" style={styles.actionBtn}>Skills</Button>
                    <Button mode="outlined" onPress={handleClone} icon="content-copy" style={styles.actionBtn}>Clone</Button>
                    {!isCancelled && (
                        <Button mode="outlined" textColor={COLORS.error} onPress={() => { setCancelReason(''); setShowCancel(true); }} icon="cancel" style={styles.actionBtn}>Cancel</Button>
                    )}
                </View>

                {/* Shifts */}
                <Text variant="titleMedium" style={styles.sectionTitle}>Shifts</Text>
                {opp.shifts.length === 0 ? (
                    <Card style={styles.emptyCard} mode="outlined"><Card.Content><Text style={{ color: COLORS.textSecondary, textAlign: 'center' }}>No shifts yet. Add shifts before publishing.</Text></Card.Content></Card>
                ) : (
                    opp.shifts.map((shift, i) => (
                        <Card key={shift.shiftId || i} style={styles.shiftCard} mode="outlined">
                            <Card.Content>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text variant="titleSmall" style={{ color: COLORS.text, flex: 1 }}>{shift.name}</Text>
                                    <Chip compact style={{ backgroundColor: shift.currentCount >= shift.maxCapacity ? COLORS.error + '20' : COLORS.success + '20' }}
                                        textStyle={{ color: shift.currentCount >= shift.maxCapacity ? COLORS.error : COLORS.success, fontSize: 10 }}>
                                        {shift.currentCount}/{shift.maxCapacity}
                                    </Chip>
                                </View>
                                <Text style={styles.shiftMeta}>📅 {new Date(shift.startTime).toLocaleString()} — {new Date(shift.endTime).toLocaleString()}</Text>
                            </Card.Content>
                            <Card.Actions>
                                <Button compact icon="pencil" onPress={() => openEditShift(shift)}>Edit</Button>
                                <Button compact icon="delete" textColor={COLORS.error} onPress={() => handleRemoveShift(shift)}>Remove</Button>
                            </Card.Actions>
                        </Card>
                    ))
                )}
                <Button mode="outlined" icon="plus" textColor={COLORS.primary} style={{ marginTop: 8, marginBottom: 16 }} onPress={() => setShowAddShift(true)}>Add Shift</Button>

                {/* Pending Applications */}
                {pendingApps.length > 0 && (
                    <>
                        <Text variant="titleMedium" style={styles.sectionTitle}>Pending Applications ({pendingApps.length})</Text>
                        {pendingApps.map(app => (
                            <Card key={app.applicationId} style={styles.appCard} mode="outlined">
                                <Card.Content style={styles.appRow}>
                                    <Text style={{ color: COLORS.text, flex: 1, fontSize: 13 }}>{app.volunteerName || app.volunteerId.substring(0, 12)}</Text>
                                    <Text style={{ color: COLORS.textSecondary, fontSize: 11 }}>{app.shiftName}</Text>
                                </Card.Content>
                                <Card.Actions>
                                    <Button compact textColor={COLORS.error} onPress={() => handleRejectApp(app.applicationId)}>Reject</Button>
                                    <Button compact onPress={() => handleWaitlistApp(app.applicationId)}>Waitlist</Button>
                                    <Button compact mode="contained" buttonColor={COLORS.success} onPress={() => handleApproveApp(app.applicationId)}>Approve</Button>
                                </Card.Actions>
                            </Card>
                        ))}
                    </>
                )}

                {/* Waitlisted */}
                {waitlistedApps.length > 0 && (
                    <>
                        <Text variant="titleMedium" style={styles.sectionTitle}>Waitlisted ({waitlistedApps.length})</Text>
                        {waitlistedApps.map(app => (
                            <Card key={app.applicationId} style={styles.appCard} mode="outlined">
                                <Card.Content style={styles.appRow}>
                                    <Text style={{ color: COLORS.text, flex: 1, fontSize: 13 }}>{app.volunteerName || app.volunteerId.substring(0, 12)}</Text>
                                    <Text style={{ color: COLORS.textSecondary, fontSize: 11 }}>{app.shiftName}</Text>
                                </Card.Content>
                                <Card.Actions>
                                    <Button compact textColor={COLORS.error} onPress={() => handleRejectApp(app.applicationId)}>Reject</Button>
                                    <Button compact mode="contained" buttonColor={COLORS.primary} icon="arrow-up-bold" onPress={() => handlePromoteApp(app.applicationId)}>Promote</Button>
                                </Card.Actions>
                            </Card>
                        ))}
                    </>
                )}

                {/* Confirmed Volunteers */}
                {confirmedApps.length > 0 && (
                    <>
                        <Text variant="titleMedium" style={styles.sectionTitle}>Confirmed Volunteers ({confirmedApps.length})</Text>
                        {confirmedApps.map(app => (
                            <Card key={app.applicationId} style={styles.appCard} mode="outlined">
                                <Card.Content style={styles.appRow}>
                                    <Text style={{ color: COLORS.text, flex: 1, fontSize: 13 }}>{app.volunteerName || app.volunteerId.substring(0, 12)} ({app.shiftName})</Text>
                                </Card.Content>
                                <Card.Actions>
                                    <Button compact textColor={COLORS.error} onPress={async () => { try { await applicationService.markNoShow(app.applicationId); Alert.alert('Done', 'Marked as no-show'); await fetchOpp(); } catch { Alert.alert('Error'); } }}>No-Show</Button>
                                    <Button compact textColor={COLORS.success} onPress={async () => { try { await attendanceService.confirm(app.volunteerId, { supervisorId: id || '', rating: 5 }); Alert.alert('Done', 'Confirmed'); } catch { Alert.alert('Error'); } }}>Confirm</Button>
                                    <Button compact icon="certificate" textColor={COLORS.primary} onPress={() => openIssueCert(app.volunteerId, app.volunteerName || app.volunteerId)}>Cert</Button>
                                </Card.Actions>
                            </Card>
                        ))}
                    </>
                )}

                {/* Tasks */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <Text variant="titleMedium" style={[styles.sectionTitle, { marginBottom: 0 }]}>Tasks ({tasks.length})</Text>
                    <Button compact icon="plus" onPress={() => setShowAddTask(true)}>Add</Button>
                </View>
                {tasks.length === 0 ? (
                    <Card style={[styles.emptyCard, { marginTop: 8 }]} mode="outlined"><Card.Content><Text style={{ color: COLORS.textSecondary, textAlign: 'center', fontSize: 13 }}>No tasks yet. Add tasks to track event preparation.</Text></Card.Content></Card>
                ) : (
                    tasks.map(task => (
                        <TouchableOpacity key={task.id} onPress={() => handleToggleTask(task)} activeOpacity={0.7}>
                            <Card style={[styles.appCard, task.isCompleted && { opacity: 0.6 }]} mode="outlined">
                                <Card.Content style={styles.appRow}>
                                    <Checkbox.Android status={task.isCompleted ? 'checked' : 'unchecked'} color={COLORS.success} onPress={() => handleToggleTask(task)} />
                                    <View style={{ flex: 1, marginLeft: 4 }}>
                                        <Text style={[{ color: COLORS.text, fontSize: 14 }, task.isCompleted && { textDecorationLine: 'line-through', color: COLORS.textSecondary }]}>{task.title}</Text>
                                        {task.note ? <Text style={{ color: COLORS.textSecondary, fontSize: 11, marginTop: 2 }}>{task.note}</Text> : null}
                                        {task.assignedToName ? <Text style={{ color: COLORS.primary, fontSize: 11, marginTop: 2 }}>→ {task.assignedToName}</Text> : null}
                                    </View>
                                    <TouchableOpacity onPress={() => handleDeleteTask(task)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                        <MaterialCommunityIcons name="trash-can-outline" size={18} color={COLORS.error} />
                                    </TouchableOpacity>
                                </Card.Content>
                            </Card>
                        </TouchableOpacity>
                    ))
                )}

                <View style={{ height: 80 }} />
            </ScrollView>

            {/* ── Modals ─────────────────────────────────────────────── */}
            <Portal>
                {/* Add Shift */}
                <Modal visible={showAddShift} onDismiss={() => setShowAddShift(false)} contentContainerStyle={styles.modal}>
                    <Text variant="titleLarge" style={{ color: COLORS.text, marginBottom: 16 }}>Add Shift</Text>
                    <TextInput label="Shift Name" value={shiftName} onChangeText={setShiftName} mode="outlined" style={styles.input} outlineColor={COLORS.border} activeOutlineColor={COLORS.primary} textColor={COLORS.text} />
                    <TextInput label="Start (YYYY-MM-DD HH:MM)" value={shiftStart} onChangeText={setShiftStart} mode="outlined" style={styles.input} outlineColor={COLORS.border} activeOutlineColor={COLORS.primary} textColor={COLORS.text} placeholder="2026-04-15 09:00" placeholderTextColor={COLORS.textSecondary} />
                    <TextInput label="End (YYYY-MM-DD HH:MM)" value={shiftEnd} onChangeText={setShiftEnd} mode="outlined" style={styles.input} outlineColor={COLORS.border} activeOutlineColor={COLORS.primary} textColor={COLORS.text} placeholder="2026-04-15 17:00" placeholderTextColor={COLORS.textSecondary} />
                    <TextInput label="Max Capacity" value={shiftCapacity} onChangeText={setShiftCapacity} mode="outlined" keyboardType="numeric" style={styles.input} outlineColor={COLORS.border} activeOutlineColor={COLORS.primary} textColor={COLORS.text} />
                    <Button mode="contained" onPress={handleAddShift} loading={actionLoading} disabled={!shiftName || !shiftStart || !shiftEnd} buttonColor={COLORS.primary} style={{ marginTop: 8 }}>Add Shift</Button>
                </Modal>

                {/* Edit Shift */}
                <Modal visible={showEditShift} onDismiss={() => setShowEditShift(false)} contentContainerStyle={styles.modal}>
                    <Text variant="titleLarge" style={{ color: COLORS.text, marginBottom: 16 }}>Edit Shift</Text>
                    <TextInput label="Shift Name" value={editShiftName} onChangeText={setEditShiftName} mode="outlined" style={styles.input} outlineColor={COLORS.border} activeOutlineColor={COLORS.primary} textColor={COLORS.text} />
                    <TextInput label="Start (YYYY-MM-DD HH:MM)" value={editShiftStart} onChangeText={setEditShiftStart} mode="outlined" style={styles.input} outlineColor={COLORS.border} activeOutlineColor={COLORS.primary} textColor={COLORS.text} />
                    <TextInput label="End (YYYY-MM-DD HH:MM)" value={editShiftEnd} onChangeText={setEditShiftEnd} mode="outlined" style={styles.input} outlineColor={COLORS.border} activeOutlineColor={COLORS.primary} textColor={COLORS.text} />
                    <TextInput label="Max Capacity" value={editShiftCapacity} onChangeText={setEditShiftCapacity} mode="outlined" keyboardType="numeric" style={styles.input} outlineColor={COLORS.border} activeOutlineColor={COLORS.primary} textColor={COLORS.text} />
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                        <Button mode="outlined" onPress={() => setShowEditShift(false)} textColor={COLORS.textSecondary} style={{ flex: 1 }}>Cancel</Button>
                        <Button mode="contained" onPress={handleEditShift} loading={actionLoading} disabled={!editShiftName} buttonColor={COLORS.primary} style={{ flex: 1 }}>Save</Button>
                    </View>
                </Modal>

                {/* Cancel */}
                <Modal visible={showCancel} onDismiss={() => setShowCancel(false)} contentContainerStyle={styles.modal}>
                    <Text variant="titleLarge" style={{ color: COLORS.text, marginBottom: 16 }}>Cancel Event</Text>
                    <TextInput label="Reason (required)" value={cancelReason} onChangeText={setCancelReason} mode="outlined" multiline style={styles.input} outlineColor={COLORS.border} activeOutlineColor={COLORS.error} textColor={COLORS.text} />
                    <Button mode="contained" onPress={handleCancelSubmit} loading={cancelling} disabled={!cancelReason || cancelling} buttonColor={COLORS.error} style={{ marginTop: 8 }}>Confirm Cancel</Button>
                    <Button onPress={() => setShowCancel(false)} textColor={COLORS.textSecondary} style={{ marginTop: 8 }}>Back</Button>
                </Modal>

                {/* Edit Info */}
                <Modal visible={showEditInfo} onDismiss={() => setShowEditInfo(false)} contentContainerStyle={styles.modal}>
                    <Text variant="titleLarge" style={{ color: COLORS.text, marginBottom: 16 }}>Edit Opportunity</Text>
                    <TextInput label="Title" value={editTitle} onChangeText={setEditTitle} mode="outlined" style={styles.input} outlineColor={COLORS.border} activeOutlineColor={COLORS.primary} textColor={COLORS.text} />
                    <TextInput label="Description" value={editDesc} onChangeText={setEditDesc} mode="outlined" multiline numberOfLines={3} style={styles.input} outlineColor={COLORS.border} activeOutlineColor={COLORS.primary} textColor={COLORS.text} />
                    <TextInput label="Category" value={editCategory} onChangeText={setEditCategory} mode="outlined" style={styles.input} outlineColor={COLORS.border} activeOutlineColor={COLORS.primary} textColor={COLORS.text} />
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                        <Button mode="outlined" onPress={() => setShowEditInfo(false)} textColor={COLORS.textSecondary} style={{ flex: 1 }}>Cancel</Button>
                        <Button mode="contained" onPress={handleSaveInfo} loading={savingInfo} disabled={!editTitle || savingInfo} buttonColor={COLORS.primary} style={{ flex: 1 }}>Save</Button>
                    </View>
                </Modal>

                {/* Notify Volunteers */}
                <Modal visible={showNotify} onDismiss={() => setShowNotify(false)} contentContainerStyle={styles.modal}>
                    <Text variant="titleLarge" style={{ color: COLORS.text, marginBottom: 8 }}>Notify Volunteers</Text>
                    <Text style={{ color: COLORS.textSecondary, marginBottom: 16, fontSize: 13 }}>Send a message to volunteers registered for this event.</Text>
                    <TextInput label="Message" value={notifyMsg} onChangeText={setNotifyMsg} mode="outlined" multiline numberOfLines={3} style={styles.input} outlineColor={COLORS.border} activeOutlineColor={COLORS.primary} textColor={COLORS.text} />
                    <Text style={{ color: COLORS.text, marginBottom: 8, fontWeight: '600' }}>Target:</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                        <Chip selected={notifyTarget === 'All'} onPress={() => setNotifyTarget('All')} style={{ backgroundColor: notifyTarget === 'All' ? COLORS.primary + '30' : COLORS.surfaceLight }} textStyle={{ color: notifyTarget === 'All' ? COLORS.primary : COLORS.textSecondary }}>All</Chip>
                        <Chip selected={notifyTarget === 'Approved'} onPress={() => setNotifyTarget('Approved')} style={{ backgroundColor: notifyTarget === 'Approved' ? COLORS.primary + '30' : COLORS.surfaceLight }} textStyle={{ color: notifyTarget === 'Approved' ? COLORS.primary : COLORS.textSecondary }}>Approved Only</Chip>
                    </View>
                    <Button mode="contained" onPress={handleNotify} loading={sending} disabled={!notifyMsg || sending} buttonColor={COLORS.primary}>Send Notification</Button>
                    <Button onPress={() => setShowNotify(false)} textColor={COLORS.textSecondary} style={{ marginTop: 8 }}>Cancel</Button>
                </Modal>

                {/* Skills */}
                <Modal visible={showSkills} onDismiss={() => setShowSkills(false)} contentContainerStyle={styles.modal}>
                    <Text variant="titleLarge" style={{ color: COLORS.text, marginBottom: 16 }}>Required Skills</Text>
                    <ScrollView style={{ maxHeight: 300 }}>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {allSkills.map(s => (<Chip key={s.id} selected={selectedSkillIds.has(s.id)} style={{ backgroundColor: selectedSkillIds.has(s.id) ? COLORS.primary : COLORS.surfaceLight }} textStyle={{ color: selectedSkillIds.has(s.id) ? '#fff' : COLORS.text }} onPress={() => toggleSkill(s.id)}>{s.name}</Chip>))}
                            {allSkills.length === 0 && <Text style={{ color: COLORS.textSecondary }}>No skills defined in system.</Text>}
                        </View>
                    </ScrollView>
                    <Button mode="contained" onPress={handleSaveSkills} loading={savingSkills} disabled={savingSkills} buttonColor={COLORS.primary} style={{ marginTop: 16 }}>Save Skills</Button>
                    <Button onPress={() => setShowSkills(false)} textColor={COLORS.textSecondary} style={{ marginTop: 8 }}>Cancel</Button>
                </Modal>

                {/* Issue Certificate */}
                <Modal visible={showIssueCert} onDismiss={() => setShowIssueCert(false)} contentContainerStyle={styles.modal}>
                    <Text variant="titleLarge" style={{ color: COLORS.text, marginBottom: 8 }}>Issue Certificate</Text>
                    <Text style={{ color: COLORS.textSecondary, marginBottom: 16 }}>Issuing to: {certTargetName}</Text>
                    <ScrollView style={{ maxHeight: 250 }}>
                        {certTemplates.map(t => (
                            <Card key={t.id} mode="outlined" style={[{ marginBottom: 8, backgroundColor: COLORS.surfaceLight, borderColor: COLORS.border }, selectedTemplateId === t.id && { borderColor: COLORS.primary, borderWidth: 2 }]} onPress={() => setSelectedTemplateId(t.id)}>
                                <Card.Content style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: t.primaryColor }} />
                                    <View style={{ flex: 1 }}><Text style={{ color: COLORS.text, fontWeight: 'bold' }}>{t.name}</Text><Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>{t.description}</Text></View>
                                    {selectedTemplateId === t.id && <MaterialCommunityIcons name="check-circle" size={20} color={COLORS.primary} />}
                                </Card.Content>
                            </Card>
                        ))}
                        {certTemplates.length === 0 && <Text style={{ color: COLORS.textSecondary }}>No templates available.</Text>}
                    </ScrollView>
                    <Button mode="contained" onPress={handleIssueCert} loading={issuingCert} disabled={!selectedTemplateId || issuingCert} buttonColor={COLORS.primary} style={{ marginTop: 16 }}>Issue Certificate</Button>
                    <Button onPress={() => setShowIssueCert(false)} textColor={COLORS.textSecondary} style={{ marginTop: 8 }}>Cancel</Button>
                </Modal>

                {/* Add Task */}
                <Modal visible={showAddTask} onDismiss={() => setShowAddTask(false)} contentContainerStyle={styles.modal}>
                    <Text variant="titleLarge" style={{ color: COLORS.text, marginBottom: 16 }}>Add Task</Text>
                    <TextInput label="Task Title" value={taskTitle} onChangeText={setTaskTitle} mode="outlined" style={styles.input} outlineColor={COLORS.border} activeOutlineColor={COLORS.primary} textColor={COLORS.text} />
                    <TextInput label="Notes (optional)" value={taskNote} onChangeText={setTaskNote} mode="outlined" multiline style={styles.input} outlineColor={COLORS.border} activeOutlineColor={COLORS.primary} textColor={COLORS.text} />
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                        <Button mode="outlined" onPress={() => setShowAddTask(false)} textColor={COLORS.textSecondary} style={{ flex: 1 }}>Cancel</Button>
                        <Button mode="contained" onPress={handleAddTask} disabled={!taskTitle} buttonColor={COLORS.primary} style={{ flex: 1 }}>Add</Button>
                    </View>
                </Modal>
            </Portal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    content: { padding: 16 },
    header: { padding: 20, borderRadius: 16, backgroundColor: COLORS.surface, marginBottom: 16 },
    titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    title: { color: COLORS.text, flex: 1, marginRight: 8 },
    categoryChip: { backgroundColor: COLORS.primary + '20', alignSelf: 'flex-start', marginBottom: 12 },
    desc: { color: COLORS.textSecondary, lineHeight: 22, marginBottom: 16 },
    statsRow: { flexDirection: 'row', gap: 20 },
    stat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statText: { color: COLORS.textSecondary, fontSize: 13 },
    actions: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    actionBtn: { flex: 1 },
    sectionTitle: { color: COLORS.text, marginBottom: 12, marginTop: 8 },
    shiftCard: { marginBottom: 8, backgroundColor: COLORS.surface, borderColor: COLORS.border },
    shiftMeta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4 },
    appCard: { marginBottom: 8, backgroundColor: COLORS.surface, borderColor: COLORS.border },
    appRow: { flexDirection: 'row', alignItems: 'center' },
    emptyCard: { backgroundColor: COLORS.surface, borderColor: COLORS.border, marginBottom: 8 },
    modal: { backgroundColor: COLORS.surface, padding: 24, margin: 20, borderRadius: 16 },
    input: { marginBottom: 12, backgroundColor: COLORS.surfaceLight },
});
