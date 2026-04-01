import { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { Button, Text, Surface, Card, ActivityIndicator, Portal, Modal, TextInput } from 'react-native-paper';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ExpoLocation from 'expo-location';
import { WebView } from 'react-native-webview';
import { COLORS } from '../../constants/config';
import { useAuthStore } from '../../stores/authStore';
import { volunteerService } from '../../services/volunteers';
import { applicationService } from '../../services/applications';
import { attendanceService } from '../../services/attendance';
import { opportunityService } from '../../services/opportunities';
import { ApplicationStatus, AttendanceStatus } from '../../types/enums';
import { GeoFenceSettings } from '../../types/opportunity';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { uuid } from 'expo-modules-core';

interface ActiveApp {
    id: string;
    oppId: string;
    oppTitle: string;
    shiftId: string;
    shiftStartTime?: string | null;
    attendanceId: string | null;
    attendanceStatus: string | null;
}

export default function CheckInScreen() {
    const { linkedGrainId } = useAuthStore();
    const [loading, setLoading] = useState(true);
    const [activeApps, setActiveApps] = useState<ActiveApp[]>([]);
    const [selectedApp, setSelectedApp] = useState<ActiveApp | null>(null);
    const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
    const [locationLoading, setLocationLoading] = useState(true);
    const [checkedIn, setCheckedIn] = useState(false);
    const [attendanceId, setAttendanceId] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    // GPS state machine (matches web flow)
    const [gpsState, setGpsState] = useState<'idle' | 'locating' | 'ready' | 'error'>('idle');
    const [errMsg, setErrMsg] = useState('');


    // Geofence
    const [geoFence, setGeoFence] = useState<GeoFenceSettings | null>(null);
    const [geoFenceLoading, setGeoFenceLoading] = useState(false);

    // QR scanner (camera)
    const [cameraPermission, requestCameraPermission] = useCameraPermissions();
    const [qrScanning, setQrScanning] = useState(false);
    const scannedRef = useRef(false);

    // Leaflet map WebView ref
    const mapRef = useRef<WebView>(null);
    const mapReady = useRef(false);

    // Feedback state
    const [showFeedback, setShowFeedback] = useState(false);
    const [feedbackRating, setFeedbackRating] = useState('5');
    const [feedbackComment, setFeedbackComment] = useState('');

    // Dispute state
    const [showDispute, setShowDispute] = useState(false);
    const [disputeReason, setDisputeReason] = useState('');
    const [disputeEvidence, setDisputeEvidence] = useState('');

    // Auto-watch user location
    useEffect(() => {
        let subscription: ExpoLocation.LocationSubscription | null = null;
        (async () => {
            const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
            if (status !== 'granted') { setLocationLoading(false); return; }
            subscription = await ExpoLocation.watchPositionAsync(
                { accuracy: ExpoLocation.Accuracy.High, distanceInterval: 5 },
                (loc) => {
                    setLocation({ lat: loc.coords.latitude, lon: loc.coords.longitude });
                    setLocationLoading(false);
                }
            );
        })();
        return () => { subscription?.remove(); };
    }, []);

    const fetchApps = useCallback(async () => {
        try {
            if (!linkedGrainId) return;
            const [apps, attendanceRecords] = await Promise.all([
                applicationService.getForVolunteer(linkedGrainId),
                attendanceService.getByVolunteer(linkedGrainId),
            ]);
            const doneStatuses = [AttendanceStatus.Pending, AttendanceStatus.CheckedOut, AttendanceStatus.Confirmed, AttendanceStatus.Resolved];
            const results: ActiveApp[] = apps
                .filter(a => a.status === ApplicationStatus.Approved || a.status === ApplicationStatus.Completed)
                .map(a => {
                    const rec = attendanceRecords.find(r => r.opportunityId === a.opportunityId);
                    return {
                        id: a.applicationId,
                        oppId: a.opportunityId,
                        oppTitle: `${a.opportunityTitle} (${a.shiftName})`,
                        shiftId: a.shiftId,
                        shiftStartTime: a.shiftStartTime,
                        attendanceId: rec?.attendanceId ?? null,
                        attendanceStatus: rec?.status ?? null,
                    };
                })
                .filter(a => !a.attendanceStatus || !doneStatuses.includes(a.attendanceStatus as AttendanceStatus));
            setActiveApps(results);
        } catch { /* */ } finally {
            setLoading(false);
        }
    }, [linkedGrainId]);

    useEffect(() => { fetchApps(); }, [fetchApps]);

    // Inject user position into map whenever location updates (only if map is ready)
    useEffect(() => {
        if (!location || !mapReady.current) return;
        mapRef.current?.injectJavaScript(
            `updateUser(${location.lat}, ${location.lon}); true;`
        );
    }, [location]);

    // Inject geofence into map when a shift is selected
    useEffect(() => {
        if (!mapReady.current) return;
        if (geoFence) {
            mapRef.current?.injectJavaScript(
                `updateFence(${geoFence.latitude}, ${geoFence.longitude}, ${geoFence.radiusMeters}); true;`
            );
        } else {
            mapRef.current?.injectJavaScript(`clearFence(); true;`);
            if (location) {
                mapRef.current?.injectJavaScript(
                    `centerOn(${location.lat}, ${location.lon}, 15); true;`
                );
            }
        }
    }, [geoFence]);

    // Transition locating → ready once GPS fix arrives
    useEffect(() => {
        if (gpsState === 'locating' && location) {
            setGpsState('ready');
        }
    }, [location, gpsState]);

    const handleSelectApp = async (app: ActiveApp) => {
        setSelectedApp(app);
        setGeoFence(null);
        setGeoFenceLoading(true);
        setGpsState('idle');
        setErrMsg('');
        try {
            const opp = await opportunityService.getById(app.oppId);
            setGeoFence(opp.geoFence ?? null);
        } catch { /* */ } finally {
            setGeoFenceLoading(false);
        }
    };

    // Haversine distance check
    const isInsideGeoFence = (): boolean | null => {
        if (!geoFence || !location) return null;
        const R = 6371000;
        const dLat = ((geoFence.latitude - location.lat) * Math.PI) / 180;
        const dLon = ((geoFence.longitude - location.lon) * Math.PI) / 180;
        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((location.lat * Math.PI) / 180) *
            Math.cos((geoFence.latitude * Math.PI) / 180) *
            Math.sin(dLon / 2) ** 2;
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return dist <= geoFence.radiusMeters;
    };

    // Step 1: user taps "Check In Now" — start locating
    const handleLocate = () => {
        if (!selectedApp) {
            Alert.alert('Missing', 'Select an event first.');
            return;
        }
        if (location) {
            setGpsState('ready');
        } else {
            setGpsState('locating');
            // location watcher is already running; useEffect will fire when it arrives
        }
    };

    // Step 2: user taps "Confirm Check-In"
    const handleCheckIn = async () => {
        if (!location || !selectedApp || !linkedGrainId) return;
        if (!selectedApp.attendanceId) {
            setErrMsg('No attendance record found for this shift. Please contact your coordinator.');
            setGpsState('error');
            return;
        }
        setActionLoading(true);
        try {
            await attendanceService.checkIn(selectedApp.attendanceId, { lat: location.lat, lon: location.lon, proofPhotoUrl: '' });
            setAttendanceId(selectedApp.attendanceId);
            setCheckedIn(true);
            setGpsState('idle');
            Alert.alert('Checked In!', 'You have successfully checked in.');
        } catch (err: any) {
            const msg = err?.response?.data;
            setErrMsg(typeof msg === 'string' ? msg : 'Check-in failed. Please try again.');
            setGpsState('error');
        } finally {
            setActionLoading(false);
        }
    };


    // QR Check-In: parse vsms://shift/<opportunityId>/<shiftId>
    const handleBarcodeScanned = async ({ data }: { data: string }) => {
        if (scannedRef.current || !linkedGrainId) return;
        scannedRef.current = true;
        setQrScanning(false);

        try {
            const prefix = 'vsms://shift/';
            if (!data.startsWith(prefix)) {
                Alert.alert('Invalid QR Code', 'This is not a valid shift check-in code.', [
                    { text: 'Scan Again', onPress: () => { scannedRef.current = false; setQrScanning(true); } },
                    { text: 'Cancel' },
                ]);
                return;
            }
            const parts = data.slice(prefix.length).split('/');
            if (parts.length < 2) {
                Alert.alert('Invalid QR Code', 'QR code format is invalid.', [
                    { text: 'Scan Again', onPress: () => { scannedRef.current = false; setQrScanning(true); } },
                    { text: 'Cancel' },
                ]);
                return;
            }
            const [opportunityId, shiftId] = parts;
            const apps = await applicationService.getForVolunteer(linkedGrainId);
            let match = apps.find(
                a => a.opportunityId === opportunityId && a.shiftId === shiftId &&
                    (a.status === ApplicationStatus.Approved || a.status === ApplicationStatus.Completed)
            );

            // No approved application — apply to this shift on the spot
            if (!match) {
                setActionLoading(true);
                const { applicationId } = await opportunityService.apply(opportunityId, {
                    volunteerId: linkedGrainId,
                    shiftId,
                    idempotencyKey: uuid.v4(),
                });
                await fetchApps();
                const refreshedApps = await applicationService.getForVolunteer(linkedGrainId);
                match = refreshedApps.find(a => a.applicationId === applicationId);
                if (!match) {
                    Alert.alert('Applied', 'You have been added to this shift. Check in will be available once approved by the coordinator.');
                    scannedRef.current = false;
                    setActionLoading(false);
                    return;
                }
            }

            setActionLoading(true);
            const matchedApp = activeApps.find(a => a.id === match!.applicationId)
                ?? (await (async () => { await fetchApps(); return activeApps.find(a => a.id === match!.applicationId); })());
            const existingAttendanceId = matchedApp?.attendanceId;
            if (!existingAttendanceId) {
                Alert.alert('Not Ready', 'No attendance record found for this shift. Please contact your coordinator.', [
                    { text: 'OK', onPress: () => { scannedRef.current = false; } },
                ]);
                setActionLoading(false);
                return;
            }
            await attendanceService.checkIn(existingAttendanceId, { lat: 0, lon: 0, proofPhotoUrl: '' });
            setAttendanceId(existingAttendanceId);
            setSelectedApp({
                id: match!.applicationId,
                oppId: match!.opportunityId,
                oppTitle: `${match!.opportunityTitle} (${match!.shiftName})`,
                shiftId: match!.shiftId,
                shiftStartTime: match!.shiftStartTime,
                attendanceId: existingAttendanceId,
                attendanceStatus: AttendanceStatus.CheckedIn,
            });
            setCheckedIn(true);
            Alert.alert('Checked In!', `Successfully checked in to "${match!.opportunityTitle}".`);
        } catch (err: any) {
            Alert.alert('Check-In Failed', err.response?.data?.toString() || 'An error occurred.');
            scannedRef.current = false;
        } finally {
            setActionLoading(false);
        }
    };

    const handleOpenQrScanner = async () => {
        if (!cameraPermission?.granted) {
            const result = await requestCameraPermission();
            if (!result.granted) {
                Alert.alert('Permission Denied', 'Camera access is required to scan QR codes.');
                return;
            }
        }
        scannedRef.current = false;
        setQrScanning(true);
    };

    const handleCheckOut = async () => {
        if (!attendanceId) return;
        setActionLoading(true);
        try {
            await attendanceService.checkOut(attendanceId);
            Alert.alert('Checked Out', 'Would you like to leave feedback?', [
                { text: 'Skip', onPress: () => { resetState(); fetchApps(); } },
                { text: 'Leave Feedback', onPress: () => setShowFeedback(true) },
            ]);
        } catch (err: any) {
            Alert.alert('Error', err.response?.data?.toString() || 'Check-out failed');
        } finally {
            setActionLoading(false);
        }
    };

    const handleSubmitFeedback = async () => {
        if (!linkedGrainId || !selectedApp) return;
        setActionLoading(true);
        try {
            await volunteerService.submitFeedback(linkedGrainId, {
                opportunityId: selectedApp.oppId,
                rating: parseInt(feedbackRating) || 5,
                comment: feedbackComment,
            });
            Alert.alert('Thank You', 'Feedback submitted!');
        } catch {
            Alert.alert('Note', 'Feedback could not be submitted');
        } finally {
            setShowFeedback(false);
            resetState();
            fetchApps();
            setActionLoading(false);
        }
    };

    const handleRaiseDispute = async () => {
        if (!attendanceId || !disputeReason) return;
        setActionLoading(true);
        try {
            await attendanceService.dispute(attendanceId, { reason: disputeReason, evidenceUrl: disputeEvidence });
            Alert.alert('Submitted', 'Your dispute has been submitted for admin review.');
            setShowDispute(false);
            setDisputeReason('');
            setDisputeEvidence('');
        } catch (err: any) {
            Alert.alert('Error', err.response?.data?.toString() || 'Failed to submit dispute');
        } finally {
            setActionLoading(false);
        }
    };

    const resetState = () => {
        setCheckedIn(false);
        setAttendanceId(null);
        setSelectedApp(null);
        setGeoFence(null);
        setGpsState('idle');
        setErrMsg('');

        setFeedbackRating('5');
        setFeedbackComment('');
        scannedRef.current = false;
    };

    // QR scanner fullscreen
    if (qrScanning) {
        return (
            <View style={styles.scannerContainer}>
                <CameraView
                    style={styles.scanner}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={handleBarcodeScanned}
                />
                <View style={styles.scannerOverlay}>
                    <View style={styles.scannerFrame} />
                    <Text style={styles.scannerHint}>Point at the shift QR code</Text>
                    <Button
                        mode="contained"
                        onPress={() => { setQrScanning(false); scannedRef.current = false; }}
                        buttonColor="rgba(0,0,0,0.6)"
                        style={styles.cancelScanBtn}
                    >
                        Cancel
                    </Button>
                </View>
            </View>
        );
    }

    if (loading) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    const insideFence = isInsideGeoFence();

    const leafletHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { height: 100%; width: 100%; background: #f5f5f4; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: true, attributionControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    map.setView([43.6532, -79.3832], 13);

    var userMarker = null, userCircle = null, fenceMarker = null, fenceCircle = null;

    var userIcon = L.divIcon({
      className: '',
      html: '<div style="width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>',
      iconSize: [16, 16], iconAnchor: [8, 8]
    });

    function updateUser(lat, lon) {
      if (userMarker) map.removeLayer(userMarker);
      if (userCircle) map.removeLayer(userCircle);
      userMarker = L.marker([lat, lon], { icon: userIcon }).addTo(map);
      userCircle = L.circle([lat, lon], { radius: 15, color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.3, weight: 2 }).addTo(map);
      if (!fenceMarker) map.setView([lat, lon], 16);
    }

    function updateFence(lat, lon, radius) {
      if (fenceMarker) map.removeLayer(fenceMarker);
      if (fenceCircle) map.removeLayer(fenceCircle);
      fenceMarker = L.marker([lat, lon]).addTo(map);
      fenceCircle = L.circle([lat, lon], { radius: radius, color: '#f97316', fillColor: '#f97316', fillOpacity: 0.15, weight: 2 }).addTo(map);
      map.setView([lat, lon], 16);
    }

    function clearFence() {
      if (fenceMarker) { map.removeLayer(fenceMarker); fenceMarker = null; }
      if (fenceCircle) { map.removeLayer(fenceCircle); fenceCircle = null; }
    }

    function centerOn(lat, lon, zoom) { map.setView([lat, lon], zoom || 16); }
  </script>
</body>
</html>`;

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {/* ── Leaflet Map ── */}
            <Surface style={styles.mapSurface} elevation={1}>
                <View style={styles.mapHeader}>
                    <MaterialCommunityIcons name="crosshairs-gps" size={18} color={COLORS.primary} />
                    <Text style={styles.mapHeaderTitle}>Live Location</Text>
                    {locationLoading && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginLeft: 6 }} />}
                    {!locationLoading && !location && (
                        <View style={styles.gpsErrorBadge}>
                            <MaterialCommunityIcons name="map-marker-off" size={14} color={COLORS.error} />
                            <Text style={styles.gpsErrorText}>GPS unavailable</Text>
                        </View>
                    )}
                </View>

                <WebView
                    ref={mapRef}
                    source={{ html: leafletHtml }}
                    style={styles.mapWebView}
                    originWhitelist={['*']}
                    scrollEnabled={false}
                    javaScriptEnabled
                    domStorageEnabled
                    onLoad={() => {
                        mapReady.current = true;
                        if (location) {
                            mapRef.current?.injectJavaScript(
                                `updateUser(${location.lat}, ${location.lon}); true;`
                            );
                        }
                        if (geoFence) {
                            mapRef.current?.injectJavaScript(
                                `updateFence(${geoFence.latitude}, ${geoFence.longitude}, ${geoFence.radiusMeters}); true;`
                            );
                        }
                    }}
                />

                {/* Geofence status strip */}
                {selectedApp && !geoFenceLoading && (
                    <View style={[
                        styles.fenceStatusRow,
                        { backgroundColor: insideFence === null
                            ? COLORS.surfaceLight
                            : insideFence ? COLORS.success + '18' : COLORS.error + '18' }
                    ]}>
                        <MaterialCommunityIcons
                            name={insideFence === null ? 'map-marker-radius' : insideFence ? 'check-circle' : 'close-circle-outline'}
                            size={16}
                            color={insideFence === null ? COLORS.textSecondary : insideFence ? COLORS.success : COLORS.error}
                        />
                        <Text style={[styles.fenceStatusText, {
                            color: insideFence === null ? COLORS.textSecondary : insideFence ? COLORS.success : COLORS.error,
                            marginLeft: 8, flex: 1,
                        }]}>
                            {insideFence === null
                                ? geoFence ? `Geofence: ${geoFence.radiusMeters}m radius` : 'No geofence — any location accepted'
                                : insideFence
                                    ? 'Inside geofence — ready to check in'
                                    : 'Outside geofence — move closer to the venue'}
                        </Text>
                        {geoFenceLoading && <ActivityIndicator size="small" color={COLORS.primary} />}
                    </View>
                )}
            </Surface>

            {/* ── Check-In Card ── */}
            <Surface style={styles.card} elevation={1}>
                {!checkedIn ? (
                    <>
                        <View style={styles.cardHeader}>
                            <MaterialCommunityIcons name="map-marker-check" size={22} color={COLORS.primary} />
                            <Text variant="titleMedium" style={styles.cardTitle}>Check In to Event</Text>
                        </View>

                        {/* Step 1: Select Event */}
                        <Text style={styles.stepTitle}>Select Event</Text>
                        {activeApps.length === 0 ? (
                            <Text style={styles.hint}>No upcoming shifts. Use the QR code scanner below to check in at the venue.</Text>
                        ) : (
                            activeApps.map((app) => (
                                <Card
                                    key={app.id}
                                    mode="outlined"
                                    style={[styles.appCard, selectedApp?.id === app.id && styles.selectedCard]}
                                    onPress={() => handleSelectApp(app)}
                                >
                                    <Card.Content style={styles.appRow}>
                                        <MaterialCommunityIcons
                                            name={selectedApp?.id === app.id ? 'radiobox-marked' : 'radiobox-blank'}
                                            size={20}
                                            color={selectedApp?.id === app.id ? COLORS.primary : COLORS.textSecondary}
                                        />
                                        <Text style={styles.appText}>{app.oppTitle}</Text>
                                    </Card.Content>
                                </Card>
                            ))
                        )}

                        {/* Action buttons — GPS state machine (matches web flow) */}
                        {(() => {
                            const checkInOpenTime = selectedApp?.shiftStartTime
                                ? new Date(new Date(selectedApp.shiftStartTime).getTime() - 30 * 60 * 1000)
                                : null;
                            const isTooEarly = checkInOpenTime ? new Date() < checkInOpenTime : false;

                            if (isTooEarly && checkInOpenTime) {
                                return (
                                    <>
                                        <Button mode="contained" disabled buttonColor={COLORS.border} style={styles.mainButton} icon="clock-outline">
                                            Check-In Not Yet Available
                                        </Button>
                                        <Text style={[styles.hint, { marginTop: 4 }]}>
                                            Available from {checkInOpenTime.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </Text>
                                    </>
                                );
                            }

                            if (gpsState === 'idle') return (
                                <>
                                    <Button
                                        mode="contained"
                                        onPress={handleLocate}
                                        buttonColor={COLORS.primary}
                                        style={styles.mainButton}
                                        disabled={!selectedApp || actionLoading || geoFenceLoading}
                                        icon="map-marker-check"
                                    >
                                        Check In Now
                                    </Button>
                                    <View style={styles.dividerRow}>
                                        <View style={styles.dividerLine} />
                                        <Text style={styles.dividerText}>or</Text>
                                        <View style={styles.dividerLine} />
                                    </View>
                                    <Button
                                        mode="outlined"
                                        onPress={handleOpenQrScanner}
                                        textColor={COLORS.secondary}
                                        style={[styles.mainButton, { borderColor: COLORS.secondary }]}
                                        icon="qrcode-scan"
                                        disabled={actionLoading}
                                    >
                                        Scan QR Code
                                    </Button>
                                </>
                            );

                            if (gpsState === 'locating') return (
                                <View style={styles.locatingRow}>
                                    <ActivityIndicator size="small" color={COLORS.primary} />
                                    <Text style={styles.hint}>Getting your location…</Text>
                                </View>
                            );

                            if (gpsState === 'ready') return (
                                <>
                                    <Text style={[styles.hint, { color: COLORS.text, fontWeight: '600' }]}>
                                        📍 Your location detected. Confirm check-in:
                                    </Text>
                                    {errMsg ? <Text style={styles.errorText}>⚠️ {errMsg}</Text> : null}
                                    <View style={styles.rowButtons}>
                                        <Button
                                            mode="outlined"
                                            onPress={() => { setGpsState('idle'); setErrMsg(''); }}
                                            textColor={COLORS.textSecondary}
                                            style={[styles.rowBtn, { borderColor: COLORS.border }]}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            mode="outlined"
                                            onPress={handleLocate}
                                            textColor={COLORS.primary}
                                            style={[styles.rowBtn, { borderColor: COLORS.primary }]}
                                            icon="crosshairs-gps"
                                        >
                                            Refresh
                                        </Button>
                                        <Button
                                            mode="contained"
                                            onPress={handleCheckIn}
                                            buttonColor={COLORS.primary}
                                            style={styles.rowBtn}
                                            loading={actionLoading}
                                            disabled={actionLoading || (geoFence !== null && insideFence !== true)}
                                            icon="check"
                                        >
                                            Confirm
                                        </Button>
                                    </View>
                                </>
                            );

                            // gpsState === 'error'
                            return (
                                <>
                                    <Text style={styles.errorText}>⚠️ {errMsg}</Text>
                                    <View style={styles.rowButtons}>
                                        <Button
                                            mode="contained"
                                            onPress={handleOpenQrScanner}
                                            buttonColor={COLORS.success}
                                            style={styles.rowBtn}
                                            icon="qrcode-scan"
                                            disabled={actionLoading}
                                        >
                                            Scan QR Code
                                        </Button>
                                        <Button
                                            mode="outlined"
                                            onPress={() => { setGpsState('idle'); setErrMsg(''); }}
                                            textColor={COLORS.textSecondary}
                                            style={[styles.rowBtn, { borderColor: COLORS.border }]}
                                        >
                                            Retry GPS
                                        </Button>
                                    </View>
                                </>
                            );
                        })()}
                    </>
                ) : (
                    <>
                        <View style={styles.cardHeader}>
                            <MaterialCommunityIcons name="check-decagram" size={22} color={COLORS.success} />
                            <Text variant="titleMedium" style={[styles.cardTitle, { color: COLORS.success }]}>
                                Checked In
                            </Text>
                        </View>
                        <View style={styles.checkedInBadge}>
                            <MaterialCommunityIcons name="calendar-check" size={16} color={COLORS.textSecondary} />
                            <Text style={styles.checkedInText} numberOfLines={2}>{selectedApp?.oppTitle}</Text>
                        </View>
                        <Button
                            mode="contained"
                            onPress={handleCheckOut}
                            buttonColor={COLORS.secondary}
                            style={styles.mainButton}
                            loading={actionLoading}
                            disabled={actionLoading}
                            icon="logout"
                        >
                            Check Out
                        </Button>
                        <Button
                            mode="outlined"
                            onPress={() => setShowDispute(true)}
                            textColor={COLORS.warning}
                            style={[styles.mainButton, { borderColor: COLORS.warning + '60', marginTop: 8 }]}
                            icon="alert-circle-outline"
                        >
                            Raise Dispute
                        </Button>
                    </>
                )}
            </Surface>

            {/* Feedback Modal */}
            <Portal>
                <Modal
                    visible={showFeedback}
                    onDismiss={() => { setShowFeedback(false); resetState(); }}
                    contentContainerStyle={styles.modal}
                >
                    <Text variant="titleLarge" style={styles.modalTitle}>Leave Feedback</Text>
                    <Text style={styles.hint}>How was your experience at "{selectedApp?.oppTitle}"?</Text>
                    <TextInput label="Rating (1-5)" value={feedbackRating} onChangeText={setFeedbackRating}
                        mode="outlined" keyboardType="numeric" style={styles.input}
                        outlineColor={COLORS.border} activeOutlineColor={COLORS.primary} textColor={COLORS.text} />
                    <TextInput label="Comment" value={feedbackComment} onChangeText={setFeedbackComment}
                        mode="outlined" multiline style={styles.input}
                        outlineColor={COLORS.border} activeOutlineColor={COLORS.primary} textColor={COLORS.text} />
                    <Button mode="contained" onPress={handleSubmitFeedback} loading={actionLoading}
                        buttonColor={COLORS.primary} style={{ marginTop: 8 }}>
                        Submit Feedback
                    </Button>
                </Modal>
            </Portal>

            {/* Dispute Modal */}
            <Portal>
                <Modal
                    visible={showDispute}
                    onDismiss={() => setShowDispute(false)}
                    contentContainerStyle={styles.modal}
                >
                    <Text variant="titleLarge" style={styles.modalTitle}>Raise Dispute</Text>
                    <Text style={styles.hint}>Describe the issue with your attendance record.</Text>
                    <TextInput label="Reason" value={disputeReason} onChangeText={setDisputeReason}
                        mode="outlined" multiline style={styles.input}
                        outlineColor={COLORS.border} activeOutlineColor={COLORS.primary} textColor={COLORS.text} />
                    <TextInput label="Evidence URL (optional)" value={disputeEvidence} onChangeText={setDisputeEvidence}
                        mode="outlined" style={styles.input}
                        outlineColor={COLORS.border} activeOutlineColor={COLORS.primary} textColor={COLORS.text} />
                    <Button mode="contained" onPress={handleRaiseDispute} loading={actionLoading}
                        disabled={!disputeReason || actionLoading}
                        buttonColor={COLORS.warning} style={{ marginTop: 8 }}>
                        Submit Dispute
                    </Button>
                </Modal>
            </Portal>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    content: { paddingBottom: 32 },

    // Map
    mapSurface: {
        margin: 16, marginBottom: 0, borderRadius: 16, overflow: 'hidden',
        backgroundColor: COLORS.surface,
    },
    mapHeader: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8,
    },
    mapHeaderTitle: { color: COLORS.text, fontWeight: '700', fontSize: 14, flex: 1 },
    mapWebView: { height: 220, width: '100%' },
    gpsErrorBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    gpsErrorText: { color: COLORS.error, fontSize: 12 },
    fenceStatusRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 14, paddingVertical: 10,
    },
    fenceStatusText: { fontSize: 12, fontWeight: '600' },

    // Card
    card: { margin: 16, padding: 20, borderRadius: 16, backgroundColor: COLORS.surface },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
    cardTitle: { color: COLORS.text, fontWeight: '700' },

    stepTitle: { color: COLORS.primary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    hint: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 12, lineHeight: 18 },

    appCard: { marginBottom: 8, backgroundColor: COLORS.surfaceLight, borderColor: COLORS.border, borderRadius: 10 },
    selectedCard: { borderColor: COLORS.primary, borderWidth: 2 },
    appRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    appText: { color: COLORS.text, flex: 1, fontSize: 13 },

    mainButton: { marginTop: 12, borderRadius: 10 },

    dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 },
    dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
    dividerText: { color: COLORS.textSecondary, fontSize: 12 },
    locatingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
    errorText: { color: COLORS.error, fontSize: 13, fontWeight: '500', marginBottom: 8 },
    rowButtons: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
    rowBtn: { flex: 1, borderRadius: 10 },

    checkedInBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: COLORS.success + '12',
        borderRadius: 10, padding: 12, marginBottom: 8,
    },
    checkedInText: { color: COLORS.text, fontSize: 13, fontWeight: '500', flex: 1 },

    modal: { backgroundColor: COLORS.surface, padding: 24, margin: 20, borderRadius: 16 },
    modalTitle: { color: COLORS.text, fontWeight: '700', marginBottom: 12 },
    input: { marginBottom: 12, backgroundColor: COLORS.surfaceLight },

    // QR scanner
    scannerContainer: { flex: 1, backgroundColor: '#000' },
    scanner: { flex: 1 },
    scannerOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    scannerFrame: { width: 220, height: 220, borderRadius: 16, borderWidth: 3, borderColor: '#fff', backgroundColor: 'transparent' },
    scannerHint: {
        color: '#fff', fontSize: 14, fontWeight: '600', marginTop: 20, textAlign: 'center',
        textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
    },
    cancelScanBtn: { marginTop: 28, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.6)' },
});
