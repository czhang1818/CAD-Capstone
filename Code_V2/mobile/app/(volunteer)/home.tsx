import { useState, useCallback, useEffect, useRef } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, TouchableOpacity, ScrollView, Switch, Text as RNText } from 'react-native';
import { Searchbar, Card, Text, Button, ActivityIndicator } from 'react-native-paper';
import MapView, { Marker, Circle, Callout } from 'react-native-maps';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { COLORS } from '../../constants/config';
import { useAuthStore } from '../../stores/authStore';
import { opportunityService } from '../../services/opportunities';
import { OpportunityRecommendation, OpportunitySummary } from '../../types/opportunity';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const CATEGORIES = ['', 'Community', 'Environment', 'Education', 'Health', 'Technology'];

const CATEGORY_STYLE: Record<string, { bg: string; text: string }> = {
    'Community': { bg: '#fff1f2', text: '#e11d48' },
    'Environment': { bg: '#ecfdf5', text: '#059669' },
    'Education': { bg: '#fffbeb', text: '#d97706' },
    'Health': { bg: '#eff6ff', text: '#2563eb' },
    'Technology': { bg: '#f5f3ff', text: '#7c3aed' },
};

const CHIP_INACTIVE: Record<string, string> = {
    'Community': '#e11d48',
    'Environment': '#059669',
    'Education': '#d97706',
    'Health': '#2563eb',
    'Technology': '#7c3aed',
};

function asRecommendation(o: OpportunitySummary): OpportunityRecommendation {
    return { ...o, distanceKm: null, recommendationScore: 0, matchedSkillCount: 0, requiredSkillCount: 0 };
}

