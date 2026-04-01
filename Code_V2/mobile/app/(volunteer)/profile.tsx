import { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Alert, Switch, Linking, TouchableOpacity } from 'react-native';
import { Avatar, Button, Card, Text, Surface, Divider, ActivityIndicator, Portal, Modal, TextInput, Chip } from 'react-native-paper';
import { router } from 'expo-router';
import { COLORS } from '../../constants/config';
import { useAuthStore } from '../../stores/authStore';
import { volunteerService, VolunteerProfile } from '../../services/volunteers';
import { certificateService, CertificateTemplate, CertificateTemplateDetail } from '../../services/certificates';
import { fileService } from '../../services/files';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function ProfileScreen() {
    const { email, role, linkedGrainId, logout } = useAuthStore();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [profile, setProfile] = useState<VolunteerProfile | null>(null);

    // Edit profile
    const [showEdit, setShowEdit] = useState(false);
    const [editFirst, setEditFirst] = useState('');
    const [editLast, setEditLast] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [editBio, setEditBio] = useState('');
    const [saving, setSaving] = useState(false);

    // Credential upload
    const [showCredential, setShowCredential] = useState(false);

    // Privacy Settings (isProfilePublic only)
    const [showPrivacy, setShowPrivacy] = useState(false);
    const [privPublic, setPrivPublic] = useState(true);
    const [privEmail, setPrivEmail] = useState(true);
    const [privPush, setPrivPush] = useState(true);

    // Notifications (allowEmail + allowPush)
    const [showNotifications, setShowNotifications] = useState(false);
    const [notifEmail, setNotifEmail] = useState(true);
    const [notifPush, setNotifPush] = useState(true);

    // Certificate — Step 1: template selection
    const [showCert, setShowCert] = useState(false);
    const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<CertificateTemplate | null>(null);

    // Certificate — Step 2: preview (cert is already generated)
    const [showCertPreview, setShowCertPreview] = useState(false);
    const [certLoading, setCertLoading] = useState(false);
    const [certUrl, setCertUrl] = useState<string | null>(null);
    const [certDetail, setCertDetail] = useState<CertificateTemplateDetail | null>(null);

    const fetchProfile = useCallback(async () => {
        try {
            if (!linkedGrainId) return;
            const data = await volunteerService.getProfile(linkedGrainId);
            setProfile(data);
            setPrivPublic(data.isProfilePublic ?? true);
        } catch (err: any) {
            console.log('Profile fetch error:', err.message);
        } finally {
            setLoading(false);
        }
    }, [linkedGrainId]);

    useEffect(() => { fetchProfile(); }, [fetchProfile]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchProfile();
        setRefreshing(false);
    }, [fetchProfile]);

    // ── Edit profile ─────────────────────────────────────────────────────────
    const openEdit = () => {
        setEditFirst(profile?.firstName || '');
        setEditLast(profile?.lastName || '');
        setEditPhone(profile?.phone || '');
        setEditBio(profile?.bio || '');
        setShowEdit(true);
    };

    const handleSaveProfile = async () => {
        if (!linkedGrainId) return;
        setSaving(true);
        try {
            await volunteerService.updateProfile(linkedGrainId, {
                firstName: editFirst,
                lastName: editLast,
                email: email || '',
                phone: editPhone,
                bio: editBio,
            });
            setShowEdit(false);
            Alert.alert('Success', 'Profile updated!');
            await fetchProfile();
        } catch (err: any) {
            Alert.alert('Error', err.response?.data?.toString() || 'Failed to update');
        } finally {
            setSaving(false);
        }
    };

    // ── Credentials ──────────────────────────────────────────────────────────
    const handleUploadCredential = async () => {
        if (!linkedGrainId) return;
        try {
            const { launchImageLibraryAsync, requestMediaLibraryPermissionsAsync } = await import('expo-image-picker');
            const { status } = await requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Media library permission is required.');
                return;
            }
            const result = await launchImageLibraryAsync({ quality: 0.7 });
            if (result.canceled) return;
            const asset = result.assets[0];
            const name = asset.fileName || `credential_${Date.now()}.jpg`;
            const fileKey = await fileService.upload(asset.uri, name, 'credentials');
            await volunteerService.uploadCredential(linkedGrainId, fileKey);
            setShowCredential(false);
            Alert.alert('Success', 'Credential uploaded!');
            await fetchProfile();
        } catch (err: any) {
            Alert.alert('Error', err.response?.data?.toString() || 'Failed to upload');
        }
    };

    // ── Certificate (step 1 — template selection) ─────────────────────────────
    const handleOpenCertModal = async () => {
        try {
            const list = await certificateService.getTemplates();
            setTemplates(list);
            setSelectedTemplate(list.length > 0 ? list[0] : null);
        } catch { setTemplates([]); }
        setShowCert(true);
    };

    // ── Certificate (step 2 — generate then preview) ─────────────────────────
    // Generate the PDF first, then open the preview so user can see/discard it
    const handleOpenPreview = async () => {
        if (!selectedTemplate || !linkedGrainId) return;
        setCertLoading(true);
        setShowCert(false);
        try {
            const [result, detail] = await Promise.all([
                certificateService.generate(linkedGrainId, selectedTemplate.id),
                certificateService.getTemplate(selectedTemplate.id),
            ]);
            setCertUrl(result.downloadUrl);
            setCertDetail(detail);
            setShowCertPreview(true);
        } catch (err: any) {
            Alert.alert('Error', err.response?.data?.toString() || 'Failed to generate certificate');
            setShowCert(true);
        } finally {
            setCertLoading(false);
        }
    };

    // ── Privacy Settings ─────────────────────────────────────────────────────
    const openPrivacy = () => {
        setPrivPublic(profile?.isProfilePublic ?? true);
        setShowPrivacy(true);
    };

    const handleSavePrivacy = async () => {
        if (!linkedGrainId) return;
        try {
            await volunteerService.updatePrivacySettings(linkedGrainId, {
                isProfilePublic: privPublic,
                allowEmail: privEmail,
                allowPush: privPush,
            });
            setShowPrivacy(false);
            Alert.alert('Saved', 'Privacy settings updated.');
            await fetchProfile();
        } catch (err: any) {
            Alert.alert('Error', err.response?.data?.toString() || 'Failed to update');
        }
    };

    // ── Notifications ─────────────────────────────────────────────────────────
    const openNotifications = () => {
        setNotifEmail(privEmail);
        setNotifPush(privPush);
        setShowNotifications(true);
    };

    const handleSaveNotifications = async () => {
        if (!linkedGrainId) return;
        try {
            await volunteerService.updatePrivacySettings(linkedGrainId, {
                isProfilePublic: privPublic,
                allowEmail: notifEmail,
                allowPush: notifPush,
            });
            setPrivEmail(notifEmail);
            setPrivPush(notifPush);
            setShowNotifications(false);
            Alert.alert('Saved', 'Notification preferences updated.');
        } catch (err: any) {
            Alert.alert('Error', err.response?.data?.toString() || 'Failed to update');
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    const fullName = profile?.firstName && profile?.lastName
        ? `${profile.firstName} ${profile.lastName}`
        : email;

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        >
            {/* Profile Header */}
            <Surface style={styles.header} elevation={1}>
                <Avatar.Icon size={76} icon="account" style={styles.avatar} />
                <Text variant="headlineSmall" style={styles.name}>{fullName}</Text>
                <View style={styles.roleTag}>
                    <MaterialCommunityIcons name="shield-check" size={13} color={COLORS.primary} />
                    <Text style={styles.roleText}>{role}</Text>
                </View>
                {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
                {profile?.phone ? (
                    <View style={styles.phoneRow}>
                        <MaterialCommunityIcons name="phone-outline" size={14} color={COLORS.textSecondary} />
                        <Text style={styles.phone}>{profile.phone}</Text>
                    </View>
                ) : null}
            </Surface>

            {/* Waiver & Background Check */}
            <Card style={styles.actionsCard} mode="outlined">
                <Card.Content>
                    <Text variant="titleSmall" style={{ color: COLORS.text, fontWeight: '700', marginBottom: 10 }}>Compliance Status</Text>
                    <View style={styles.complianceRow}>
                        <MaterialCommunityIcons
                            name={profile?.waiverSignedAt ? 'check-circle' : 'alert-circle-outline'}
                            size={20}
                            color={profile?.waiverSignedAt ? COLORS.success : COLORS.warning}
                        />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={{ color: COLORS.text, fontSize: 14 }}>Liability Waiver</Text>
                            <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 2 }}>
                                {profile?.waiverSignedAt
                                    ? `Signed on ${new Date(profile.waiverSignedAt).toLocaleDateString()}`
                                    : 'Not yet signed'}
                            </Text>
                        </View>
                        {!profile?.waiverSignedAt && (
                            <Button
                                compact
                                mode="contained"
                                buttonColor={COLORS.primary}
                                onPress={async () => {
                                    if (!linkedGrainId) return;
                                    try {
                                        await volunteerService.signWaiver(linkedGrainId);
                                        Alert.alert('Success', 'Waiver signed successfully!');
                                        await fetchProfile();
                                    } catch (err: any) {
                                        Alert.alert('Error', err.response?.data?.toString() || 'Failed to sign waiver');
                                    }
                                }}
                            >
                                Sign
                            </Button>
                        )}
                    </View>
                    <Divider style={[styles.divider, { marginVertical: 8 }]} />
                    <View style={styles.complianceRow}>
                        <MaterialCommunityIcons
                            name={profile?.backgroundCheckStatus === 'Verified' ? 'shield-check' : 'shield-alert-outline'}
                            size={20}
                            color={profile?.backgroundCheckStatus === 'Verified' ? COLORS.success
                                : profile?.backgroundCheckStatus === 'Pending' ? COLORS.warning
                                : COLORS.textSecondary}
                        />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={{ color: COLORS.text, fontSize: 14 }}>Background Check</Text>
                            <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 2 }}>
                                {profile?.backgroundCheckStatus || 'Not submitted'}
                            </Text>
                        </View>
                        <Chip
                            compact
                            style={{
                                backgroundColor: profile?.backgroundCheckStatus === 'Verified' ? COLORS.success + '18'
                                    : profile?.backgroundCheckStatus === 'Pending' ? COLORS.warning + '18'
                                    : COLORS.surfaceLight
                            }}
                            textStyle={{
                                color: profile?.backgroundCheckStatus === 'Verified' ? COLORS.success
                                    : profile?.backgroundCheckStatus === 'Pending' ? COLORS.warning
                                    : COLORS.textSecondary,
                                fontSize: 11,
                            }}
                        >
                            {profile?.backgroundCheckStatus || 'N/A'}
                        </Chip>
                    </View>
                </Card.Content>
            </Card>

            {/* Impact Stats */}
            <View style={styles.statsRow}>
                <Surface style={styles.statCard} elevation={1}>
                    <MaterialCommunityIcons name="clock-check-outline" size={24} color={COLORS.primary} />
                    <Text style={styles.statValue}>{profile?.totalHours ?? 0}</Text>
                    <Text style={styles.statLabel}>Hours</Text>
                </Surface>
                <Surface style={styles.statCard} elevation={1}>
                    <MaterialCommunityIcons name="check-decagram" size={24} color={COLORS.success} />
                    <Text style={[styles.statValue, { color: COLORS.success }]}>{profile?.completedOpportunities ?? 0}</Text>
                    <Text style={styles.statLabel}>Completed</Text>
                </Surface>
                <Surface style={styles.statCard} elevation={1}>
                    <MaterialCommunityIcons name="star-four-points" size={24} color={COLORS.warning} />
                    <Text style={[styles.statValue, { color: COLORS.warning }]}>{profile?.impactScore ?? 0}</Text>
                    <Text style={styles.statLabel}>Score</Text>
                </Surface>
            </View>

            {/* Actions */}
            <Card style={styles.actionsCard} mode="outlined">
                <Card.Content>
                    <ActionRow icon="account-edit-outline" label="Edit Profile" onPress={openEdit} />
                    <Divider style={styles.divider} />
                    <ActionRow icon="shield-check-outline" label={`Credentials (${profile?.credentials?.length ?? 0})`} onPress={() => setShowCredential(true)} />
                    <Divider style={styles.divider} />
                    <ActionRow icon="file-certificate-outline" label="Generate Certificate" onPress={handleOpenCertModal} />
                    <Divider style={styles.divider} />
                    <ActionRow icon="star-circle-outline" label="My Skills" onPress={() => router.push('/(volunteer)/skills')} />
                    <Divider style={styles.divider} />
                    <ActionRow icon="history" label="Attendance History" onPress={() => router.push('/(volunteer)/attendance')} />
                    <Divider style={styles.divider} />
                    <ActionRow icon="domain" label="Browse Organizations" onPress={() => router.push('/(volunteer)/organizations')} />
                    <Divider style={styles.divider} />
                    <ActionRow icon="bell-outline" label="Notifications" onPress={() => router.push('/(volunteer)/notifications')} />
                    <Divider style={styles.divider} />
                    <ActionRow icon="lock-outline" label="Privacy Settings" onPress={openPrivacy} />
                </Card.Content>
            </Card>

            {/* Credentials list */}
            {profile?.credentials && profile.credentials.length > 0 && (
                <Card style={styles.credCard} mode="outlined">
                    <Card.Content>
                        <Text variant="titleSmall" style={styles.credTitle}>My Credentials</Text>
                        {profile.credentials.map((cred, i) => (
                            <View key={i} style={styles.credItem}>
                                <MaterialCommunityIcons name="medal-outline" size={16} color={COLORS.primary} />
                                <Text style={styles.credText}>{cred}</Text>
                            </View>
                        ))}
                    </Card.Content>
                </Card>
            )}

            <Button mode="outlined" onPress={logout} textColor={COLORS.error} style={styles.logoutBtn} icon="logout">
                Log Out
            </Button>

            {/* ── Edit Profile Modal ─────────────────────────────────────────── */}
            <Portal>
                <Modal visible={showEdit} onDismiss={() => setShowEdit(false)} contentContainerStyle={styles.modal}>
                    <Text variant="titleLarge" style={styles.modalTitle}>Edit Profile</Text>
                    <TextInput label="First Name" value={editFirst} onChangeText={setEditFirst} mode="outlined"
                        style={styles.input} outlineColor={COLORS.border} activeOutlineColor={COLORS.primary} textColor={COLORS.text} />
                    <TextInput label="Last Name" value={editLast} onChangeText={setEditLast} mode="outlined"
                        style={styles.input} outlineColor={COLORS.border} activeOutlineColor={COLORS.primary} textColor={COLORS.text} />
                    <TextInput label="Phone" value={editPhone} onChangeText={setEditPhone} mode="outlined"
                        keyboardType="phone-pad" style={styles.input}
                        outlineColor={COLORS.border} activeOutlineColor={COLORS.primary} textColor={COLORS.text} />
                    <TextInput label="Bio" value={editBio} onChangeText={setEditBio} mode="outlined"
                        multiline numberOfLines={3} style={styles.input}
                        outlineColor={COLORS.border} activeOutlineColor={COLORS.primary} textColor={COLORS.text} />
                    <View style={styles.modalBtns}>
                        <Button mode="outlined" onPress={() => setShowEdit(false)} textColor={COLORS.textSecondary} style={{ flex: 1 }}>Cancel</Button>
                        <Button mode="contained" onPress={handleSaveProfile} loading={saving} disabled={saving}
                            buttonColor={COLORS.primary} style={{ flex: 1 }}>Save</Button>
                    </View>
                </Modal>
            </Portal>

            {/* ── Upload Credential Modal ────────────────────────────────────── */}
            <Portal>
                <Modal visible={showCredential} onDismiss={() => setShowCredential(false)} contentContainerStyle={styles.modal}>
                    <Text variant="titleLarge" style={styles.modalTitle}>Upload Credential</Text>
                    <View style={styles.uploadBox}>
                        <MaterialCommunityIcons name="file-upload-outline" size={40} color={COLORS.primary} />
                        <Text style={styles.uploadHint}>Select an image of your credential or certification.</Text>
                    </View>
                    <Button mode="contained" onPress={handleUploadCredential}
                        buttonColor={COLORS.primary} icon="image-plus" style={{ marginTop: 8 }}>
                        Choose File & Upload
                    </Button>
                    <Button mode="text" onPress={() => setShowCredential(false)} textColor={COLORS.textSecondary} style={{ marginTop: 4 }}>
                        Cancel
                    </Button>
                </Modal>
            </Portal>

            {/* ── Certificate Step 1: Template Selection ─────────────────────── */}
            <Portal>
                <Modal visible={showCert} onDismiss={() => setShowCert(false)} contentContainerStyle={styles.modal}>
                    <Text variant="titleLarge" style={styles.modalTitle}>Select Template</Text>
                    <Text style={styles.modalSub}>Choose a certificate template, then preview before downloading.</Text>
                    {templates.length === 0 ? (
                        <View style={styles.emptyBox}>
                            <MaterialCommunityIcons name="file-certificate-outline" size={40} color={COLORS.border} />
                            <Text style={{ color: COLORS.textSecondary, marginTop: 8, textAlign: 'center', fontSize: 13 }}>
                                No templates available. Ask your admin to seed certificate presets.
                            </Text>
                        </View>
                    ) : (
                        templates.map(t => (
                            <Card
                                key={t.id}
                                mode="outlined"
                                style={[styles.templateCard, selectedTemplate?.id === t.id && { borderColor: t.primaryColor, borderWidth: 2 }]}
                                onPress={() => setSelectedTemplate(t)}
                            >
                                <Card.Content style={styles.templateRow}>
                                    <View style={[styles.colorDot, { backgroundColor: t.primaryColor }]} />
                                    <View style={{ flex: 1, marginLeft: 12 }}>
                                        <Text style={styles.templateName}>{t.name}</Text>
                                        <Text style={styles.templateMeta}>
                                            {t.isSystemPreset ? '🌐 System Preset' : `🏢 ${t.organizationName ?? 'Organization'}`}
                                            {t.templateType ? ` · ${t.templateType === 'hours_log' ? 'Hours Log' : 'Achievement'}` : ''}
                                        </Text>
                                    </View>
                                    <MaterialCommunityIcons
                                        name={selectedTemplate?.id === t.id ? 'radiobox-marked' : 'radiobox-blank'}
                                        size={22}
                                        color={selectedTemplate?.id === t.id ? t.primaryColor : COLORS.border}
                                    />
                                </Card.Content>
                            </Card>
                        ))
                    )}
                    <View style={styles.modalBtns}>
                        <Button mode="outlined" onPress={() => setShowCert(false)} textColor={COLORS.textSecondary} style={{ flex: 1 }}>Cancel</Button>
                        <Button
                            mode="contained"
                            onPress={handleOpenPreview}
                            disabled={!selectedTemplate || certLoading}
                            loading={certLoading}
                            buttonColor={COLORS.primary}
                            icon="file-certificate"
                            style={{ flex: 1 }}
                        >
                            Generate Preview
                        </Button>
                    </View>
                </Modal>
            </Portal>

            {/* ── Certificate Step 2: PDF Preview ──────────────────────────── */}
            <Portal>
                <Modal
                    visible={showCertPreview}
                    onDismiss={() => { setShowCertPreview(false); setCertUrl(null); setCertDetail(null); }}
                    contentContainerStyle={styles.modal}
                >
                    <Text variant="titleLarge" style={styles.modalTitle}>Certificate Preview</Text>
                    <Text style={styles.modalSub}>Your certificate has been generated. Preview it or discard.</Text>

                    {selectedTemplate && (
                        <View style={[styles.certPreviewCard, { borderTopColor: selectedTemplate.primaryColor, borderTopWidth: 4 }]}>
                            {/* Color swatch */}
                            <View style={styles.certPreviewHeader}>
                                <View style={[styles.certPreviewDot, { backgroundColor: selectedTemplate.primaryColor }]} />
                                <View style={[styles.certPreviewDot, { backgroundColor: selectedTemplate.accentColor, marginLeft: 6 }]} />
                            </View>
                            <Text style={styles.certPreviewLabel}>Certificate of</Text>
                            <Text style={[styles.certPreviewType, { color: selectedTemplate.primaryColor }]}>
                                {selectedTemplate.templateType === 'hours_log' ? 'Volunteer Hours' : 'Achievement'}
                            </Text>
                            <Text style={styles.certPreviewTitle}>{selectedTemplate.name}</Text>
                            <Divider style={{ marginVertical: 12 }} />
                            <Text style={styles.certPreviewName}>
                                {profile?.firstName || ''} {profile?.lastName || ''}
                            </Text>
                            <View style={styles.certPreviewStats}>
                                <View style={styles.certStat}>
                                    <Text style={[styles.certStatValue, { color: selectedTemplate.primaryColor }]}>{profile?.totalHours ?? 0}h</Text>
                                    <Text style={styles.certStatLabel}>Total Hours</Text>
                                </View>
                                <View style={styles.certStat}>
                                    <Text style={[styles.certStatValue, { color: selectedTemplate.primaryColor }]}>{profile?.completedOpportunities ?? 0}</Text>
                                    <Text style={styles.certStatLabel}>Opportunities</Text>
                                </View>
                            </View>
                            <Text style={styles.certPreviewOrg}>
                                {selectedTemplate.isSystemPreset ? 'VSMS Platform' : selectedTemplate.organizationName ?? ''}
                            </Text>

                            {/* Signature section */}
                            {(certDetail?.signatoryName || certDetail?.signatoryTitle) && (
                                <>
                                    <Divider style={{ marginTop: 16, marginBottom: 12 }} />
                                    <View style={styles.signatoryRow}>
                                        <View style={styles.signatoryLine} />
                                        <Text style={[styles.signatoryName, { color: selectedTemplate.primaryColor }]}>
                                            {certDetail.signatoryName}
                                        </Text>
                                        {certDetail.signatoryTitle ? (
                                            <Text style={styles.signatoryTitle}>{certDetail.signatoryTitle}</Text>
                                        ) : null}
                                    </View>
                                </>
                            )}
                        </View>
                    )}

                    {/* Open PDF button — opens in device browser/PDF viewer for preview */}
                    {certUrl && (
                        <Button
                            mode="contained"
                            onPress={() => Linking.openURL(certUrl)}
                            buttonColor={COLORS.primary}
                            icon="file-pdf-box"
                            style={{ marginTop: 12 }}
                        >
                            Open PDF Preview
                        </Button>
                    )}

                    <View style={styles.modalBtns}>
                        <Button
                            mode="outlined"
                            onPress={() => { setShowCertPreview(false); setCertUrl(null); setCertDetail(null); }}
                            textColor={COLORS.error}
                            style={[{ flex: 1 }, { borderColor: COLORS.error + '40' }]}
                            icon="trash-can-outline"
                        >
                            Discard
                        </Button>
                        <Button
                            mode="contained"
                            onPress={() => certUrl && Linking.openURL(certUrl)}
                            disabled={!certUrl}
                            buttonColor={COLORS.success}
                            icon="download"
                            style={{ flex: 1 }}
                        >
                            Download
                        </Button>
                    </View>
                </Modal>
            </Portal>

            {/* ── Privacy Settings Modal (isProfilePublic only) ──────────────── */}
            <Portal>
                <Modal visible={showPrivacy} onDismiss={() => setShowPrivacy(false)} contentContainerStyle={styles.modal}>
                    <Text variant="titleLarge" style={styles.modalTitle}>Privacy Settings</Text>
                    <Text style={styles.modalSub}>Control who can see your volunteer profile.</Text>
                    <View style={styles.toggleRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.toggleLabel}>Public Profile</Text>
                            <Text style={styles.toggleHint}>Allow other users to view your profile</Text>
                        </View>
                        <Switch value={privPublic} onValueChange={setPrivPublic} trackColor={{ true: COLORS.primary }} />
                    </View>
                    <View style={styles.modalBtns}>
                        <Button mode="outlined" onPress={() => setShowPrivacy(false)} textColor={COLORS.textSecondary} style={{ flex: 1 }}>Cancel</Button>
                        <Button mode="contained" onPress={handleSavePrivacy} buttonColor={COLORS.primary} style={{ flex: 1 }}>Save</Button>
                    </View>
                </Modal>
            </Portal>

            {/* ── Notifications Modal (allowEmail + allowPush) ───────────────── */}
            <Portal>
                <Modal visible={showNotifications} onDismiss={() => setShowNotifications(false)} contentContainerStyle={styles.modal}>
                    <Text variant="titleLarge" style={styles.modalTitle}>Notifications</Text>
                    <Text style={styles.modalSub}>Choose how you want to receive updates.</Text>
                    <View style={styles.toggleRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.toggleLabel}>Email Notifications</Text>
                            <Text style={styles.toggleHint}>Receive updates via email</Text>
                        </View>
                        <Switch value={notifEmail} onValueChange={setNotifEmail} trackColor={{ true: COLORS.primary }} />
                    </View>
                    <Divider style={{ marginVertical: 4 }} />
                    <View style={styles.toggleRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.toggleLabel}>Push Notifications</Text>
                            <Text style={styles.toggleHint}>Receive alerts on this device</Text>
                        </View>
                        <Switch value={notifPush} onValueChange={setNotifPush} trackColor={{ true: COLORS.primary }} />
                    </View>
                    <View style={styles.modalBtns}>
                        <Button mode="outlined" onPress={() => setShowNotifications(false)} textColor={COLORS.textSecondary} style={{ flex: 1 }}>Cancel</Button>
                        <Button mode="contained" onPress={handleSaveNotifications} buttonColor={COLORS.primary} style={{ flex: 1 }}>Save</Button>
                    </View>
                </Modal>
            </Portal>
        </ScrollView>
    );
}

