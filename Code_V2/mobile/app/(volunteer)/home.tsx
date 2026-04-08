import { useState, useCallback, useEffect, useRef } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, TouchableOpacity, ScrollView, Switch, Text as RNText, Dimensions } from 'react-native';
import { Searchbar, Card, Text, Button, ActivityIndicator } from 'react-native-paper';
import { WebView } from 'react-native-webview';
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

const MAP_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  html,body,#map{height:100%;width:100%;background:#f5f5f4;}
  .popup-btn{background:#f59e0b;color:#fff;border:none;padding:6px 12px;border-radius:8px;font-size:13px;font-weight:700;width:100%;margin-top:6px;cursor:pointer;}
</style>
</head>
<body>
<div id="map"></div>
<script>
var map = L.map('map',{zoomControl:true,attributionControl:false});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
map.setView([43.4643,-80.5204],13);
var userMarker=null,userCircle=null,pins=[];
function updateUser(lat,lon){
  if(userMarker)map.removeLayer(userMarker);
  if(userCircle)map.removeLayer(userCircle);
  userMarker=L.circleMarker([lat,lon],{radius:10,fillColor:'#3b82f6',color:'#fff',weight:3,fillOpacity:1}).addTo(map).bindPopup('<b>You</b>');
  userCircle=L.circle([lat,lon],{radius:5000,fillColor:'#3b82f6',fillOpacity:0.07,color:'#3b82f6',weight:1}).addTo(map);
  map.setView([lat,lon],13);
}
function loadOpps(opps){
  pins.forEach(function(p){map.removeLayer(p);});
  pins=[];
  opps.forEach(function(o){
    if(!o.lat||!o.lon)return;
    var icon=L.divIcon({html:'<div style="width:16px;height:16px;border-radius:50%;background:#22c55e;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>',iconSize:[16,16],iconAnchor:[8,8],className:''});
    var dist=o.dist!=null?'<br><span style="color:#f59e0b;font-weight:600;">'+o.dist.toFixed(1)+' km</span>':'';
    var popup='<b>'+o.title+'</b><br><span style="color:#78716c;font-size:12px;">'+o.org+'</span>'+dist+'<br><button class="popup-btn" onclick="window.ReactNativeWebView.postMessage(JSON.stringify({type:\\'PIN_DETAIL\\',id:\\''+o.id+'\\'}))">View Details →</button>';
    pins.push(L.marker([o.lat,o.lon],{icon:icon}).addTo(map).bindPopup(popup));
  });
}
function centerOn(lat,lon,zoom){map.setView([lat,lon],zoom||13);}
</script>
</body>
</html>`;

function buildInjectScript(
    opps: OpportunityRecommendation[],
    userCoords: { lat: number; lon: number } | null
): string {
    const oppsJson = JSON.stringify(opps.map(o => ({
        id: o.opportunityId, title: o.title, org: o.organizationName,
        lat: o.latitude, lon: o.longitude, dist: o.distanceKm,
    })));
    const userPart = userCoords
        ? `updateUser(${userCoords.lat},${userCoords.lon});`
        : '';
    return `${userPart} loadOpps(${oppsJson}); true;`;
}

function asRecommendation(o: OpportunitySummary): OpportunityRecommendation {
    return { ...o, distanceKm: null, recommendationScore: 0, matchedSkillCount: 0, requiredSkillCount: 0, skillMatchRatio: 0 };
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
    const mapRef = useRef<WebView>(null);
    const mapReady = useRef(false);

    const injectMapData = useCallback((
        opps: OpportunityRecommendation[],
        userCoords: { lat: number; lon: number } | null
    ) => {
        if (!mapReady.current) return;
        mapRef.current?.injectJavaScript(buildInjectScript(opps, userCoords));
    }, []);

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
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                    setLocationStatus('denied');
                    return;
                }
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
                const c = { lat: loc.coords.latitude, lon: loc.coords.longitude };
                setCoords(c);
                setLocationStatus('ready');
                fetchOpportunities(c);
            } catch {
                setLocationStatus('denied');
            }
        })();
    }, [viewMode, locationStatus]);

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

    // Re-inject map data whenever opps or coords change while map is visible
    useEffect(() => {
        if (viewMode === 'map') {
            injectMapData(mappableOpps, coords);
        }
    }, [mappableOpps, coords, viewMode]);

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
                        <TouchableOpacity style={styles.mapOverlay} onPress={() => setLocationStatus('idle')}>
                            <MaterialCommunityIcons name="map-marker-off" size={20} color={COLORS.textSecondary} />
                            <RNText style={styles.mapOverlayText}>Location unavailable — tap to retry</RNText>
                        </TouchableOpacity>
                    )}
                    <WebView
                        ref={mapRef}
                        style={styles.map}
                        originWhitelist={['*']}
                        javaScriptEnabled
                        domStorageEnabled
                        scrollEnabled={false}
                        source={{ html: MAP_HTML }}
                        onLoad={() => {
                            mapReady.current = true;
                            mapRef.current?.injectJavaScript(buildInjectScript(mappableOpps, coords));
                        }}
                        onMessage={(e) => {
                            try {
                                const msg = JSON.parse(e.nativeEvent.data);
                                if (msg.type === 'PIN_DETAIL') {
                                    router.push({ pathname: '/(volunteer)/opportunity-detail', params: { id: msg.id } });
                                }
                            } catch { }
                        }}
                    />

                    {/* My Location button */}
                    <TouchableOpacity
                        style={styles.myLocationBtn}
                        onPress={() => {
                            if (coords) {
                                mapRef.current?.injectJavaScript(
                                    `map.setView([${coords.lat}, ${coords.lon}], 14); true;`
                                );
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
    mapContainer: { height: Dimensions.get('window').height - 260, position: 'relative' },
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
