import { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, Surface, ActivityIndicator, Button, Card, Chip } from 'react-native-paper';
import { COLORS } from '../../constants/config';
import { adminService, GrainDistributionSummary, SystemInfoSummary } from '../../services/admin';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

export default function SystemScreen() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [grainDist, setGrainDist] = useState<GrainDistributionSummary | null>(null);
    const [sysInfo, setSysInfo] = useState<SystemInfoSummary | null>(null);
    const [error, setError] = useState('');

    const fetchData = useCallback(async () => {
        setError('');
        try {
            const [dist, info] = await Promise.all([
                adminService.getGrainDistribution(),
                adminService.getSystemInfo(),
            ]);
            setGrainDist(dist);
            setSysInfo(info);
        } catch (err: any) {
            setError(err.message || 'Failed to load system info');
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(useCallback(() => {
        fetchData();
    }, [fetchData]));

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchData();
        setRefreshing(false);
    }, [fetchData]);

    if (loading) {
        return (<View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={COLORS.primary} /></View>);
    }

    if (error) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
                <MaterialCommunityIcons name="server-off" size={56} color={COLORS.error} />
                <Text style={{ color: COLORS.error, marginTop: 16, textAlign: 'center' }}>{error}</Text>
                <Button mode="contained" onPress={fetchData} buttonColor={COLORS.primary} style={{ marginTop: 16 }}>Retry</Button>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}>

            {/* Overview */}
            <Surface style={styles.header} elevation={2}>
                <MaterialCommunityIcons name="server" size={36} color={COLORS.primary} />
                <Text variant="headlineSmall" style={{ color: COLORS.text, marginTop: 8 }}>System Monitor</Text>
                {sysInfo && <Text style={{ color: COLORS.textSecondary, fontSize: 11 }}>Generated: {new Date(sysInfo.generatedAtUtc).toLocaleString()}</Text>}
            </Surface>

            {/* Summary Stats */}
            {sysInfo && (
                <View style={styles.grid}>
                    <Surface style={styles.statCard} elevation={2}>
                        <MaterialCommunityIcons name="server-network" size={28} color={COLORS.primary} />
                        <Text variant="headlineMedium" style={styles.statValue}>{sysInfo.totalSilos}</Text>
                        <Text style={styles.statLabel}>Silos</Text>
                    </Surface>
                    <Surface style={styles.statCard} elevation={2}>
                        <MaterialCommunityIcons name="grain" size={28} color={COLORS.success} />
                        <Text variant="headlineMedium" style={styles.statValue}>{sysInfo.totalActivations}</Text>
                        <Text style={styles.statLabel}>Activations</Text>
                    </Surface>
                    <Surface style={styles.statCard} elevation={2}>
                        <MaterialCommunityIcons name="chart-donut" size={28} color={COLORS.secondary} />
                        <Text variant="headlineMedium" style={styles.statValue}>{((sysInfo.overallBusinessRatio || 0) * 100).toFixed(0)}%</Text>
                        <Text style={styles.statLabel}>Business</Text>
                    </Surface>
                </View>
            )}

            {/* Grain Distribution */}
            {grainDist && (
                <>
                    <Text variant="titleMedium" style={styles.sectionTitle}>Grain Distribution</Text>
                    <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginBottom: 12 }}>
                        {grainDist.totalSilos || 0} silos · {grainDist.totalActivations || 0} total activations
                    </Text>
                    {grainDist.silos?.map((silo, i) => (
                        <Card key={i} style={styles.card} mode="outlined">
                            <Card.Content>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <Text style={{ color: COLORS.text, fontWeight: 'bold', fontSize: 14 }}>{silo.silo}</Text>
                                    <Chip compact style={{ backgroundColor: COLORS.primary + '18' }} textStyle={{ color: COLORS.primary, fontSize: 11 }}>
                                        {silo.totalActivations} grains
                                    </Chip>
                                </View>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                    {silo.grainTypes?.slice(0, 8).map((gt, j) => (
                                        <Chip key={j} compact style={{ backgroundColor: COLORS.surfaceLight }} textStyle={{ color: COLORS.textSecondary, fontSize: 10 }}>
                                            {(gt?.grainType || 'Unknown').split('.').pop()}: {gt?.activations || 0}
                                        </Chip>
                                    ))}
                                </View>
                            </Card.Content>
                        </Card>
                    ))}
                </>
            )}

            {/* Silo Health */}
            {sysInfo && (sysInfo.silos?.length || 0) > 0 && (
                <>
                    <Text variant="titleMedium" style={styles.sectionTitle}>Silo Health</Text>
                    {sysInfo.silos?.map((silo, i) => {
                        const alive = silo.isAlive;
                        const cpu = Number(silo.runtime?.cpuUsage) || 0;
                        const mem = Number(silo.runtime?.memoryUsageRatio) || 0;
                        const overloaded = silo.runtime?.isOverloaded ?? false;

                        return (
                            <Card key={i} style={[styles.card, overloaded && { borderColor: COLORS.error }]} mode="outlined">
                                <Card.Content>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                        <Text style={{ color: COLORS.text, fontWeight: 'bold', fontSize: 14 }}>{silo.silo}</Text>
                                        <Chip compact style={{ backgroundColor: alive ? COLORS.success + '18' : COLORS.error + '18' }}
                                            textStyle={{ color: alive ? COLORS.success : COLORS.error, fontSize: 10 }}>
                                            {alive ? '● Online' : '○ Offline'}
                                        </Chip>
                                    </View>
                                    {silo.hostName && <Text style={styles.siloMeta}>Host: {silo.hostName}</Text>}
                                    <Text style={styles.siloMeta}>Status: {silo.status} · {silo.totalActivations} activations</Text>
                                    {silo.runtime && (
                                        <View style={styles.metricsRow}>
                                            <View style={styles.metric}>
                                                <Text style={[styles.metricValue, cpu > 80 && { color: COLORS.error }]}>{cpu.toFixed(1)}%</Text>
                                                <Text style={styles.metricLabel}>CPU</Text>
                                            </View>
                                            <View style={styles.metric}>
                                                <Text style={[styles.metricValue, (mem ?? 0) > 0.8 && { color: COLORS.error }]}>{((mem ?? 0) * 100).toFixed(1)}%</Text>
                                                <Text style={styles.metricLabel}>Memory</Text>
                                            </View>
                                            <View style={styles.metric}>
                                                <Text style={styles.metricValue}>{silo.runtime.clientCount}</Text>
                                                <Text style={styles.metricLabel}>Clients</Text>
                                            </View>
                                            <View style={styles.metric}>
                                                <Text style={styles.metricValue}>{silo.runtime.activationCount}</Text>
                                                <Text style={styles.metricLabel}>Active</Text>
                                            </View>
                                        </View>
                                    )}
                                    {overloaded && (
                                        <View style={styles.overloadedBanner}>
                                            <MaterialCommunityIcons name="alert" size={16} color={COLORS.error} />
                                            <Text style={{ color: COLORS.error, fontSize: 12, marginLeft: 6 }}>Silo is overloaded!</Text>
                                        </View>
                                    )}
                                </Card.Content>
                            </Card>
                        );
                    })}
                </>
            )}

            <View style={{ height: 40 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    content: { padding: 16 },
    header: { alignItems: 'center', padding: 20, borderRadius: 16, backgroundColor: COLORS.surface, marginBottom: 16 },
    grid: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    statCard: { flex: 1, padding: 16, borderRadius: 16, backgroundColor: COLORS.surface, alignItems: 'center' },
    statValue: { color: COLORS.text, marginTop: 8 },
    statLabel: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2, textAlign: 'center' },
    sectionTitle: { color: COLORS.text, marginBottom: 8, marginTop: 8 },
    card: { marginBottom: 10, backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 12 },
    siloMeta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
    metricsRow: { flexDirection: 'row', gap: 16, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
    metric: { alignItems: 'center', flex: 1 },
    metricValue: { color: COLORS.text, fontWeight: 'bold', fontSize: 16 },
    metricLabel: { color: COLORS.textSecondary, fontSize: 10, marginTop: 2 },
    overloadedBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.error + '10', padding: 8, borderRadius: 8, marginTop: 10 },
});