function ActionRow({ icon, label, onPress }: { icon: string; label: string; onPress?: () => void }) {
    return (
        <TouchableOpacity style={actionStyles.btn} onPress={onPress} activeOpacity={0.6}>
            <View style={actionStyles.row}>
                <View style={actionStyles.iconBg}>
                    <MaterialCommunityIcons name={icon} size={20} color={COLORS.primary} />
                </View>
                <Text style={actionStyles.labelText}>{label}</Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.border} />
            </View>
        </TouchableOpacity>
    );
}

const actionStyles = StyleSheet.create({
    btn: { paddingVertical: 10 },
    row: { flexDirection: 'row', alignItems: 'center' },
    iconBg: { width: 34, height: 34, borderRadius: 9, backgroundColor: COLORS.primary + '12', justifyContent: 'center', alignItems: 'center' },
    labelText: { flex: 1, marginLeft: 14, color: COLORS.text, fontSize: 15 },
});

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    content: { padding: 16 },

    header: {
        alignItems: 'center', padding: 24, borderRadius: 16,
        backgroundColor: COLORS.surface, marginBottom: 16,
        borderWidth: 1, borderColor: COLORS.border,
    },
    avatar: { backgroundColor: COLORS.primary, marginBottom: 12 },
    name: { color: COLORS.text, fontWeight: '700' },
    roleTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, backgroundColor: COLORS.primary + '12', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    roleText: { color: COLORS.primary, fontSize: 12, fontWeight: '600' },
    bio: { color: COLORS.textSecondary, marginTop: 10, textAlign: 'center', lineHeight: 20 },
    phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
    phone: { color: COLORS.textSecondary, fontSize: 13 },

    statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    statCard: { flex: 1, alignItems: 'center', padding: 14, borderRadius: 12, backgroundColor: COLORS.surface },
    statValue: { color: COLORS.primary, fontWeight: '700', fontSize: 20, marginTop: 6 },
    statLabel: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },

    actionsCard: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 16, marginBottom: 16 },
    divider: { backgroundColor: COLORS.border, marginVertical: 2 },

    credCard: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 16, marginBottom: 16 },
    credTitle: { color: COLORS.text, fontWeight: '700', marginBottom: 10 },
    credItem: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    credText: { color: COLORS.textSecondary, flex: 1, fontSize: 14 },

    logoutBtn: { borderColor: COLORS.error + '60', marginBottom: 32 },

    modal: { backgroundColor: COLORS.surface, padding: 24, margin: 20, borderRadius: 16 },
    modalTitle: { color: COLORS.text, fontWeight: '700', marginBottom: 6 },
    modalSub: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 16 },
    input: { marginBottom: 12, backgroundColor: COLORS.surfaceLight },
    modalBtns: { flexDirection: 'row', gap: 10, marginTop: 16 },

    uploadBox: { alignItems: 'center', padding: 24, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border, borderStyle: 'dashed', marginBottom: 8 },
    uploadHint: { color: COLORS.textSecondary, textAlign: 'center', marginTop: 10, fontSize: 13 },

    templateCard: { marginBottom: 8, backgroundColor: COLORS.surfaceLight, borderColor: COLORS.border, borderRadius: 10 },
    templateRow: { flexDirection: 'row', alignItems: 'center' },
    colorDot: { width: 20, height: 20, borderRadius: 10 },
    templateName: { color: COLORS.text, fontWeight: '600', fontSize: 14 },
    templateMeta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },

    certPreviewCard: {
        backgroundColor: COLORS.surfaceLight, borderRadius: 12,
        padding: 20, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border,
    },
    certPreviewHeader: { flexDirection: 'row', marginBottom: 12 },
    certPreviewDot: { width: 14, height: 14, borderRadius: 7 },
    certPreviewLabel: { color: COLORS.textSecondary, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
    certPreviewType: { fontSize: 13, fontWeight: '700', marginTop: 2 },
    certPreviewTitle: { color: COLORS.text, fontSize: 18, fontWeight: '700', marginTop: 4 },
    certPreviewName: { color: COLORS.text, fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: 10 },
    certPreviewStats: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 8 },
    certStat: { alignItems: 'center' },
    certStatValue: { fontSize: 24, fontWeight: '800' },
    certStatLabel: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
    certPreviewOrg: { color: COLORS.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 8 },
    signatoryRow: { alignItems: 'center' },
    signatoryLine: { width: 120, height: 1, backgroundColor: COLORS.border, marginBottom: 6 },
    signatoryName: { fontSize: 13, fontWeight: '700' },
    signatoryTitle: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },

    emptyBox: { alignItems: 'center', padding: 24 },

    toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
    toggleLabel: { color: COLORS.text, fontSize: 15, fontWeight: '500' },
    toggleHint: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
    complianceRow: { flexDirection: 'row', alignItems: 'center' },
});