export default function HomeScreen() {
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [availableOnly, setAvailableOnly] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [opportunities, setOpportunities] = useState<OpportunityRecommendation[]>([]);

    // Map state
    const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
    const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
    const [locationStatus, setLocationStatus] = useState<'idle' | 'locating' | 'ready' | 'denied'>('idle');
    const [selectedOppId, setSelectedOppId] = useState<string | null>(null);
    const mapRef = useRef<MapView>(null);

    const { linkedGrainId, userId } = useAuthStore();

    const fetchOpportunities = useCallback(async (currentCoords?: { lat: number; lon: number } | null) => {
        try {
            if (!linkedGrainId || !userId) { setLoading(false); return; }
            const c = currentCoords !== undefined ? currentCoords : coords;
            if (c) {
                const result = await opportunityService.recommendForVolunteer({
                    volunteerId: userId,
                    lat: c.lat,
                    lon: c.lon,
                    query: search || undefined,
                    category: selectedCategory || undefined,
                    take: 500,
                });
                setOpportunities(result.opportunities);
            } else {
                const data = await opportunityService.search(search || undefined, selectedCategory || undefined);
                setOpportunities(data.map(asRecommendation));
            }
        } catch (err: any) {
            console.log('Fetch error:', err.message);
        } finally {
            setLoading(false);
        }
    }, [linkedGrainId, userId, coords, search, selectedCategory]);

    useEffect(() => { fetchOpportunities(); }, []);

    // Request location when switching to map view
    useEffect(() => {
        if (viewMode !== 'map' || locationStatus !== 'idle') return;
        (async () => {
            setLocationStatus('locating');
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                setLocationStatus('denied');
                return;
            }
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const c = { lat: loc.coords.latitude, lon: loc.coords.longitude };
            setCoords(c);
            setLocationStatus('ready');
            fetchOpportunities(c);
        })();
    }, [viewMode]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchOpportunities();
        setRefreshing(false);
    }, [fetchOpportunities]);

    const filtered = opportunities.filter(o => {
        const matchesSearch =
            o.title.toLowerCase().includes(search.toLowerCase()) ||
            o.category.toLowerCase().includes(search.toLowerCase()) ||
            o.organizationName.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = !selectedCategory || o.category === selectedCategory;
        const matchesAvailable = !availableOnly || o.availableSpots > 0;
        return matchesSearch && matchesCategory && matchesAvailable;
    });

    const mappableOpps = filtered.filter(o => o.latitude != null && o.longitude != null);
    const hasActiveFilters = selectedCategory !== '' || availableOnly;

    const resetFilters = () => {
        setSearch('');
        setSelectedCategory('');
        setAvailableOnly(false);
    };

    if (loading) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={{ color: COLORS.textSecondary, marginTop: 12, fontSize: 14 }}>Loading opportunities...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Search bar */}
            <Searchbar
                placeholder="Search..."
                value={search}
                onChangeText={setSearch}
                style={styles.searchbar}
                iconColor={COLORS.textSecondary}
                inputStyle={{ color: COLORS.text, fontSize: 14 }}
            />

            {/* Category filter chips */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRow}
                style={styles.filterScroll}
            >
                {CATEGORIES.map(cat => {
                    const active = selectedCategory === cat;
                    const label = cat || 'All';
                    const inactiveColor = cat ? CHIP_INACTIVE[cat] : COLORS.textSecondary;
                    return (
                        <TouchableOpacity
                            key={label}
                            style={[
                                styles.filterChip,
                                active
                                    ? styles.filterChipActive
                                    : { borderColor: inactiveColor + '40', backgroundColor: COLORS.surface }
                            ]}
                            onPress={() => setSelectedCategory(cat)}
                        >
                            <RNText style={[
                                styles.filterChipText,
                                active ? styles.filterChipTextActive : { color: inactiveColor }
                            ]}>
                                {label}
                            </RNText>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {/* Available only toggle + Map/List toggle */}
            <View style={styles.controlsRow}>
                <View style={styles.availableRow}>
                    <MaterialCommunityIcons name="account-check-outline" size={16} color={availableOnly ? COLORS.primary : COLORS.textSecondary} />
                    <Text style={[styles.availableLabel, availableOnly && { color: COLORS.text }]}>Available only</Text>
                    <Switch
                        value={availableOnly}
                        onValueChange={setAvailableOnly}
                        trackColor={{ false: COLORS.border, true: COLORS.primary + '60' }}
                        thumbColor={availableOnly ? COLORS.primary : COLORS.textSecondary}
                    />
                </View>

                {/* Map / List toggle */}
                <View style={styles.toggleRow}>
                    <TouchableOpacity
                        style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnActive]}
                        onPress={() => setViewMode('list')}
                    >
                        <MaterialCommunityIcons name="format-list-bulleted" size={18}
                            color={viewMode === 'list' ? '#fff' : COLORS.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.toggleBtn, viewMode === 'map' && styles.toggleBtnActive]}
                        onPress={() => setViewMode('map')}
                    >
                        <MaterialCommunityIcons name="map-outline" size={18}
                            color={viewMode === 'map' ? '#fff' : COLORS.textSecondary} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Results count */}
            <View style={styles.resultsHeader}>
                <Text style={styles.resultsCount}>
                    {viewMode === 'map'
                        ? `${mappableOpps.length} nearby on map`
                        : `${filtered.length} opportunities found`}
                </Text>
                {hasActiveFilters && (
                    <Button compact mode="text" textColor={COLORS.primary} onPress={resetFilters}>
                        Reset filters
                    </Button>
                )}
            </View>

            {/* MAP VIEW */}
            {viewMode === 'map' && (
                <View style={styles.mapContainer}>
                    {locationStatus === 'locating' && (
                        <View style={styles.mapOverlay}>
                            <ActivityIndicator size="small" color={COLORS.primary} />
                            <RNText style={styles.mapOverlayText}>Getting your location...</RNText>
                        </View>
                    )}
                    {locationStatus === 'denied' && (
                        <View style={styles.mapOverlay}>
                            <MaterialCommunityIcons name="map-marker-off" size={32} color={COLORS.textSecondary} />
                            <RNText style={styles.mapOverlayText}>Location denied — showing all opportunities</RNText>
                        </View>
                    )}
                    <MapView
                        ref={mapRef}
                        style={styles.map}
                        initialRegion={{
                            latitude: coords?.lat ?? 43.4643,
                            longitude: coords?.lon ?? -80.5204,
                            latitudeDelta: 0.15,
                            longitudeDelta: 0.15,
                        }}
                        showsUserLocation={false}
                    >
                        {/* User location pin + 5km radius */}
                        {coords && (
                            <>
                                <Marker
                                    coordinate={{ latitude: coords.lat, longitude: coords.lon }}
                                    pinColor="blue"
                                    title="You"
                                />
                                <Circle
                                    center={{ latitude: coords.lat, longitude: coords.lon }}
                                    radius={5000}
                                    fillColor="rgba(59,130,246,0.08)"
                                    strokeColor="rgba(59,130,246,0.5)"
                                    strokeWidth={2}
                                />
                            </>
                        )}

                        {/* Opportunity pins */}
                        {mappableOpps.map(opp => (
                            <Marker
                                key={opp.opportunityId}
                                coordinate={{ latitude: opp.latitude!, longitude: opp.longitude! }}
                                pinColor={selectedOppId === opp.opportunityId ? 'orange' : 'green'}
                                onPress={() => setSelectedOppId(opp.opportunityId)}
                            >
                                <Callout onPress={() => router.push({
                                    pathname: '/(volunteer)/opportunity-detail',
                                    params: { id: opp.opportunityId }
                                })}>
                                    <View style={styles.callout}>
                                        <RNText style={styles.calloutTitle} numberOfLines={2}>{opp.title}</RNText>
                                        <RNText style={styles.calloutOrg}>{opp.organizationName}</RNText>
                                        {opp.distanceKm != null && (
                                            <RNText style={styles.calloutDist}>{opp.distanceKm.toFixed(1)} km away</RNText>
                                        )}
                                        <RNText style={styles.calloutTap}>Tap to view details →</RNText>
                                    </View>
                                </Callout>
                            </Marker>
                        ))}
                    </MapView>

                    {/* My Location button */}
                    <TouchableOpacity
                        style={styles.myLocationBtn}
                        onPress={() => {
                            if (coords) {
                                mapRef.current?.animateToRegion({
                                    latitude: coords.lat,
                                    longitude: coords.lon,
                                    latitudeDelta: 0.08,
                                    longitudeDelta: 0.08,
                                }, 800);
                            } else {
                                setLocationStatus('idle');
                            }
                        }}
                    >
                        <MaterialCommunityIcons name="crosshairs-gps" size={20} color={COLORS.primary} />
                        <RNText style={styles.myLocationText}>My Location</RNText>
                    </TouchableOpacity>

                    {/* Map Legend */}
                    <View style={styles.legend}>
                        <RNText style={styles.legendTitle}>MAP LEGEND</RNText>
                        <View style={styles.legendRow}>
                            <View style={[styles.legendDot, { backgroundColor: '#3b82f6' }]} />
                            <RNText style={styles.legendLabel}>You</RNText>
                        </View>
                        <View style={styles.legendRow}>
                            <View style={[styles.legendDot, { backgroundColor: '#22c55e' }]} />
                            <RNText style={styles.legendLabel}>Opportunity</RNText>
                        </View>
                        <View style={styles.legendRow}>
                            <View style={[styles.legendDot, { backgroundColor: '#f97316' }]} />
                            <RNText style={styles.legendLabel}>Selected</RNText>
                        </View>
                    </View>
                </View>
            )}

            {/* LIST VIEW */}
            {viewMode === 'list' && (
                <FlatList
                    data={filtered}
                    keyExtractor={(item) => item.opportunityId}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
                    renderItem={({ item }) => {
                        const catStyle = CATEGORY_STYLE[item.category] ?? { bg: COLORS.primary + '15', text: COLORS.primary };
                        return (
                            <TouchableOpacity
                                onPress={() => router.push({ pathname: '/(volunteer)/opportunity-detail', params: { id: item.opportunityId } })}
                                activeOpacity={0.85}
                            >
                                <Card style={styles.card} mode="outlined">
                                    <Card.Content>
                                        <View style={styles.cardHeader}>
                                            <View style={styles.orgRow}>
                                                <MaterialCommunityIcons name="office-building-outline" size={12} color={COLORS.textSecondary} />
                                                <Text style={styles.orgName} numberOfLines={1}>{item.organizationName}</Text>
                                            </View>
                                            <View style={[styles.categoryTag, { backgroundColor: catStyle.bg }]}>
                                                <Text style={[styles.categoryTagText, { color: catStyle.text }]}>
                                                    {item.category}
                                                </Text>
                                            </View>
                                        </View>

                                        <Text variant="titleMedium" style={styles.title} numberOfLines={2}>
                                            {item.title}
                                        </Text>

                                        <View style={styles.metaRow}>
                                            <View style={styles.metaItem}>
                                                <MaterialCommunityIcons name="account-multiple-outline" size={14} color={COLORS.textSecondary} />
                                                <Text style={[styles.metaText, item.availableSpots === 0 && { color: COLORS.error }]}>
                                                    {item.availableSpots} / {item.totalSpots} spots
                                                </Text>
                                            </View>
                                            <View style={styles.metaItem}>
                                                <MaterialCommunityIcons name="calendar-outline" size={14} color={COLORS.textSecondary} />
                                                <Text style={styles.metaText}>
                                                    {new Date(item.publishDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                                </Text>
                                            </View>
                                            {item.distanceKm != null && (
                                                <View style={styles.metaItem}>
                                                    <MaterialCommunityIcons name="map-marker-outline" size={14} color={COLORS.textSecondary} />
                                                    <Text style={styles.metaText}>{item.distanceKm.toFixed(1)} km</Text>
                                                </View>
                                            )}
                                        </View>

                                        {/* Smart match score badge */}
                                        {item.recommendationScore > 0 && (
                                            <View style={styles.scoreBadge}>
                                                <MaterialCommunityIcons name="star-outline" size={12} color="#059669" />
                                                <RNText style={styles.scoreText}>
                                                    {Math.round(item.recommendationScore * 100)}% match
                                                    {item.requiredSkillCount > 0 && ` · ${item.matchedSkillCount}/${item.requiredSkillCount} skills`}
                                                </RNText>
                                            </View>
                                        )}
                                    </Card.Content>
                                    <Card.Actions style={styles.cardActions}>
                                        <View style={[
                                            styles.statusBadge,
                                            { backgroundColor: item.availableSpots > 0 ? COLORS.success + '15' : COLORS.error + '15' }
                                        ]}>
                                            <View style={[
                                                styles.statusDot,
                                                { backgroundColor: item.availableSpots > 0 ? COLORS.success : COLORS.error }
                                            ]} />
                                            <Text style={[
                                                styles.statusText,
                                                { color: item.availableSpots > 0 ? COLORS.success : COLORS.error }
                                            ]}>
                                                {item.availableSpots > 0 ? 'Open' : 'Full'}
                                            </Text>
                                        </View>
                                        <View style={{ flex: 1 }} />
                                        <Text style={styles.viewDetails}>View Details →</Text>
                                    </Card.Actions>
                                </Card>
                            </TouchableOpacity>
                        );
                    }}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <MaterialCommunityIcons name="magnify-remove-outline" size={64} color={COLORS.border} />
                            <Text style={styles.emptyTitle}>No Opportunities Found</Text>
                            <Text style={styles.emptyText}>
                                {hasActiveFilters || search
                                    ? 'Try adjusting your search or filters.'
                                    : 'No published opportunities are available right now.'}
                            </Text>
                            {(hasActiveFilters || search) && (
                                <Button compact textColor={COLORS.primary} onPress={resetFilters} style={{ marginTop: 8 }}>
                                    Reset Filters
                                </Button>
                            )}
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    searchbar: { margin: 14, marginBottom: 6, backgroundColor: COLORS.surface, borderRadius: 10 },

    filterScroll: { flexGrow: 0, height: 48 },
    filterRow: { paddingHorizontal: 16, paddingVertical: 2, gap: 8, alignItems: 'center' },
    filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
    filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
    filterChipText: { fontSize: 13, fontWeight: '600' },
    filterChipTextActive: { color: '#fff', fontWeight: '700' },

    controlsRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 6,
        marginHorizontal: 16, marginBottom: 4,
        backgroundColor: COLORS.surface,
        borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    },
    availableRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    availableLabel: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '500' },

    toggleRow: { flexDirection: 'row', gap: 4 },
    toggleBtn: {
        padding: 7, borderRadius: 8,
        backgroundColor: COLORS.surfaceLight,
    },
    toggleBtnActive: { backgroundColor: COLORS.primary },

    resultsHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingBottom: 4, marginTop: 4,
    },
    resultsCount: { color: COLORS.textSecondary, fontSize: 13 },

    // Map
    mapContainer: { flex: 1, position: 'relative' },
    map: { flex: 1 },
    mapOverlay: {
        position: 'absolute', top: 12, left: 16, right: 16, zIndex: 10,
        backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 10,
        padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8,
        shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
    },
    mapOverlayText: { color: COLORS.textSecondary, fontSize: 13 },

    callout: { width: 200, padding: 4 },
    calloutTitle: { fontWeight: '700', fontSize: 13, color: COLORS.text, marginBottom: 2 },
    calloutOrg: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 2 },
    calloutDist: { fontSize: 12, color: COLORS.primary, fontWeight: '600', marginBottom: 4 },
    calloutTap: { fontSize: 11, color: COLORS.primary, fontWeight: '700' },

    legend: {
        position: 'absolute', bottom: 16, right: 16,
        backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 12,
        padding: 12, zIndex: 10,
        shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
    },
    myLocationBtn: {
        position: 'absolute', top: 12, alignSelf: 'center', zIndex: 10,
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#fff', borderRadius: 20,
        paddingHorizontal: 14, paddingVertical: 8,
        shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, elevation: 4,
    },
    myLocationText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
    legendTitle: { fontSize: 9, fontWeight: '800', color: COLORS.textSecondary, letterSpacing: 1, marginBottom: 6 },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendLabel: { fontSize: 12, fontWeight: '600', color: COLORS.text },

    // List
    list: { padding: 16, paddingTop: 4 },
    card: { marginBottom: 12, backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 16 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    orgRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, marginRight: 8 },
    orgName: { color: COLORS.textSecondary, fontSize: 12, flex: 1 },
    categoryTag: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
    categoryTagText: { fontSize: 11, fontWeight: '700' },
    title: { color: COLORS.text, fontWeight: '700', fontSize: 15, marginBottom: 10 },
    metaRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { color: COLORS.textSecondary, fontSize: 12 },
    scoreBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        marginTop: 8, backgroundColor: '#ecfdf5',
        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, alignSelf: 'flex-start',
    },
    scoreText: { fontSize: 11, fontWeight: '700', color: '#059669' },
    cardActions: { paddingTop: 0, paddingHorizontal: 16, paddingBottom: 12, alignItems: 'center' },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusText: { fontSize: 11, fontWeight: '700' },
    viewDetails: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },

    empty: { alignItems: 'center', paddingTop: 60 },
    emptyTitle: { color: COLORS.text, fontWeight: '700', fontSize: 18, marginTop: 14 },
    emptyText: { color: COLORS.textSecondary, marginTop: 6, textAlign: 'center', lineHeight: 20 },
});
