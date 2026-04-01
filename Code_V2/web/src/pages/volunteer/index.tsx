import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Clock, CheckCircle2, Award, Calendar, CalendarDays, User, MapPin, Search, Download, BadgeCheck, Camera, Loader2, AlertCircle, ChevronRight, Zap, TrendingUp, Heart, Building2, ExternalLink, Mail, Bell, X, CheckCheck } from 'lucide-react';
import EventCalendar from '../../components/EventCalendar';
import ImpactRing from '../../components/ImpactRing';
import AttendanceHeatmap from '../../components/AttendanceHeatmap';
import StreakCard, { computeStreak } from '../../components/StreakCard';
import StatusBadge from '../../components/StatusBadge';
import { SkeletonDashboard } from '../../components/Skeleton';
import type { ViewName, OpportunitySummary, OpportunityRecommendation, ApplicationSummary, AttendanceSummary, VolunteerProfile, Skill, CertificateTemplate, OpportunityState, Shift, OrganizationSummary, OrgRecommendation, NotificationItem } from '../../types';
import { organizationService } from '../../services/organizations';
import { timeAgo } from '../../utils/timeAgo';
import { ApplicationStatus, AttendanceStatus } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { volunteerService } from '../../services/volunteers';
import { opportunityService } from '../../services/opportunities';
import { applicationService } from '../../services/applications';
import { attendanceService } from '../../services/attendance';
import { notificationService } from '../../services/notifications';
import { skillService } from '../../services/skills';
import { certificateService } from '../../services/certificates';
import { getTemplateStyle, buildAwardCertHtml, buildTrackingFormHtml, type CertActivity } from '../../utils/certGenerator';
import { MiniCalendar } from '../../components/MiniCalendar';
import ActionToast from '../../components/ActionToast';
import ConfirmDialog from '../../components/ConfirmDialog';
import Confetti from '../../components/Confetti';
import ActivityFeed, { type ActivityItem } from '../../components/ActivityFeed';
import { useCountUp } from '../../hooks/useCountUp';
import { useDarkMode } from '../../hooks/useTheme';
const MapView = lazy(() => import('../../components/MapView'));
const OpportunityHeatMap = lazy(() => import('../../components/OpportunityHeatMap'));

/** Animates a number from 0 → target on mount. */
function StatNum({ value, decimals = 0 }: { value: number; decimals?: number }) {
    const animated = useCountUp(value);
    return <>{decimals > 0 ? animated.toFixed(decimals) : String(animated)}</>;
}

// ─── Shared loading / error / empty states ────────────────────
function Spinner() {
    return <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 text-orange-400 animate-spin" /></div>;
}
function ErrorBox({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
    return (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
            <p className="text-rose-700 font-medium">{msg}</p>
            {onRetry && <button onClick={onRetry} className="mt-3 text-sm text-orange-600 font-bold hover:underline">Retry</button>}
        </div>
    );
}
function Empty({ msg }: { msg: string }) {
    return <div className="text-center py-16 text-stone-400 font-medium">{msg}</div>;
}
function getErr(err: any, fallback: string): string { const d = err?.response?.data; if (!d) return fallback; if (typeof d === 'string') return d || fallback; return String(d.error || d.message || d.title || fallback); }
function formatEventTitle(opportunityTitle: string, shiftName?: string | null): string {
    const cleanedShift = shiftName?.trim();
    return cleanedShift ? `${opportunityTitle} · ${cleanedShift}` : opportunityTitle;
}
function formatTimeRange(start: string, end: string): string {
    const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
    return `${new Date(start).toLocaleTimeString([], opts)} – ${new Date(end).toLocaleTimeString([], opts)}`;
}

// ─── GPS Check-In Button ──────────────────────────────────────
function GpsCheckInButton({ attendanceId, opportunityId, shiftStartTime, onDone }: {
    attendanceId: string; opportunityId: string; shiftStartTime?: string | null; onDone: () => void
}) {
    const [loading, setLoading] = useState(false);
    const [gpsState, setGpsState] = useState<'idle' | 'locating' | 'ready' | 'error'>('idle');
    const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
    const [errMsg, setErrMsg] = useState('');
    const [qrToken, setQrToken] = useState('');
    const [qrLoading, setQrLoading] = useState(false);

    // Compute check-in availability (30 min before shift start)
    const checkInOpenTime = shiftStartTime
        ? new Date(new Date(shiftStartTime).getTime() - 30 * 60 * 1000)
        : null;
    const isTooEarly = checkInOpenTime ? new Date() < checkInOpenTime : false;

    const formatTime = (d: Date) => d.toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const extractErrMsg = (e: any): string => {
        const data = e?.response?.data;
        if (typeof data === 'string') return data;
        if (data?.detail) return data.detail;
        if (data?.title) return data.title;
        return 'Check-in failed. Please try again.';
    };

    const locate = () => {
        if (!navigator.geolocation) {
            setErrMsg('Geolocation is not supported on this device. Please use the on-site QR code to check in.');
            setGpsState('error');
            return;
        }
        setGpsState('locating');
        navigator.geolocation.getCurrentPosition(
            (pos) => { setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }); setGpsState('ready'); },
            () => { setErrMsg('Location failed or permission denied. Please use the on-site QR code to check in.'); setGpsState('error'); },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
        );
    };

    const doCheckIn = async () => {
        if (!coords) {
            setErrMsg('Could not get your location. Please use the on-site QR code to check in.');
            setGpsState('error');
            return;
        }
        setLoading(true);
        try {
            await attendanceService.checkIn(attendanceId, { lat: coords.lat, lon: coords.lon, proofPhotoUrl: '' });
            onDone();
        } catch (e: any) { setErrMsg(extractErrMsg(e)); setGpsState('error'); }
        finally { setLoading(false); }
    };

    const doQrFallback = async () => {
        if (!qrToken.trim()) {
            setErrMsg('Please enter or paste the token from the on-site QR code.');
            return;
        }
        setQrLoading(true);
        try {
            await attendanceService.qrCheckIn(attendanceId, { qrToken: qrToken.trim() });
            onDone();
        } catch (e: any) {
            setErrMsg(extractErrMsg(e));
            setGpsState('error');
        } finally {
            setQrLoading(false);
        }
    };

    // Too early — show disabled button with available time
    if (isTooEarly) return (
        <div className="mt-2 space-y-1">
            <button disabled className="text-xs font-bold text-stone-400 bg-stone-100 px-4 py-2 rounded-lg cursor-not-allowed flex items-center gap-1">
                🕐 Check-In Not Yet Available
            </button>
            <p className="text-xs text-stone-400">
                Available from <span className="font-semibold text-stone-600">{formatTime(checkInOpenTime!)}</span>
            </p>
        </div>
    );

    if (gpsState === 'idle') return (
        <button onClick={locate} className="text-xs font-bold text-blue-600 bg-blue-50 px-4 py-2 rounded-lg hover:bg-blue-100 mt-2 flex items-center gap-1">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : '📍'} Check In Now
        </button>
    );

    if (gpsState === 'locating') return (
        <div className="mt-2 flex items-center gap-2 text-xs text-stone-500">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> Getting your location…
        </div>
    );

    if (gpsState === 'error') return (
        <div className="mt-2 space-y-2">
            <p className="text-xs text-rose-500 font-medium">⚠️ {errMsg}</p>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <input
                    type="text"
                    value={qrToken}
                    onChange={e => setQrToken(e.target.value)}
                    placeholder="Paste on-site QR code token"
                    className="px-3 py-2 rounded-lg border border-stone-200 text-xs"
                />
                <button onClick={() => { void doQrFallback(); }} disabled={qrLoading || !qrToken.trim()} className="text-xs font-bold text-white bg-emerald-500 px-3 py-1.5 rounded-lg hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1">
                    {qrLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : '🔐'} QR Check-In
                </button>
                <button onClick={() => { setGpsState('idle'); setErrMsg(''); }} className="text-xs font-bold text-stone-500 bg-stone-100 px-3 py-1.5 rounded-lg hover:bg-stone-200">
                    Retry GPS
                </button>
            </div>
        </div>
    );

    // gpsState === 'ready' — show map preview
    return (
        <div className="mt-3 space-y-3">
            <p className="text-xs font-bold text-stone-600">📍 Your location detected. Confirm check-in:</p>
            <Suspense fallback={<div className="h-48 bg-stone-100 rounded-xl flex items-center justify-center text-stone-400 text-xs">Loading map…</div>}>
                {coords && <MapView lat={coords.lat} lon={coords.lon} radius={50} height={200} />}
            </Suspense>
            {errMsg && <p className="text-xs text-rose-500">⚠️ {errMsg}</p>}
            <div className="flex flex-wrap gap-2">
                <button onClick={() => setGpsState('idle')} className="text-xs font-bold text-stone-500 bg-stone-100 px-3 py-1.5 rounded-lg hover:bg-stone-200">Cancel</button>
                <button onClick={locate} disabled={loading} className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 flex items-center gap-1">
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <MapPin className="w-3 h-3" />} Get Current Location
                </button>
                <button onClick={doCheckIn} disabled={loading} className="text-xs font-bold text-white bg-blue-500 px-4 py-1.5 rounded-lg hover:bg-blue-600 flex items-center gap-1">
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : '✅'} Confirm Check-In
                </button>
            </div>
        </div>
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VOLUNTEER DASHBOARD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface DashboardProps { onNavigate: (view: ViewName) => void; }

export function VolDashboard({ onNavigate }: DashboardProps) {
    const dark = useDarkMode();
    const auth = useAuth();
    const [profile, setProfile] = useState<VolunteerProfile | null>(null);
    const [apps, setApps] = useState<ApplicationSummary[]>([]);
    const [attendance, setAttendance] = useState<AttendanceSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [orgRecs, setOrgRecs] = useState<OrgRecommendation[]>([]);
    const [followedOrgIdsDash, setFollowedOrgIdsDash] = useState<Set<string>>(new Set());
    const [showAllActivity, setShowAllActivity] = useState(false);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [showNotifs, setShowNotifs] = useState(false);
    const [notifLoading, setNotifLoading] = useState(false);

    const load = useCallback(async () => {
        if (!auth.linkedGrainId) return;
        setLoading(true); setError('');
        try {
            const [p, a, at] = await Promise.all([
                volunteerService.getProfile(auth.linkedGrainId),
                applicationService.getForVolunteer(auth.linkedGrainId),
                attendanceService.getByVolunteer(auth.linkedGrainId),
            ]);
            setProfile(p);
            setApps(a);
            setAttendance(at);
            setFollowedOrgIdsDash(new Set(p.followedOrgIds ?? []));
            organizationService.getRecommended(auth.linkedGrainId)
                .then(recs => setOrgRecs(recs.filter(r => !p.followedOrgIds?.includes(r.orgId))))
                .catch(() => {});
        } catch (err: any) {
            setError(getErr(err, 'Failed to load profile'));
        } finally { setLoading(false); }
    }, [auth.linkedGrainId]);

    useEffect(() => { load(); }, [load]);

    const loadNotifications = useCallback(async () => {
        setNotifLoading(true);
        try {
            const data = await notificationService.getMyNotifications();
            setNotifications(data);
        } catch { /* silently ignore */ }
        finally { setNotifLoading(false); }
    }, []);

    useEffect(() => { loadNotifications(); }, [loadNotifications]);

    const handleMarkAllRead = async () => {
        try {
            await notificationService.markAllRead();
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        } catch { /* ignore */ }
    };

    const handleMarkRead = async (id: string) => {
        try {
            await notificationService.markRead(id);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
        } catch { /* ignore */ }
    };

    // ── Chart data — must be before early returns (Rules of Hooks) ────────────
    const monthlyHours = useMemo(() => {
        const buckets: Record<string, number> = {};
        attendance.forEach(a => {
            if (a.checkInTime && (a.totalHours ?? 0) > 0) {
                const label = new Date(a.checkInTime).toLocaleString('default', { month: 'short', year: '2-digit' });
                buckets[label] = (buckets[label] ?? 0) + (a.totalHours ?? 0);
            }
        });
        return Object.entries(buckets)
            .slice(-6)
            .map(([month, hours]) => ({ month, hours: Math.round(hours * 10) / 10 }));
    }, [attendance]);

    const appStatusForPie = useMemo(() => [
        { label: 'Pending', count: apps.filter(a => a.status === 'Pending').length },
        { label: 'Approved', count: apps.filter(a => a.status === 'Approved').length },
        { label: 'Waitlisted', count: apps.filter(a => a.status === 'Waitlisted' || a.status === 'Promoted').length },
        { label: 'Closed', count: apps.filter(a => ['Rejected', 'Withdrawn', 'NoShow', 'Completed'].includes(a.status)).length },
    ].filter(s => s.count > 0).map(s => ({ name: s.label, value: s.count })), [apps]);
    const PIE_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#6b7280'];

    if (loading) return <Spinner />;
    if (error) return <ErrorBox msg={error} onRetry={load} />;

    const name = profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || auth.email : auth.email;
    const approvedShiftDates = apps.filter(a => a.status === 'Approved' && a.shiftStartTime).map(a => new Date(a.shiftStartTime));
    const appStatusCounts = [
        { label: 'Pending', key: 'Pending', count: apps.filter(a => a.status === 'Pending').length, gradient: 'from-amber-400 to-orange-400' },
        { label: 'Approved', key: 'Approved', count: apps.filter(a => a.status === 'Approved').length, gradient: 'from-emerald-400 to-teal-500' },
        { label: 'Waitlisted', key: 'Waitlisted', count: apps.filter(a => a.status === 'Waitlisted' || a.status === 'Promoted').length, gradient: 'from-blue-400 to-cyan-500' },
        { label: 'Closed', key: 'Closed', count: apps.filter(a => ['Rejected', 'Withdrawn', 'NoShow', 'Completed'].includes(a.status)).length, gradient: 'from-stone-400 to-slate-500' },
    ];
    const totalStatusCount = appStatusCounts.reduce((sum, s) => sum + s.count, 0);
    const upcomingApps = apps
        .filter(a => a.shiftStartTime && new Date(a.shiftStartTime).getTime() >= Date.now())
        .sort((a, b) => new Date(a.shiftStartTime).getTime() - new Date(b.shiftStartTime).getTime())
        .slice(0, 5);
    const recentApps = [...apps]
        .sort((a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime())
        .slice(0, 5);
    const reviewedApps = apps.filter(a => a.status !== 'Pending').length;
    const approvedTrackApps = apps.filter(a => ['Approved', 'Promoted', 'Completed', 'NoShow'].includes(a.status)).length;
    const checkedInSessions = attendance.filter(a => ['CheckedIn', 'CheckedOut', 'Confirmed', 'Resolved', 'Disputed'].includes(a.status)).length;
    const completedSessions = attendance.filter(a => ['CheckedOut', 'Confirmed', 'Resolved'].includes(a.status)).length;
    const rejectedOrWithdrawn = apps.filter(a => ['Rejected', 'Withdrawn'].includes(a.status)).length;
    const funnelSteps = [
        { key: 'applied', label: 'Applied', count: apps.length, gradient: 'from-sky-400 to-blue-500' },
        { key: 'reviewed', label: 'Reviewed', count: reviewedApps, gradient: 'from-violet-400 to-purple-500' },
        { key: 'approved', label: 'Approved Track', count: approvedTrackApps, gradient: 'from-emerald-400 to-teal-500' },
        { key: 'checkedin', label: 'Checked In', count: checkedInSessions, gradient: 'from-amber-400 to-orange-500' },
        { key: 'completed', label: 'Completed', count: completedSessions, gradient: 'from-orange-400 to-rose-500' },
    ];
    const funnelMax = Math.max(1, ...funnelSteps.map(s => s.count));
    const formatDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const statusBadgeClass = (status: string) => {
        if (status === 'Approved') return 'bg-emerald-100 text-emerald-700';
        if (status === 'Pending') return 'bg-amber-100 text-amber-700';
        if (status === 'Waitlisted' || status === 'Promoted') return 'bg-blue-100 text-blue-700';
        if (status === 'Rejected' || status === 'NoShow') return 'bg-rose-100 text-rose-700';
        return 'bg-stone-100 text-stone-700';
    };
    const statCards = [
        { label: 'Total Hours', numVal: profile?.totalHours ?? 0, decimals: 1, unit: 'hrs', icon: Clock, gradient: 'from-blue-500 to-cyan-400', glow: 'hover:shadow-blue-500/20', target: 'attendance' as ViewName },
        { label: 'Completed', numVal: profile?.completedOpportunities ?? 0, decimals: 0, unit: 'events', icon: CheckCircle2, gradient: 'from-emerald-500 to-teal-400', glow: 'hover:shadow-emerald-500/20', target: 'attendance' as ViewName },
        { label: 'Credentials', numVal: profile?.credentials?.length ?? 0, decimals: 0, unit: 'docs', icon: Award, gradient: 'from-amber-400 to-orange-500', glow: 'hover:shadow-amber-500/20', target: 'profile' as ViewName },
        { label: 'Applications', numVal: apps.length, decimals: 0, unit: 'total', icon: BadgeCheck, gradient: 'from-violet-500 to-purple-500', glow: 'hover:shadow-violet-500/20', target: 'applications' as ViewName },
    ];

    if (loading) return <SkeletonDashboard />;

    return (
        <div className="max-w-6xl mx-auto space-y-6">

            {/* ── Zone A: Impact Ring Banner ── */}
            <div className="bg-gradient-to-br from-amber-400 via-orange-400 to-orange-500 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-950 dark:border dark:border-zinc-800 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-brand dark:shadow-level-3">
                {/* Glow orb — white in light, amber in dark */}
                <div className="absolute top-0 right-0 w-80 h-80 rounded-full opacity-20 pointer-events-none"
                    style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.55) 0%, transparent 70%)', transform: 'translate(30%, -30%)' }} />
                <div className="relative flex flex-col sm:flex-row items-center gap-8">
                    {/* Impact ring */}
                    <div className="shrink-0">
                        <ImpactRing score={profile?.impactScore ?? 0} maxScore={1000} size={130} />
                        <p className="text-xs text-white/70 dark:text-zinc-500 text-center mt-2">of 1,000 pts</p>
                    </div>
                    {/* Greeting */}
                    <div className="flex-1 text-center sm:text-left">
                        <h1 className="text-2xl sm:text-3xl font-black text-white dark:text-zinc-100 mb-1">
                            Welcome back, <span className="dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-amber-400 dark:to-orange-400">{name?.split(' ')[0] ?? 'Volunteer'}!</span>
                        </h1>
                        <p className="text-white/75 dark:text-zinc-400 mb-5">Ready to make an impact today? Here's your volunteer summary.</p>
                        {/* Quick action pills */}
                        <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                            {[
                                { label: 'Check In', icon: MapPin, view: 'attendance' as ViewName },
                                { label: 'Browse Events', icon: Search, view: 'opportunities' as ViewName },
                                { label: 'Certificates', icon: Award, view: 'certificates' as ViewName },
                            ].map(a => (
                                <button key={a.label} onClick={() => onNavigate(a.view)}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:-translate-y-0.5 backdrop-blur-sm bg-white/20 hover:bg-white/30 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white dark:text-zinc-200">
                                    <a.icon className="w-4 h-4" /> {a.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {/* Inline stats */}
                    <div className="flex gap-6 shrink-0">
                        {[
                            { label: 'Hours', value: (profile?.totalHours ?? 0).toFixed(0) },
                            { label: 'Completed', value: String(profile?.completedOpportunities ?? 0) },
                            { label: 'Pending', value: String(apps.filter(a => a.status === 'Pending').length) },
                        ].map(s => (
                            <div key={s.label} className="text-center">
                                <div className="text-3xl font-black text-white dark:text-zinc-100">{s.value}</div>
                                <div className="text-xs text-white/65 dark:text-zinc-500 font-medium">{s.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Zone B: Stat cards ── */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                {statCards.map((s, i) => (
                    <button
                        key={i}
                        onClick={() => onNavigate(s.target)}
                        className="bg-white rounded-2xl p-5 shadow-level-1 border border-stone-100 flex flex-col items-start text-left card-interactive group animate-content-reveal"
                        style={{ animationDelay: `${i * 0.07}s` }}
                    >
                        <div className={`bg-gradient-to-br ${s.gradient} p-3 rounded-xl text-white mb-3 shadow-sm group-hover:scale-110 transition-transform`}>
                            <s.icon className="w-5 h-5" />
                        </div>
                        <div className="text-2xl font-black text-stone-800"><StatNum value={s.numVal} decimals={s.decimals} /></div>
                        <div className="text-xs font-medium text-stone-400 mt-0.5">{s.label} <span className="text-stone-300">· {s.unit}</span></div>
                    </button>
                ))}
            </div>

            {/* ── Zone C: Heatmap + Calendar ── */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
                {/* Heatmap (2/3 width) */}
                <div className="xl:col-span-2 bg-white rounded-2xl p-6 shadow-level-1 border border-stone-100">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-bold text-stone-800">Volunteer Activity</h2>
                        <span className="text-xs text-stone-400">{attendance.filter(a => ['CheckedOut', 'Confirmed', 'Resolved'].includes(a.status)).length} sessions total</span>
                    </div>
                    <AttendanceHeatmap attendance={attendance} />
                    {/* Stats footer */}
                    <div className="mt-4 pt-4 border-t border-stone-100 grid grid-cols-4 gap-3">
                        {(() => {
                            const { current: streak } = computeStreak(attendance);
                            return [
                                { label: 'Total Hours', value: (profile?.totalHours ?? 0).toFixed(1) },
                                { label: 'Completed', value: String(profile?.completedOpportunities ?? 0) },
                                { label: 'Sessions', value: String(attendance.filter(a => ['CheckedOut', 'Confirmed', 'Resolved'].includes(a.status)).length) },
                                { label: 'Week Streak', value: String(streak), highlight: streak > 0 },
                            ].map(s => (
                                <div key={s.label} className={`rounded-xl px-3 py-3 text-center ${s.highlight ? 'bg-amber-50' : 'bg-stone-50'}`}>
                                    <div className={`text-lg font-black ${s.highlight ? 'text-orange-500' : 'text-stone-800'}`}>{s.value}</div>
                                    <div className="text-[11px] text-stone-400 font-medium mt-0.5">{s.label}</div>
                                </div>
                            ));
                        })()}
                    </div>
                </div>
                {/* Calendar only */}
                <div>
                    <MiniCalendar eventDates={approvedShiftDates} />
                </div>
            </div>

            {/* ── Zone D: Upcoming commitments + charts ── */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="bg-white rounded-2xl p-6 shadow-level-1 border border-stone-100">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-bold text-stone-800">Application Snapshot</h2>
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full uppercase tracking-wide">Live</span>
                    </div>
                    <div className="space-y-4">
                        {appStatusCounts.map((s) => {
                            const pct = totalStatusCount === 0 ? 0 : Math.round((s.count / totalStatusCount) * 100);
                            return (
                                <div key={s.key}>
                                    <div className="flex justify-between items-center text-sm mb-1.5">
                                        <span className="font-semibold text-stone-700">{s.label}</span>
                                        <span className="text-xs font-bold text-stone-500">{s.count} <span className="text-stone-400 font-normal">({pct}%)</span></span>
                                    </div>
                                    <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
                                        <div className={`h-full bg-gradient-to-r ${s.gradient} transition-all duration-700 rounded-full`} style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-level-1 border border-stone-100">
                    <h2 className="text-base font-bold text-stone-800 mb-4">Upcoming Shifts</h2>
                    {upcomingApps.length === 0 ? (
                        <p className="text-sm text-stone-400 py-8 text-center">No upcoming shifts yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {upcomingApps.map(app => (
                                <div key={app.applicationId} className="border border-stone-100 rounded-xl p-3 hover:bg-stone-50 transition-colors flex items-start gap-3">
                                    <div className={`w-1 self-stretch rounded-full shrink-0 mt-0.5 ${app.status === 'Approved' ? 'bg-emerald-400' : app.status === 'Pending' ? 'bg-amber-400' : 'bg-blue-400'}`} />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-stone-800 text-sm truncate">{formatEventTitle(app.opportunityTitle, app.shiftName)}</p>
                                        <p className="text-xs text-stone-400 mt-0.5">{formatDateTime(app.shiftStartTime)}</p>
                                    </div>
                                    <StatusBadge status={app.status} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-level-1 border border-stone-100">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-bold text-stone-800">Application Funnel</h2>
                        <TrendingUp className="w-4 h-4 text-stone-400" />
                    </div>
                    <div className="space-y-3">
                        {funnelSteps.map((step, idx) => {
                            const pctOfTop = Math.round((step.count / funnelMax) * 100);
                            return (
                                <div key={step.key}>
                                    <div className="flex justify-between items-center text-xs mb-1.5">
                                        <span className="font-semibold text-stone-600">{idx + 1}. {step.label}</span>
                                        <span className="font-bold text-stone-500">{step.count}</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
                                        <div className={`h-full bg-gradient-to-r ${step.gradient} transition-all duration-700 rounded-full`} style={{ width: `${Math.max(6, pctOfTop)}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-4 pt-3 border-t border-stone-100 text-xs text-stone-500 flex items-center justify-between">
                        <span>Drop-off</span>
                        <span className="font-bold text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full">{rejectedOrWithdrawn}</span>
                    </div>
                </div>
            </div>

            {/* ── Charts row ── */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl p-6 shadow-level-1 border border-stone-100">
                    <h2 className="text-base font-bold text-stone-800 mb-4">Monthly Hours</h2>
                    {monthlyHours.length === 0 ? (
                        <p className="text-sm text-stone-400 py-8 text-center">No attendance records yet.</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={180}>
                            <BarChart data={monthlyHours} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="volHoursGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#f97316" />
                                        <stop offset="100%" stopColor="#fbbf24" />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#3f3f46' : '#f5f5f4'} vertical={false} />
                                <XAxis dataKey="month" tick={{ fontSize: 11, fill: dark ? '#a1a1aa' : '#a8a29e' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: dark ? '#a1a1aa' : '#a8a29e' }} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={{ backgroundColor: dark ? '#18181b' : '#1c1917', border: 'none', borderRadius: 12, color: '#fff', fontSize: 12 }} cursor={{ fill: dark ? 'rgba(255,255,255,0.04)' : '#fff7ed' }} />
                                <Bar dataKey="hours" fill="url(#volHoursGrad)" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-level-1 border border-stone-100">
                    <h2 className="text-base font-bold text-stone-800 mb-2">Application Breakdown</h2>
                    {appStatusForPie.length === 0 ? (
                        <p className="text-sm text-stone-400 py-8 text-center">No applications yet.</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                                <Pie data={appStatusForPie} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                                    {appStatusForPie.map((_, index) => (
                                        <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Legend iconType="circle" iconSize={8} formatter={(value) => <span style={{ color: dark ? '#a1a1aa' : '#57534e', fontSize: 11 }}>{value}</span>} />
                                <Tooltip contentStyle={{ backgroundColor: dark ? '#18181b' : '#1c1917', border: 'none', borderRadius: 12, color: '#fff', fontSize: 12 }} />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {(() => {
                const allActivityItems: ActivityItem[] = [
                    ...apps.map((a): ActivityItem => ({
                        id: `app-${a.applicationId}`,
                        type: a.status === 'Approved' ? 'approved'
                            : a.status === 'Rejected' ? 'rejected'
                            : a.status === 'Completed' ? 'completed'
                            : 'applied',
                        label: formatEventTitle(a.opportunityTitle, a.shiftName),
                        sub: a.status === 'Pending' ? 'Application submitted' : `Status: ${a.status}`,
                        timestamp: a.appliedAt,
                    })),
                    ...attendance.filter(a => a.checkInTime).map((a): ActivityItem => ({
                        id: `att-${a.attendanceId}`,
                        type: a.checkOutTime ? 'checked_out' : 'checked_in',
                        label: a.opportunityTitle ?? 'Volunteer shift',
                        sub: a.checkOutTime ? `Checked out · ${(a.totalHours ?? 0).toFixed(1)} hrs` : 'Checked in',
                        timestamp: a.checkInTime!,
                    })),
                ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                const visibleItems = showAllActivity ? allActivityItems : allActivityItems.slice(0, 5);
                return (<>
                    <ActivityFeed items={visibleItems} />
                    {allActivityItems.length > 5 && (
                        <div className="text-center">
                            <button onClick={() => setShowAllActivity(v => !v)} className="text-sm text-orange-600 font-bold hover:underline">
                                {showAllActivity ? 'Show less' : `Show all ${allActivityItems.length} activities`}
                            </button>
                        </div>
                    )}
                </>);
            })()}

            {/* Suggested Organizations */}
            {orgRecs.length > 0 && (
                <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-sm border border-stone-100 dark:border-zinc-800">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-stone-800 dark:text-zinc-100 flex items-center gap-2"><Building2 className="w-5 h-5 text-orange-500" /> Suggested Organizations</h3>
                        <button onClick={() => onNavigate('orgs')} className="text-sm text-orange-500 font-semibold hover:underline">Browse all</button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {orgRecs.map(org => (
                            <div key={org.orgId} className="border border-stone-100 dark:border-zinc-700 rounded-2xl p-4 flex flex-col gap-3 hover:border-orange-200 transition-colors">
                                <div>
                                    <p className="font-bold text-stone-800 dark:text-zinc-100 text-sm">{org.name}</p>
                                    <p className="text-xs text-stone-400 mt-1 line-clamp-2">{org.description}</p>
                                </div>
                                {org.matchingOpportunities > 0 && (
                                    <span className="text-xs font-semibold text-orange-600 bg-orange-50 rounded-full px-2.5 py-1 w-fit">{org.matchingOpportunities} matching {org.matchingOpportunities === 1 ? 'opportunity' : 'opportunities'}</span>
                                )}
                                <button
                                    onClick={async () => {
                                        if (!auth.linkedGrainId) return;
                                        try {
                                            await volunteerService.followOrg(auth.linkedGrainId, org.orgId);
                                            setFollowedOrgIdsDash(prev => new Set([...prev, org.orgId]));
                                            setOrgRecs(prev => prev.filter(r => r.orgId !== org.orgId));
                                        } catch { /* ignore */ }
                                    }}
                                    className="mt-auto px-4 py-2 bg-orange-500 text-white font-bold rounded-xl text-xs hover:bg-orange-600 w-fit flex items-center gap-1.5"
                                >
                                    <Heart className="w-3.5 h-3.5" /> Follow
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VOLUNTEER OPPORTUNITIES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


interface VolOpportunitiesProps { onViewDetail?: (id: string) => void; }
const FAVORITES_KEY = 'vsms_favorites';
function loadFavorites(): Set<string> {
    try { return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]')); }
    catch { return new Set(); }
}
function saveFavorites(ids: Set<string>) {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...ids]));
}

export function VolOpportunities({ onViewDetail }: VolOpportunitiesProps = {}) {
    const auth = useAuth();
    const [opps, setOpps] = useState<OpportunityRecommendation[]>([]);
    const [calendarView, setCalendarView] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [smartMatch, setSmartMatch] = useState(true);
    const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
    const [locationStatus, setLocationStatus] = useState<'idle' | 'locating' | 'ready' | 'denied' | 'unsupported'>('idle');
    const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
    const [volunteerSkills, setVolunteerSkills] = useState<Skill[]>([]);
    const [allSkills, setAllSkills] = useState<Skill[]>([]);
    const [selectedOppId, setSelectedOppId] = useState<string | null>(null);
    const [mobileTab, setMobileTab] = useState<'list' | 'map'>('list');
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [maxDistance, setMaxDistance] = useState<number>(20);
    const [availableOnly, setAvailableOnly] = useState<boolean>(false);
    const [filtersOpen, setFiltersOpen] = useState<boolean>(true);

    useEffect(() => {
        skillService.getAll().then(setAllSkills).catch(() => { });
    }, []);

    useEffect(() => {
        if (!auth.linkedGrainId) return;
        skillService.getVolunteerSkills(auth.linkedGrainId)
            .then(setVolunteerSkills)
            .catch(() => { });
    }, [auth.linkedGrainId]);

    const asRecommendation = (opp: OpportunitySummary): OpportunityRecommendation => ({
        ...opp,
        matchedSkillCount: 0,
        requiredSkillCount: 0,
        skillMatchRatio: 0,
        distanceKm: null,
        recommendationScore: 0,
    });

    const toggleFavorite = (id: string) => {
        setFavorites(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            saveFavorites(next);
            return next;
        });
    };

    const load = useCallback(async (q?: string) => {
        setLoading(true); setError('');
        try {
            if (smartMatch && auth.userId) {
                const ranked = await opportunityService.recommendForVolunteer({
                    volunteerId: auth.userId,
                    query: q,
                    category: selectedCategory || undefined,
                    lat: coords?.lat,
                    lon: coords?.lon,
                    take: 500,
                });
                setOpps(ranked.opportunities);
                return;
            }
            const data = await opportunityService.search(q, selectedCategory || undefined);
            setOpps(data.map(asRecommendation));
        } catch (err: any) {
            setError(getErr(err, 'Failed to load opportunities'));
        } finally { setLoading(false); }
    }, [auth.userId, coords?.lat, coords?.lon, smartMatch, selectedCategory]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!smartMatch) return;
        if (!navigator.geolocation) {
            setLocationStatus('unsupported');
            return;
        }
        setLocationStatus('locating');
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
                setLocationStatus('ready');
            },
            () => setLocationStatus('denied'),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 },
        );
    }, [smartMatch]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        load(query);
    };

    const tagColors: Record<string, string> = {
        'Community': 'text-rose-600 bg-rose-50',
        'Environment': 'text-emerald-600 bg-emerald-50',
        'Education': 'text-amber-600 bg-amber-50',
        'Health': 'text-blue-600 bg-blue-50',
        'Technology': 'text-violet-600 bg-violet-50',
    };
    const recommendationTier = (score: number): string => {
        if (score >= 0.8) return 'Excellent Match';
        if (score >= 0.6) return 'Strong Match';
        if (score >= 0.45) return 'Good Match';
        return 'Possible Match';
    };
    const recommendationTone = (score: number): string => {
        if (score >= 0.8) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
        if (score >= 0.6) return 'text-lime-700 bg-lime-50 border-lime-200';
        if (score >= 0.45) return 'text-amber-700 bg-amber-50 border-amber-200';
        return 'text-stone-700 bg-stone-50 border-stone-200';
    };

    const displayedOpps = useMemo(() => {
        let result = opps;
        if (availableOnly) result = result.filter(o => o.availableSpots > 0);
        if (smartMatch && maxDistance < 20) result = result.filter(o => o.distanceKm === null || o.distanceKm <= maxDistance);
        return result;
    }, [opps, availableOnly, smartMatch, maxDistance]);

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {/* ── Header + Search ── */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div><h1 className="text-3xl font-extrabold text-stone-800">Discover Opportunities</h1><p className="text-stone-500 mt-2 text-lg">Find volunteer positions near you that match your skills and interests</p></div>
                <form onSubmit={handleSearch} className="flex w-full sm:w-auto gap-3">
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                        <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search..." className="w-full pl-12 pr-4 py-3 rounded-full border border-stone-200 focus:ring-2 focus:ring-orange-500 outline-none shadow-sm" />
                    </div>
                    <button type="submit" className="bg-orange-500 text-white px-6 py-3 rounded-full font-bold hover:bg-orange-600 shadow-lg shadow-orange-500/20">Search</button>
                </form>
            </div>

            {/* ── Smart Match toggle ── */}
            <div className="flex items-center gap-3">
                <button
                    onClick={() => setSmartMatch(v => !v)}
                    className={`px-4 py-2 rounded-full text-sm font-bold border transition-all ${smartMatch
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                        }`}
                >
                    {smartMatch ? 'Smart Match: ON' : 'Smart Match: OFF'}
                </button>
                {smartMatch && (
                    <span className="text-xs text-stone-500">
                        {locationStatus === 'ready' && 'Using your location + skills'}
                        {locationStatus === 'locating' && 'Getting your location for distance scoring...'}
                        {locationStatus === 'denied' && 'Location denied: using skill-only ranking'}
                        {locationStatus === 'unsupported' && 'No geolocation: using skill-only ranking'}
                        {locationStatus === 'idle' && 'Using skill-based ranking'}
                    </span>
                )}
                <button
                    onClick={() => setCalendarView(v => !v)}
                    className={`ml-auto flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm font-semibold transition-all ${
                        calendarView
                            ? 'bg-amber-50 border-amber-300 text-amber-600 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400'
                            : 'border-stone-200 text-stone-500 hover:border-stone-300 hover:bg-stone-50'
                    }`}
                >
                    <CalendarDays className="w-4 h-4" />
                    {calendarView ? 'List View' : 'Calendar View'}
                </button>
            </div>

            {calendarView && (
                <EventCalendar
                    events={opps.map(o => ({ id: o.opportunityId, title: o.title, date: o.publishDate, color: 'bg-amber-400' }))}
                    onEventClick={onViewDetail}
                />
            )}

            {/* ── Mobile tab toggle (List / Map) ── */}
            <div className={`flex lg:hidden bg-stone-100 rounded-full p-1 w-fit${calendarView ? ' hidden' : ''}`}>
                <button
                    onClick={() => setMobileTab('list')}
                    className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${mobileTab === 'list' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500'}`}
                >List</button>
                <button
                    onClick={() => setMobileTab('map')}
                    className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${mobileTab === 'map' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500'}`}
                >Map</button>
            </div>

            {/* ── Main content: filters + list + map ── */}
            <div className={`flex gap-6 items-start${calendarView ? ' hidden' : ''}`}>

                {/* ── Filters sidebar ── */}
                <div className={`hidden lg:flex flex-col w-56 shrink-0 bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden`}>
                    <button
                        onClick={() => setFiltersOpen(v => !v)}
                        className="flex items-center justify-between px-5 py-4 font-bold text-stone-800 border-b border-stone-100 hover:bg-stone-50 transition-colors"
                    >
                        <span className="flex items-center gap-2 text-sm"><Search className="w-4 h-4 text-orange-500" />Filters</span>
                        <span className={`text-stone-400 text-xs transition-transform ${filtersOpen ? 'rotate-180' : ''}`}>▼</span>
                    </button>

                    {filtersOpen && (
                        <div className="p-5 space-y-6">
                            {/* Category */}
                            <div>
                                <p className="text-[10px] font-extrabold uppercase tracking-widest text-stone-400 mb-3">Category</p>
                                <div className="flex flex-wrap gap-2">
                                    {['', 'Community', 'Environment', 'Education', 'Health', 'Technology'].map(cat => (
                                        <button
                                            key={cat}
                                            onClick={() => { setSelectedCategory(cat); }}
                                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${selectedCategory === cat
                                                ? 'bg-orange-500 text-white border-orange-500'
                                                : 'bg-stone-50 text-stone-600 border-stone-200 hover:border-orange-300'}`}
                                        >
                                            {cat || 'All'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Skills (volunteer's own) */}
                            {volunteerSkills.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-stone-400 mb-3">My Skills</p>
                                    <div className="flex flex-wrap gap-2">
                                        {volunteerSkills.map(s => (
                                            <span key={s.id} className="px-3 py-1.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-600 border border-orange-100">
                                                {s.name}
                                            </span>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-stone-400 mt-2">Smart Match uses your skills automatically</p>
                                </div>
                            )}

                            {/* Distance slider (only when Smart Match ON and location available) */}
                            {smartMatch && locationStatus === 'ready' && (
                                <div>
                                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-stone-400 mb-3">Distance</p>
                                    <div className="space-y-2">
                                        <input
                                            type="range"
                                            min={1}
                                            max={20}
                                            value={maxDistance}
                                            onChange={e => setMaxDistance(Number(e.target.value))}
                                            className="w-full accent-orange-500"
                                        />
                                        <div className="flex justify-between text-xs text-stone-400 font-medium">
                                            <span>1 km</span>
                                            <span className="text-orange-600 font-bold">{maxDistance < 20 ? `≤ ${maxDistance} km` : 'Any distance'}</span>
                                            <span>20 km</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Availability */}
                            <div>
                                <p className="text-[10px] font-extrabold uppercase tracking-widest text-stone-400 mb-3">Availability</p>
                                <label className="flex items-center gap-2.5 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={availableOnly}
                                        onChange={e => setAvailableOnly(e.target.checked)}
                                        className="accent-orange-500 w-4 h-4 rounded"
                                    />
                                    <span className="text-xs font-semibold text-stone-700 group-hover:text-orange-600 transition-colors">Available spots only</span>
                                </label>
                            </div>

                            {/* Reset */}
                            {(selectedCategory || availableOnly || maxDistance < 20) && (
                                <button
                                    onClick={() => { setSelectedCategory(''); setAvailableOnly(false); setMaxDistance(20); }}
                                    className="w-full text-xs font-bold text-stone-500 hover:text-orange-600 transition-colors py-1"
                                >
                                    Reset filters
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Card list ── */}
                <div className={`flex-1 min-w-0 ${mobileTab === 'map' ? 'hidden lg:block' : 'block'}`}>
                    {loading ? <Spinner /> : error ? <ErrorBox msg={error} onRetry={() => load()} /> : displayedOpps.length === 0 ? <Empty msg="No opportunities found." /> : (
                        <>
                            <p className="text-sm font-semibold text-stone-500 mb-4">{displayedOpps.length} opportunities found</p>
                            <div className="space-y-4">
                                {displayedOpps.map(opp => (
                                    <div
                                        key={opp.opportunityId}
                                        id={`opp-card-${opp.opportunityId}`}
                                        onClick={() => setSelectedOppId(opp.opportunityId)}
                                        className={`bg-white rounded-3xl px-6 py-5 shadow-sm border transition-all group cursor-pointer hover:shadow-lg ${selectedOppId === opp.opportunityId ? 'border-orange-400 ring-2 ring-orange-400' : 'border-stone-100'}`}
                                    >
                                        {/* Row 1: title + match badge + date + heart */}
                                        <div className="flex items-start justify-between gap-3 mb-1">
                                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                                                <h3 className="text-base font-bold text-stone-800 truncate">{opp.title}</h3>
                                                {smartMatch && (opp.recommendationScore || 0) >= 0.45 && (
                                                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 ${recommendationTone(opp.recommendationScore || 0)}`}>
                                                        {recommendationTier(opp.recommendationScore || 0)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                                <span className="text-xs font-medium text-stone-400 hidden sm:block">
                                                    {opp.publishDate ? new Date(opp.publishDate).toLocaleDateString() : ''}
                                                </span>
                                                <Heart
                                                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); toggleFavorite(opp.opportunityId); }}
                                                    className={`w-5 h-5 cursor-pointer transition-colors ${favorites.has(opp.opportunityId)
                                                        ? 'text-rose-500 fill-rose-500'
                                                        : 'text-stone-200 group-hover:text-rose-400 hover:!text-rose-500 hover:!fill-rose-500'
                                                        }`}
                                                />
                                            </div>
                                        </div>

                                        {/* Row 2: org name + category tag */}
                                        <div className="flex items-center gap-2 mb-3">
                                            <p className="text-sm font-medium text-stone-500">{opp.organizationName}</p>
                                            <span className={`inline-block px-2.5 py-0.5 text-[10px] font-bold rounded-full ${tagColors[opp.category] || 'text-stone-600 bg-stone-50'}`}>{opp.category}</span>
                                        </div>

                                        {/* Row 3: info chips (distance · spots · date mobile) */}
                                        <div className="flex flex-wrap items-center gap-4 mb-3 text-sm font-medium text-stone-600">
                                            {opp.distanceKm !== null && (
                                                <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-orange-500" />{opp.distanceKm.toFixed(1)} km</span>
                                            )}
                                            <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-orange-500" />{opp.totalSpots - opp.availableSpots}/{opp.totalSpots} spots filled</span>
                                            <span className="flex items-center gap-1.5 sm:hidden"><Calendar className="w-3.5 h-3.5 text-orange-500" />{opp.publishDate ? new Date(opp.publishDate).toLocaleDateString() : ''}</span>
                                        </div>

                                        {/* Row 4: skill chips + Why This Match + button */}
                                        <div className="flex items-end justify-between gap-4">
                                            <div className="flex-1 min-w-0 space-y-2">
                                                {opp.requiredSkillIds && opp.requiredSkillIds.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {opp.requiredSkillIds.slice(0, 4).map(id => {
                                                            const skill = allSkills.find(s => s.id === id);
                                                            if (!skill) return null;
                                                            const isMatched = volunteerSkills.some(s => s.id === id);
                                                            return (
                                                                <span key={id} className={`text-xs font-semibold rounded-full px-2.5 py-0.5 border ${isMatched ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-orange-50 text-orange-600 border-orange-100'}`}>
                                                                    {skill.name}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                                {smartMatch && (
                                                    <div className={`inline-flex flex-wrap gap-x-3 gap-y-0.5 rounded-xl border px-3 py-2 text-xs font-semibold ${recommendationTone(opp.recommendationScore || 0)}`}>
                                                        <span className="font-extrabold uppercase tracking-wide text-[10px]">Why This Match</span>
                                                        <span>{opp.requiredSkillCount > 0 ? `Skills: ${opp.matchedSkillCount}/${opp.requiredSkillCount} matched` : 'Skills: open to all volunteers'}</span>
                                                        <span>Recommendation: {Math.round((opp.recommendationScore || 0) * 100)}%</span>
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                disabled={opp.availableSpots === 0}
                                                onClick={(e) => { e.stopPropagation(); onViewDetail?.(opp.opportunityId); }}
                                                className={`shrink-0 px-5 py-2.5 rounded-2xl font-bold text-sm transition-all ${opp.availableSpots === 0 ? 'bg-stone-100 text-stone-400 cursor-not-allowed' : 'bg-orange-50 text-orange-600 hover:bg-orange-500 hover:text-white'}`}>
                                                {opp.availableSpots === 0 ? 'Fully Booked' : 'View Details →'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* ── Map panel ── always rendered so MapContainer never unmounts */}
                <div className={`lg:w-96 lg:sticky lg:top-4 lg:self-start ${mobileTab === 'map' ? 'block w-full' : 'hidden lg:block'}`}>
                    <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden relative">
                        <Suspense fallback={<div className="h-[500px] bg-stone-100 flex items-center justify-center text-stone-400 text-sm">Loading map...</div>}>
                            <OpportunityHeatMap
                                opportunities={displayedOpps}
                                userLocation={coords}
                                selectedOppId={selectedOppId}
                                onSelect={(id) => {
                                    setSelectedOppId(id);
                                    document.getElementById(`opp-card-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }}
                                onLocationFound={(c) => {
                                    setCoords(c);
                                    setLocationStatus('ready');
                                }}
                                height={500}
                            />
                        </Suspense>
                        {/* Map legend */}
                        <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-stone-100 px-4 py-3 space-y-1.5" style={{ zIndex: 1001 }}>
                            <p className="text-[10px] font-extrabold uppercase tracking-wide text-stone-500 mb-2">Map Legend</p>
                            <div className="flex items-center gap-2 text-xs font-semibold text-stone-700">
                                <span className="w-3 h-3 rounded-full bg-blue-500 shrink-0"></span> You
                            </div>
                            <div className="flex items-center gap-2 text-xs font-semibold text-stone-700">
                                <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0"></span> Recommended
                            </div>
                            <div className="flex items-center gap-2 text-xs font-semibold text-stone-700">
                                <span className="w-3 h-3 rounded-full bg-orange-500 shrink-0"></span> Selected
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}



// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VOLUNTEER APPLICATIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface VolApplicationsProps { onNavigate?: (view: ViewName) => void; }
export function VolApplications({ onNavigate }: VolApplicationsProps = {}) {
    const auth = useAuth();
    const [apps, setApps] = useState<ApplicationSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [toast, setToast] = useState<{ message: string; actions?: { label: string; onClick: () => void; tone?: 'default' | 'primary' | 'danger' }[] } | null>(null);
    const [actionId, setActionId] = useState<string | null>(null);
    const [confirmWithdrawApp, setConfirmWithdrawApp] = useState<ApplicationSummary | null>(null);
    const [followedOrgIds, setFollowedOrgIds] = useState<Set<string>>(new Set());
    const [dismissedOrgs, setDismissedOrgs] = useState<Set<string>>(() => {
        const keys = Object.keys(localStorage).filter(k => k.startsWith('vsms_dismiss_follow_'));
        return new Set(keys.map(k => k.replace('vsms_dismiss_follow_', '')));
    });

    const load = useCallback(async () => {
        if (!auth.linkedGrainId) return;
        setLoading(true); setError('');
        try {
            const [data, profile] = await Promise.all([
                applicationService.getForVolunteer(auth.linkedGrainId),
                volunteerService.getProfile(auth.linkedGrainId),
            ]);
            setApps(data);
            setFollowedOrgIds(new Set(profile.followedOrgIds ?? []));
        } catch (err: any) {
            setError(getErr(err, 'Failed to load applications'));
        } finally { setLoading(false); }
    }, [auth.linkedGrainId]);

    useEffect(() => { load(); }, [load]);
    const refreshSoon = () => setTimeout(() => { void load(); }, 900);

    const showToast = (message: string, actions?: { label: string; onClick: () => void; tone?: 'default' | 'primary' | 'danger' }[]) => {
        setToast({ message, actions });
    };

    const handleUndoWithdraw = async (app: ApplicationSummary) => {
        if (!auth.linkedGrainId) return;
        setActionId(app.applicationId);
        try {
            await opportunityService.apply(app.opportunityId, {
                volunteerId: auth.linkedGrainId,
                shiftId: app.shiftId,
                idempotencyKey: `undo-${app.applicationId}-${Date.now()}`
            });
            showToast('Withdrawal undone');
            setApps(prev => {
                if (prev.some(a => a.shiftId === app.shiftId && a.opportunityId === app.opportunityId)) return prev;
                return [{ ...app, status: ApplicationStatus.Pending, appliedAt: new Date().toISOString() }, ...prev];
            });
            refreshSoon();
        } catch (err: any) {
            showToast(getErr(err, 'Failed to undo withdrawal'));
        } finally { setActionId(null); }
    };

    const handleWithdrawConfirm = async () => {
        if (!confirmWithdrawApp) return;
        const app = confirmWithdrawApp;
        setConfirmWithdrawApp(null);
        setActionId(app.applicationId);
        try {
            await opportunityService.withdrawApplication(app.opportunityId, app.applicationId);
            setApps(prev => prev.filter(a => a.applicationId !== app.applicationId));
            showToast('Application withdrawn', [
                { label: 'Undo', tone: 'default', onClick: () => handleUndoWithdraw(app) },
                { label: 'Browse Events', tone: 'primary', onClick: () => onNavigate?.('opportunities') },
            ]);
            refreshSoon();
        } catch (err: any) {
            showToast(getErr(err, 'Failed to withdraw'));
        } finally { setActionId(null); }
    };

    const handleAccept = async (app: ApplicationSummary) => {
        setActionId(app.applicationId);
        try {
            await applicationService.accept(app.applicationId);
            setApps(prev => prev.map(a => a.applicationId === app.applicationId ? { ...a, status: ApplicationStatus.Approved } : a));
            showToast('Invitation accepted! 🎉', [
                { label: 'Go To Attendance', tone: 'primary', onClick: () => onNavigate?.('attendance') }
            ]);
            refreshSoon();
        } catch (err: any) {
            showToast(getErr(err, 'Failed to accept'));
        } finally { setActionId(null); }
    };

    const statusColors: Record<string, string> = {
        Approved: 'bg-emerald-100 text-emerald-700',
        Pending: 'bg-amber-100 text-amber-700',
        Waitlisted: 'bg-blue-100 text-blue-700',
        Promoted: 'bg-violet-100 text-violet-700',
        Rejected: 'bg-rose-100 text-rose-700',
        Withdrawn: 'bg-stone-100 text-stone-600',
        Completed: 'bg-emerald-100 text-emerald-700',
        NoShow: 'bg-rose-100 text-rose-700',
    };

    const canWithdraw = (status: string) => ['Pending', 'Waitlisted', 'Approved', 'Promoted'].includes(status);

    const groups = {
        Upcoming: apps.filter(a => ['Approved', 'Pending', 'Promoted'].includes(a.status)),
        Waitlisted: apps.filter(a => a.status === 'Waitlisted'),
        Past: apps.filter(a => ['Completed', 'Rejected', 'Withdrawn', 'NoShow'].includes(a.status)),
    };
    type TabKey = keyof typeof groups;
    const tabs: TabKey[] = (['Upcoming', 'Waitlisted', 'Past'] as TabKey[]).filter(t => groups[t].length > 0);
    const [activeTab, setActiveTab] = useState<TabKey>('Upcoming');
    const visibleTab: TabKey = tabs.includes(activeTab) ? activeTab : (tabs[0] ?? 'Upcoming');
    const visibleApps = groups[visibleTab] ?? [];

    const renderCard = (a: ApplicationSummary) => (
        <div key={a.applicationId} className={`bg-white rounded-2xl p-5 shadow-sm border transition-all ${actionId === a.applicationId ? 'border-orange-200 opacity-70' : 'border-stone-100'}`}>
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                    {a.organizationName && (
                        <div className="flex items-center gap-1.5 mb-1">
                            <Building2 className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                            <p className="text-xs text-stone-400 truncate">{a.organizationName}</p>
                        </div>
                    )}
                    <p className="font-bold text-stone-800 text-base leading-snug">{a.opportunityTitle}</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                        <Clock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                        <p className="text-sm text-stone-500">
                            {a.shiftName && <span className="font-medium text-stone-600">{a.shiftName} · </span>}
                            {a.shiftStartTime ? new Date(a.shiftStartTime).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                            {a.shiftStartTime && a.shiftEndTime && <span> · {formatTimeRange(a.shiftStartTime, a.shiftEndTime)}</span>}
                        </p>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                        <Calendar className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                        <p className="text-xs text-stone-400">Applied: {new Date(a.appliedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    </div>
                    {actionId === a.applicationId && (
                        <p className="text-xs text-orange-600 font-semibold mt-2">Processing your request...</p>
                    )}
                </div>
                <div className="flex items-center gap-3 shrink-0 sm:pt-1">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusColors[a.status] || 'bg-stone-100 text-stone-600'}`}>{a.status}</span>
                    {a.status === 'Promoted' && (
                        <button onClick={() => handleAccept(a)} disabled={actionId === a.applicationId}
                            className="px-4 py-2 bg-emerald-500 text-white font-bold rounded-xl text-sm hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1">
                            {actionId === a.applicationId && <Loader2 className="w-3 h-3 animate-spin" />} Accept Invitation
                        </button>
                    )}
                    {canWithdraw(a.status) && (
                        <button onClick={() => setConfirmWithdrawApp(a)} disabled={actionId === a.applicationId}
                            className="px-4 py-2 bg-rose-50 text-rose-600 font-bold rounded-xl text-sm hover:bg-rose-100 disabled:opacity-50 flex items-center gap-1">
                            {actionId === a.applicationId && <Loader2 className="w-3 h-3 animate-spin" />} Withdraw
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div><h1 className="text-3xl font-extrabold text-stone-800">My Applications</h1><p className="text-stone-500 mt-2 text-lg">Track the status of your applications.</p></div>
            {toast && <ActionToast message={toast.message} actions={toast.actions} onClose={() => setToast(null)} />}
            <ConfirmDialog
                open={!!confirmWithdrawApp}
                title="Withdraw Application"
                message={confirmWithdrawApp ? `Withdraw from "${confirmWithdrawApp.opportunityTitle} — ${confirmWithdrawApp.shiftName}"?` : ''}
                confirmLabel="Withdraw"
                onCancel={() => setConfirmWithdrawApp(null)}
                onConfirm={handleWithdrawConfirm}
            />
            {/* Follow prompts for accepted orgs not yet followed */}
            {!loading && (() => {
                const seen = new Set<string>();
                return apps
                    .filter(a => a.status === 'Approved' && a.organizationId && !followedOrgIds.has(a.organizationId) && !dismissedOrgs.has(a.organizationId!))
                    .filter(a => { if (seen.has(a.organizationId!)) return false; seen.add(a.organizationId!); return true; })
                    .map(a => (
                        <div key={a.organizationId} className="flex items-center justify-between gap-4 bg-orange-50 border border-orange-200 rounded-2xl px-5 py-4">
                            <div className="flex items-center gap-3">
                                <Heart className="w-5 h-5 text-orange-500 shrink-0" />
                                <p className="text-sm font-medium text-orange-800">You were accepted at <strong>{a.organizationName}</strong>! Follow them to get notified about future events.</p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <button
                                    onClick={async () => {
                                        if (!auth.linkedGrainId || !a.organizationId) return;
                                        try {
                                            await volunteerService.followOrg(auth.linkedGrainId, a.organizationId);
                                            setFollowedOrgIds(prev => new Set([...prev, a.organizationId!]));
                                        } catch { /* ignore */ }
                                    }}
                                    className="px-4 py-1.5 bg-orange-500 text-white font-bold rounded-xl text-sm hover:bg-orange-600"
                                >Follow</button>
                                <button
                                    onClick={() => {
                                        localStorage.setItem(`vsms_dismiss_follow_${a.organizationId}`, '1');
                                        setDismissedOrgs(prev => new Set([...prev, a.organizationId!]));
                                    }}
                                    className="text-stone-400 hover:text-stone-600 text-lg leading-none"
                                >✕</button>
                            </div>
                        </div>
                    ));
            })()}
            {loading ? <Spinner /> : error ? <ErrorBox msg={error} onRetry={load} /> : apps.length === 0 ? (
                <div className="bg-white rounded-3xl p-10 border border-stone-100 shadow-sm text-center">
                    <p className="text-stone-400 font-medium mb-5">No applications yet.</p>
                    <button
                        onClick={() => onNavigate?.('opportunities')}
                        className="px-5 py-2.5 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600"
                    >
                        Find Opportunities
                    </button>
                </div>
            ) : (
                <>
                    <div className="flex gap-2 border-b border-stone-200">
                        {tabs.map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-2.5 text-sm font-bold rounded-t-xl border-b-2 transition-colors ${visibleTab === tab ? 'border-orange-500 text-orange-600' : 'border-transparent text-stone-500 hover:text-stone-700'}`}
                            >
                                {tab} <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${visibleTab === tab ? 'bg-orange-100 text-orange-600' : 'bg-stone-100 text-stone-500'}`}>{groups[tab].length}</span>
                            </button>
                        ))}
                    </div>
                    <div className="space-y-4">
                        {visibleApps.map(renderCard)}
                    </div>
                </>
            )}
        </div>
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VOLUNTEER ATTENDANCE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const DISPUTABLE = ['NoShow', 'CheckedOut', 'Confirmed'];
export function VolAttendance() {
    const auth = useAuth();
    const [records, setRecords] = useState<AttendanceSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [toast, setToast] = useState('');

    // Dispute modal
    const [disputeId, setDisputeId] = useState<string | null>(null);
    const [disputeReason, setDisputeReason] = useState('');
    const [disputeEvidence, setDisputeEvidence] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const load = useCallback(async () => {
        if (!auth.linkedGrainId) return;
        setLoading(true); setError('');
        try {
            const data = await attendanceService.getByVolunteer(auth.linkedGrainId);
            setRecords(data);
        } catch (err: any) { setError(getErr(err, 'Failed to load attendance')); }
        finally { setLoading(false); }
    }, [auth.linkedGrainId]);

    useEffect(() => { load(); }, [load]);
    const refreshSoon = () => setTimeout(() => { void load(); }, 900);

    const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

    const openDispute = (id: string) => { setDisputeId(id); setDisputeReason(''); setDisputeEvidence(''); };

    const handleSubmitDispute = async () => {
        if (!disputeId || !disputeReason.trim()) return;
        setSubmitting(true);
        try {
            const targetId = disputeId;
            await attendanceService.dispute(disputeId, { reason: disputeReason, evidenceUrl: disputeEvidence });
            setRecords(prev => prev.map(r => r.attendanceId === targetId ? { ...r, status: AttendanceStatus.Disputed } : r));
            setDisputeId(null); showToast('Dispute submitted for review ✅'); refreshSoon();
        } catch (err: any) { showToast(getErr(err, 'Failed to submit dispute')); }
        finally { setSubmitting(false); }
    };

    const statusColors: Record<string, string> = {
        Pending: 'bg-amber-100 text-amber-700', CheckedIn: 'bg-blue-100 text-blue-700',
        CheckedOut: 'bg-emerald-100 text-emerald-700', Confirmed: 'bg-emerald-100 text-emerald-700',
        Disputed: 'bg-rose-100 text-rose-700', Resolved: 'bg-stone-100 text-stone-600', NoShow: 'bg-rose-100 text-rose-700',
    };

    const totalHours = records.reduce((sum, r) => sum + (r.totalHours ?? 0), 0);

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-sm font-medium px-5 py-2.5 rounded-full shadow-xl z-50">{toast}</div>}
            <div><h1 className="text-3xl font-extrabold text-stone-800">My Attendance</h1><p className="text-stone-500 mt-2 text-lg">Your volunteer hour history.</p></div>

            {/* Summary */}
            <div className="bg-gradient-to-r from-amber-400 to-orange-500 rounded-3xl p-8 text-white flex items-center gap-6 shadow-lg shadow-orange-500/20">
                <Clock className="w-12 h-12 opacity-80" />
                <div><p className="text-4xl font-extrabold">{totalHours.toFixed(1)} hrs</p><p className="text-orange-100 font-medium mt-1">{records.length} session{records.length !== 1 ? 's' : ''}</p></div>
            </div>

            {loading ? <Spinner /> : error ? <ErrorBox msg={error} onRetry={load} /> : records.filter(r => r.status !== AttendanceStatus.Pending).length === 0 ? <Empty msg="No attendance records yet." /> : (
                <div className="space-y-4">
                    {records.filter(r => r.status !== AttendanceStatus.Pending).map(r => (
                        <div key={r.attendanceId} className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100">
                            <div className="flex justify-between items-start mb-3">
                                <p className="font-bold text-stone-800">{r.opportunityTitle}</p>
                                <span className={`text-xs font-bold px-3 py-1 rounded-full ${statusColors[r.status] || 'bg-stone-100 text-stone-600'}`}>{r.status}</span>
                            </div>
                            <div className="flex flex-wrap gap-4 text-sm text-stone-400 mb-3">
                                {r.checkInTime && <span>✅ In: {new Date(r.checkInTime).toLocaleString()}</span>}
                                {r.checkOutTime && <span>🔚 Out: {new Date(r.checkOutTime).toLocaleString()}</span>}
                                {r.totalHours > 0 && <span className="text-orange-600 font-bold">⏱ {r.totalHours.toFixed(1)} hrs</span>}
                            </div>
                            {DISPUTABLE.includes(r.status) && r.status !== 'Disputed' && (
                                <button onClick={() => openDispute(r.attendanceId)}
                                    className="text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg hover:bg-amber-100 border border-amber-200 mt-2">
                                    ⚠️ Raise Dispute
                                </button>
                            )}
                            {r.status === 'Pending' && (
                                <GpsCheckInButton attendanceId={r.attendanceId} opportunityId={r.opportunityId} shiftStartTime={r.shiftStartTime} onDone={() => {
                                    setRecords(prev => prev.map(x => x.attendanceId === r.attendanceId ? { ...x, status: AttendanceStatus.CheckedIn } : x));
                                    showToast('Checked in ✅');
                                    refreshSoon();
                                }} />
                            )}
                            {r.status === 'CheckedIn' && (
                                <button onClick={async () => {
                                    try {
                                        await attendanceService.checkOut(r.attendanceId);
                                        setRecords(prev => prev.map(x => x.attendanceId === r.attendanceId ? { ...x, status: AttendanceStatus.CheckedOut } : x));
                                        showToast('Checked out successfully 🔚');
                                        refreshSoon();
                                    } catch (err: any) { showToast(getErr(err, 'Failed to check out')); }
                                }} className="text-xs font-bold text-emerald-600 bg-emerald-50 px-4 py-2 rounded-lg hover:bg-emerald-100 mt-2">
                                    🔚 Check Out
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Dispute Modal */}
            {disputeId && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-md w-full space-y-4">
                        <h3 className="text-xl font-bold text-stone-800">Raise Dispute</h3>
                        <p className="text-stone-500 text-sm">If your attendance record is incorrect (wrong hours, or marked No-Show incorrectly), describe the issue below.</p>
                        <textarea value={disputeReason} onChange={e => setDisputeReason(e.target.value)} placeholder="What's wrong? *" rows={3} className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50 focus:ring-2 focus:ring-amber-400 outline-none resize-none" />
                        <input value={disputeEvidence} onChange={e => setDisputeEvidence(e.target.value)} placeholder="Evidence URL (optional)" className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50 focus:ring-2 focus:ring-amber-400 outline-none" />
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setDisputeId(null)} className="px-4 py-2 bg-stone-100 text-stone-600 font-bold rounded-xl hover:bg-stone-200">Cancel</button>
                            <button onClick={handleSubmitDispute} disabled={!disputeReason.trim() || submitting}
                                className="px-4 py-2 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 disabled:opacity-50 flex items-center gap-2">
                                {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Submit Dispute
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VOLUNTEER CERTIFICATES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function VolCertificates() {
    const auth = useAuth();
    const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [toast, setToast] = useState('');
    const [showConfetti, setShowConfetti] = useState(false);
    const [profile, setProfile] = useState<VolunteerProfile | null>(null);
    const [attendance, setAttendance] = useState<AttendanceSummary[]>([]);
    const [generating, setGenerating] = useState<string | null>(null);
    const [pendingTemplate, setPendingTemplate] = useState<CertificateTemplate | null>(null);
    const [volunteerSignatureName, setVolunteerSignatureName] = useState('');

    const SEEN_KEY = `vsms_seen_certs_${auth.email ?? ''}`;

    const load = useCallback(async () => {
        setLoading(true); setError('');
        try {
            const [tpls, prof, att] = await Promise.all([
                certificateService.getTemplates(),
                auth.linkedGrainId ? volunteerService.getProfile(auth.linkedGrainId) : null,
                auth.linkedGrainId ? attendanceService.getByVolunteer(auth.linkedGrainId) : [],
            ]);
            setTemplates(tpls);
            if (prof) setProfile(prof);
            setAttendance(Array.isArray(att) ? att : []);
            const seen = new Set<string>(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'));
            const newOnes = tpls.filter(t => !seen.has(t.id));
            if (newOnes.length > 0 && seen.size > 0) setShowConfetti(true);
            tpls.forEach(t => seen.add(t.id));
            localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
        } catch (err: any) { setError(getErr(err, 'Failed to load certificates')); }
        finally { setLoading(false); }
    }, [SEEN_KEY, auth.linkedGrainId]);

    useEffect(() => { load(); }, [load]);

    const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

    const handleDownload = async (template: CertificateTemplate, signatureName?: string) => {
        setGenerating(template.id);
        try {
            if (!auth.linkedGrainId) {
                showToast('Volunteer profile is not linked yet.');
                return;
            }
            const volunteerName = profile
                ? `${profile.firstName} ${profile.lastName}`.trim()
                : (auth.email ?? 'Volunteer');
            const districtName = template.organizationName || 'Community Organization';
            const confirmedRecords = attendance.filter(a =>
                a.status === AttendanceStatus.Confirmed || a.status === AttendanceStatus.CheckedOut
            );
            const activities: CertActivity[] = confirmedRecords.map(a => ({
                title: a.opportunityTitle,
                orgName: districtName,
                date: a.checkOutTime ?? a.checkInTime ?? a.shiftStartTime,
                hours: a.totalHours,
            }));
            const totalHours = profile?.totalHours ?? activities.reduce((s, a) => s + a.hours, 0);
            const style = getTemplateStyle(template);
            const issued = await certificateService.issue(
                auth.linkedGrainId,
                template.id,
                signatureName,
            );
            const html = style === 'tracking'
                ? buildTrackingFormHtml(volunteerName, districtName, activities, template, signatureName, issued)
                : buildAwardCertHtml(volunteerName, districtName, totalHours, activities, template, signatureName, issued);
            const win = window.open('', '_blank');
            if (win) { win.document.write(html); win.document.close(); }
            else showToast('Please allow popups to download certificates.');
        } catch (err: any) {
            showToast(getErr(err, 'Failed to generate verified certificate.'));
        } finally {
            setGenerating(null);
        }
    };

    const openDownloadConfirm = (template: CertificateTemplate) => {
        const defaultName = profile
            ? `${profile.firstName} ${profile.lastName}`.trim()
            : '';
        setVolunteerSignatureName(defaultName);
        setPendingTemplate(template);
    };

    const confirmDownload = async () => {
        if (!pendingTemplate) return;
        await handleDownload(pendingTemplate, volunteerSignatureName.trim() || undefined);
        setPendingTemplate(null);
    };

    // Mini thumbnail (same style as coordinator side)
    const CertMiniThumb = ({ t }: { t: CertificateTemplate }) => {
        const p = t.primaryColor || '#F59E0B';
        const a = t.accentColor || '#EA580C';
        const style = getTemplateStyle(t);
        if (style === 'tracking') {
            return (
                <div className="rounded-xl overflow-hidden border mb-4" style={{ height: 90, background: 'white', borderColor: p + '60' }}>
                    <div style={{ height: 9, background: `linear-gradient(90deg,${p},${a})` }} />
                    <div className="p-2">
                        <div style={{ height: 6, background: p + '40', borderRadius: 3, marginBottom: 5, width: '65%' }} />
                        {[0,1,2,3].map(i => (
                            <div key={i} style={{ display: 'flex', gap: 3, marginBottom: 3 }}>
                                <div style={{ height: 4, background: '#e5e7eb', borderRadius: 2, flex: 2 }} />
                                <div style={{ height: 4, background: '#e5e7eb', borderRadius: 2, flex: 1 }} />
                                <div style={{ height: 4, background: p + '50', borderRadius: 2, width: 18 }} />
                            </div>
                        ))}
                    </div>
                </div>
            );
        }
        return (
            <div className="rounded-xl overflow-hidden mb-4" style={{ height: 90, background: 'white', border: `2px solid ${p}60`, position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 7, background: `linear-gradient(90deg,${p},${a})` }} />
                <div style={{ padding: '12px', textAlign: 'center' }}>
                    <div style={{ height: 5, background: p + '60', borderRadius: 3, margin: '4px auto 6px', width: '40%' }} />
                    <div style={{ height: 11, background: p + '30', borderRadius: 3, margin: '0 auto 6px', width: '70%' }} />
                    <div style={{ height: 4, background: '#e5e7eb', borderRadius: 2, margin: '0 auto 3px', width: '55%' }} />
                    <div style={{ display: 'inline-block', height: 8, width: 50, borderRadius: 50, background: `linear-gradient(90deg,${p},${a})`, marginTop: 3 }} />
                </div>
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg,${p},${a})` }} />
            </div>
        );
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            {showConfetti && <Confetti onDone={() => setShowConfetti(false)} />}
            {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-sm font-medium px-5 py-2.5 rounded-full shadow-xl z-50">{toast}</div>}

            <div>
                <h1 className="text-3xl font-extrabold text-stone-800">My Certificates</h1>
                <p className="text-stone-500 mt-2 text-lg">Download your volunteer participation certificates. Your real hours and activities are auto-filled.</p>
            </div>

            {/* Hours summary */}
            {profile && (
                <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-2xl p-5 flex items-center gap-4 border border-orange-100">
                    <div className="p-3 bg-orange-500 rounded-2xl"><Award className="w-6 h-6 text-white" /></div>
                    <div>
                        <p className="text-sm font-semibold text-orange-700">Your Total Confirmed Hours</p>
                        <p className="text-2xl font-extrabold text-stone-800">{profile.totalHours.toFixed(1)} hrs <span className="text-sm font-normal text-stone-500">across {profile.completedOpportunities} opportunities</span></p>
                    </div>
                </div>
            )}

            {loading ? <Spinner /> : error ? <ErrorBox msg={error} onRetry={load} /> : templates.length === 0
                ? <Empty msg="No certificate templates available yet. Ask your coordinator to create one." />
                : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {templates.map(t => {
                            const style = getTemplateStyle(t);
                            return (
                                <div key={t.id} className="bg-white rounded-3xl p-5 shadow-sm border border-stone-100 hover:shadow-lg transition-shadow flex flex-col">
                                    <CertMiniThumb t={t} />
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${style === 'award' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                            {style === 'award' ? 'Certificate' : 'Hours Log'}
                                        </span>
                                        {t.isSystemPreset && <span className="px-2 py-0.5 bg-stone-100 text-stone-500 text-xs font-bold rounded-full">System</span>}
                                    </div>
                                    <h3 className="font-bold text-stone-800 mt-1">{t.name}</h3>
                                    {t.organizationName && <p className="text-xs text-stone-400 mt-0.5">{t.organizationName}</p>}
                                    <p className="text-sm text-stone-500 mt-2 mb-4 flex-1">{t.description}</p>
                                    <button
                                        onClick={() => openDownloadConfirm(t)}
                                        disabled={generating === t.id}
                                        className="w-full py-2.5 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
                                        style={{ background: `linear-gradient(90deg,${t.primaryColor || '#F59E0B'},${t.accentColor || '#EA580C'})` }}
                                    >
                                        {generating === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                        {generating === t.id ? 'Preparing…' : 'Download Certificate'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

            {pendingTemplate && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
                        <div>
                            <h3 className="text-xl font-bold text-stone-800">Confirm Download</h3>
                            <p className="text-sm text-stone-500 mt-1">
                                Add your signature name before generating this {getTemplateStyle(pendingTemplate) === 'award' ? 'certificate' : 'hours log'}.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-stone-600">Volunteer Signature</label>
                            <input
                                value={volunteerSignatureName}
                                onChange={e => setVolunteerSignatureName(e.target.value)}
                                placeholder="Type your name"
                                className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50 focus:ring-2 focus:ring-orange-500 outline-none"
                            />
                            <p className="text-xs text-stone-400">
                                Your typed name will appear in a handwriting-style signature font on the document.
                            </p>
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                onClick={() => setPendingTemplate(null)}
                                className="px-4 py-2 rounded-xl bg-stone-100 text-stone-600 font-bold hover:bg-stone-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDownload}
                                className="px-4 py-2 rounded-xl bg-orange-500 text-white font-bold hover:bg-orange-600"
                            >
                                Download
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VOLUNTEER PROFILE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface VolProfileProps { onNavigate?: (view: ViewName) => void; }

export function VolProfile({ onNavigate }: VolProfileProps) {
    const auth = useAuth();
    const [profile, setProfile] = useState<VolunteerProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', bio: '', linkedInUrl: '' });
    const [toast, setToast] = useState('');

    const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

    const load = useCallback(async () => {
        if (!auth.linkedGrainId) return;
        setLoading(true); setError('');
        try {
            const p = await volunteerService.getProfile(auth.linkedGrainId);
            setProfile(p);
            setForm({ firstName: p.firstName, lastName: p.lastName, email: p.email, phone: p.phone, bio: p.bio, linkedInUrl: p.linkedInUrl ?? '' });
        } catch (err: any) {
            setError(getErr(err, 'Failed to load profile'));
        } finally { setLoading(false); }
    }, [auth.linkedGrainId, auth.userId]);

    useEffect(() => { load(); }, [load]);

    const handleSave = async () => {
        if (!auth.linkedGrainId) return;
        setSaving(true); setError(''); setSuccess('');
        try {
            await volunteerService.updateProfile(auth.linkedGrainId, form);
            setSuccess('Profile updated!');
        } catch (err: any) {
            setError(getErr(err, 'Failed to save profile'));
        } finally { setSaving(false); }
    };

    // Upload Credential
    const [credUrl, setCredUrl] = useState('');
    const [uploadingCred, setUploadingCred] = useState(false);
    const handleUploadCredential = async () => {
        if (!auth.linkedGrainId || !credUrl.trim()) return;
        setUploadingCred(true);
        try {
            await volunteerService.uploadCredential(auth.linkedGrainId, credUrl.trim());
            setCredUrl(''); setSuccess('Credential uploaded! ✅');
        } catch (err: any) { setError(getErr(err, 'Failed to upload credential')); }
        finally { setUploadingCred(false); }
    };

    // Waiver
    const [signingWaiver, setSigningWaiver] = useState(false);
    const handleSignWaiver = async () => {
        if (!auth.linkedGrainId) return;
        setSigningWaiver(true);
        try {
            await volunteerService.signWaiver(auth.linkedGrainId);
            showToast('Waiver signed successfully ✅');
            await load();
        } catch (err: any) { setError(getErr(err, 'Failed to sign waiver')); }
        finally { setSigningWaiver(false); }
    };

    if (loading) return <Spinner />;
    if (error && !profile) return <ErrorBox msg={error} onRetry={load} />;

    const initials = `${form.firstName?.charAt(0) || ''}${form.lastName?.charAt(0) || ''}`.toUpperCase() || '?';

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-sm font-medium px-5 py-2.5 rounded-full shadow-xl z-50">{toast}</div>}
            <div><h1 className="text-3xl font-extrabold text-stone-800">Profile</h1></div>
            {error && <div className="p-3 bg-rose-50 text-rose-600 text-sm font-medium rounded-xl border border-rose-100">{error}</div>}
            {success && <div className="p-3 bg-emerald-50 text-emerald-600 text-sm font-medium rounded-xl border border-emerald-100">{success}</div>}
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-stone-100">
                <div className="flex items-center gap-6 mb-8">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-amber-400 to-orange-500 text-white flex items-center justify-center font-extrabold text-2xl shadow-lg">{initials}</div>
                    <div>
                        <h2 className="text-2xl font-bold text-stone-800">{form.firstName} {form.lastName}</h2>
                        <p className="text-stone-500">{form.email}</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div><label className="block text-sm font-medium text-stone-600 mb-1">First Name</label><input value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50 focus:ring-2 focus:ring-orange-500 outline-none" /></div>
                    <div><label className="block text-sm font-medium text-stone-600 mb-1">Last Name</label><input value={form.lastName} onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50 focus:ring-2 focus:ring-orange-500 outline-none" /></div>
                    <div><label className="block text-sm font-medium text-stone-600 mb-1">Email</label><input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50 focus:ring-2 focus:ring-orange-500 outline-none" /></div>
                    <div><label className="block text-sm font-medium text-stone-600 mb-1">Phone</label><input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50 focus:ring-2 focus:ring-orange-500 outline-none" /></div>
                </div>
                <div className="mt-6">
                    <button onClick={handleSave} disabled={saving} className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-orange-500/20 transition-all flex items-center gap-2 w-fit">
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        {saving ? 'Saving...' : 'Save Profile'}
                    </button>
                </div>
            </div>

            {/* LinkedIn Verification */}
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-stone-100">
                <h3 className="text-xl font-bold text-stone-800 mb-2">LinkedIn Verification</h3>
                <p className="text-stone-500 text-sm mb-4">Add your LinkedIn profile URL and verify your identity. Coordinators will see a verification badge on your applications.</p>
                <div className="mb-4">
                    <label className="block text-sm font-medium text-stone-600 mb-1">LinkedIn URL <span className="text-stone-400 font-normal">(optional)</span></label>
                    <input value={form.linkedInUrl} onChange={e => setForm(p => ({ ...p, linkedInUrl: e.target.value }))} placeholder="https://linkedin.com/in/your-profile" type="url" className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50 focus:ring-2 focus:ring-orange-500 outline-none" />
                </div>
                {profile?.linkedInVerified ? (
                    <span className="flex items-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 font-semibold text-sm rounded-xl border border-blue-200 w-fit">
                        <BadgeCheck className="w-4 h-4" /> LinkedIn Verified
                    </span>
                ) : (
                    <div className="flex items-center gap-3">
                        <a href={`/api/auth/linkedin/url-redirect`}
                            onClick={async (e) => {
                                e.preventDefault();
                                try {
                                    const res = await fetch('/api/auth/linkedin/url', { headers: { Authorization: `Bearer ${localStorage.getItem('vsms_token')}` } });
                                    const { url } = await res.json();
                                    window.location.href = url;
                                } catch { setError('Failed to initiate LinkedIn verification.'); }
                            }}
                            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-colors cursor-pointer w-fit">
                            <ExternalLink className="w-4 h-4" /> Verify with LinkedIn
                        </a>
                        <p className="text-xs text-stone-400">🔒 By connecting LinkedIn, VSMS only confirms your identity. We do not store any LinkedIn data.</p>
                    </div>
                )}
            </div>

            {/* Upload Credential */}
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-stone-100">
                <h3 className="text-xl font-bold text-stone-800 mb-2">Credentials</h3>
                <p className="text-stone-500 text-sm mb-4">Paste the URL of a credential document (e.g. first-aid certificate, background check) hosted in cloud storage.</p>
                <div className="flex gap-3">
                    <input value={credUrl} onChange={e => setCredUrl(e.target.value)} placeholder="https://..." className="flex-1 px-4 py-3 rounded-xl border border-stone-200 bg-stone-50 focus:ring-2 focus:ring-orange-500 outline-none text-sm" />
                    <button onClick={handleUploadCredential} disabled={!credUrl.trim() || uploadingCred}
                        className="px-5 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 disabled:bg-orange-300 flex items-center gap-2 text-sm">
                        {uploadingCred ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />} Submit
                    </button>
                </div>
                {profile?.credentials && profile.credentials.length > 0 && (
                    <div className="mt-4 space-y-2">
                        <p className="text-xs font-bold text-stone-500 uppercase tracking-wide">Uploaded ({profile.credentials.length})</p>
                        {profile.credentials.map((key: string, i: number) => (
                            <a key={i} href={key} target="_blank" rel="noopener noreferrer" className="block text-sm text-orange-600 hover:underline truncate">{key}</a>
                        ))}
                    </div>
                )}
            </div>

            {/* Notification Preferences */}
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-stone-100">
                <h3 className="text-xl font-bold text-stone-800 mb-4">Notification Preferences</h3>
                <p className="text-stone-500 text-sm mb-5">Choose how you'd like to be notified when organizations you follow post new opportunities.</p>
                <div className="space-y-4">
                    {[
                        { key: 'allowEmailNotifications' as const, label: 'Email notifications', desc: 'Receive an email when a followed org opens a new event' },
                        { key: 'allowPushNotifications' as const, label: 'App notifications', desc: 'Receive a push notification in the app' },
                    ].map(({ key, label, desc }) => {
                        const checked = profile?.[key] ?? true;
                        const handleToggle = async () => {
                            if (!auth.linkedGrainId || !profile) return;
                            const next = { ...profile, [key]: !checked };
                            setProfile(next);
                            try {
                                await volunteerService.updatePrivacySettings(auth.linkedGrainId, {
                                    isProfilePublic: next.isProfilePublic,
                                    allowEmail: next.allowEmailNotifications,
                                    allowPush: next.allowPushNotifications,
                                });
                                showToast(`${label} ${!checked ? 'enabled' : 'disabled'}`);
                            } catch {
                                setProfile(profile); // revert
                                showToast('Failed to update preference');
                            }
                        };
                        return (
                            <div key={key} className="flex items-center justify-between p-4 rounded-2xl bg-stone-50 border border-stone-100">
                                <div>
                                    <p className="font-semibold text-stone-700 text-sm">{label}</p>
                                    <p className="text-xs text-stone-400 mt-0.5">{desc}</p>
                                </div>
                                <button
                                    onClick={handleToggle}
                                    className={`relative w-12 h-6 rounded-full transition-colors ${checked ? 'bg-orange-500' : 'bg-stone-200'}`}
                                    aria-pressed={checked}
                                >
                                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Liability Waiver */}
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-stone-100">
                <h3 className="text-xl font-bold text-stone-800 mb-2">Liability Waiver</h3>
                {profile?.waiverSignedAt ? (
                    <div className="flex items-center gap-3 bg-emerald-50 rounded-2xl px-5 py-4 border border-emerald-200">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        <div>
                            <p className="font-bold text-emerald-700 text-sm">Waiver Signed</p>
                            <p className="text-emerald-600 text-xs mt-0.5">Signed on {new Date(profile.waiverSignedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="bg-amber-50 rounded-2xl px-5 py-4 border border-amber-200 text-sm text-amber-800 leading-relaxed">
                            <p className="font-bold mb-2">Volunteer Liability Waiver & Release of Liability</p>
                            <p>By signing this waiver, I acknowledge that I am volunteering of my own free will and agree to release the organization and its coordinators from any liability for injury, loss, or damage arising from my participation in volunteer activities. I confirm that I am physically capable of performing the volunteering duties assigned to me, and I agree to follow all safety guidelines and instructions provided by the organization's staff.</p>
                        </div>
                        <button onClick={handleSignWaiver} disabled={signingWaiver}
                            className="flex items-center gap-2 px-6 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 disabled:bg-orange-300 text-sm">
                            {signingWaiver ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4" />}
                            I Agree &amp; Sign Waiver
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VOLUNTEER SKILLS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function VolSkills() {
    const auth = useAuth();
    const [allSkills, setAllSkills] = useState<Skill[]>([]);
    const [mySkillIds, setMySkillIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [toast, setToast] = useState('');

    const load = useCallback(async () => {
        if (!auth.userId) return;
        setLoading(true); setError('');
        try {
            const [all, mine] = await Promise.all([
                skillService.getAll(),
                skillService.getVolunteerSkills(auth.userId),
            ]);
            setAllSkills(all);
            setMySkillIds(new Set(mine.map(s => s.id)));
        } catch (err: any) {
            setError(getErr(err, 'Failed to load skills'));
        } finally { setLoading(false); }
    }, [auth.userId]);

    useEffect(() => { load(); }, [load]);

    const toggle = async (skill: Skill) => {
        if (!auth.userId) return;
        try {
            if (mySkillIds.has(skill.id)) {
                await skillService.removeSkill(auth.userId, skill.id);
                setMySkillIds(prev => { const s = new Set(prev); s.delete(skill.id); return s; });
                setToast(`Removed: ${skill.name}`);
            } else {
                await skillService.addSkill(auth.userId, skill.id);
                setMySkillIds(prev => new Set([...prev, skill.id]));
                setToast(`Added: ${skill.name}`);
            }
        } catch {
            setToast('Failed to update skill. Please try again.');
        }
        setTimeout(() => setToast(''), 2500);
    };

    // Group by category
    const byCategory = allSkills.reduce<Record<string, Skill[]>>((acc, s) => {
        (acc[s.category || 'General'] ??= []).push(s);
        return acc;
    }, {});

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <h1 className="text-3xl font-extrabold text-stone-800">My Skills</h1>
                <p className="text-stone-500 mt-2 text-lg">Click to add or remove skills from your profile.</p>
            </div>

            {toast && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-sm font-medium px-5 py-2.5 rounded-full shadow-xl z-50 transition-all">
                    {toast}
                </div>
            )}

            {loading ? <Spinner /> : error ? <ErrorBox msg={error} onRetry={load} /> : (
                <div className="space-y-6">
                    {Object.entries(byCategory).map(([category, skills]) => (
                        <div key={category} className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100">
                            <h3 className="text-sm font-bold text-orange-500 uppercase tracking-wider mb-4">{category}</h3>
                            <div className="flex flex-wrap gap-3">
                                {skills.map(skill => {
                                    const selected = mySkillIds.has(skill.id);
                                    return (
                                        <button
                                            key={skill.id}
                                            onClick={() => toggle(skill)}
                                            title={skill.description}
                                            className={`px-4 py-2 rounded-full text-sm font-bold border transition-all ${selected
                                                ? 'bg-orange-500 text-white border-orange-500 shadow-sm shadow-orange-500/30'
                                                : 'bg-stone-50 text-stone-600 border-stone-200 hover:border-orange-300 hover:text-orange-600'
                                                }`}
                                        >
                                            {selected && <span className="mr-1">✓</span>}
                                            {skill.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                    {Object.keys(byCategory).length === 0 && <Empty msg="No skills available. Ask your admin to add some." />}
                </div>
            )}
        </div>
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VOLUNTEER OPPORTUNITY DETAIL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface VolOppDetailProps { oppId: string; onBack: () => void; }
export function VolOpportunityDetail({ oppId, onBack }: VolOppDetailProps) {
    const auth = useAuth();
    const [opp, setOpp] = useState<OpportunityState | null>(null);
    const [myApps, setMyApps] = useState<ApplicationSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [applying, setApplying] = useState<string | null>(null);
    const [toast, setToast] = useState('');
    const [allSkills, setAllSkills] = useState<Skill[]>([]);
    const [mySkillIds, setMySkillIds] = useState<Set<string>>(new Set());
    const [isFollowing, setIsFollowing] = useState(false);
    const [followLoading, setFollowLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true); setError('');
        try {
            const [oppData, appData, skillsData, mySkillsData, profileData] = await Promise.all([
                opportunityService.getById(oppId),
                auth.linkedGrainId ? applicationService.getForVolunteer(auth.linkedGrainId) : Promise.resolve([]),
                skillService.getAll(),
                auth.userId ? skillService.getVolunteerSkills(auth.userId) : Promise.resolve([]),
                auth.linkedGrainId ? volunteerService.getProfile(auth.linkedGrainId) : Promise.resolve(null),
            ]);
            const serverApps = (appData as ApplicationSummary[]).filter((a: ApplicationSummary) => a.opportunityId === oppId);
            setOpp(oppData);
            setAllSkills(skillsData || []);
            setMySkillIds(new Set((mySkillsData || []).map((s: Skill) => s.id)));
            if (profileData && oppData.organizationId) {
                setIsFollowing((profileData.followedOrgIds || []).includes(oppData.organizationId));
            }
            // Keep optimistic temp applications until projection/read model catches up.
            setMyApps(prev => {
                const serverShiftIds = new Set(serverApps.map(a => a.shiftId));
                const optimisticOnly = prev.filter(a => a.applicationId.startsWith('temp-') && !serverShiftIds.has(a.shiftId));
                return [...serverApps, ...optimisticOnly];
            });
        } catch (err: any) {
            setError(getErr(err, 'Failed to load opportunity'));
        } finally { setLoading(false); }
    }, [oppId, auth.linkedGrainId, auth.userId]);

    useEffect(() => { load(); }, [load]);

    const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

    const handleApply = async (shift: Shift) => {
        const volunteerId = auth.linkedGrainId;
        if (!volunteerId) return;
        if (appliedShiftIds.has(shift.shiftId)) {
            showToast('You already applied to this shift.');
            return;
        }
        setApplying(shift.shiftId);
        try {
            // Deterministic key: same volunteer + shift always produces the same key
            // This lets the backend reject true duplicates even across separate clicks
            const key = `${volunteerId}-${shift.shiftId}`;
            await opportunityService.apply(oppId, {
                volunteerId,
                shiftId: shift.shiftId,
                idempotencyKey: key,
            });
            showToast(`Applied to "${shift.name}" ✅`);
            // Optimistic UI: immediately mark applied and bump displayed count.
            setMyApps(prev => {
                if (prev.some(a => a.shiftId === shift.shiftId)) return prev;
                const optimistic: ApplicationSummary = {
                    applicationId: `temp-${shift.shiftId}`,
                    opportunityId: oppId,
                    shiftId: shift.shiftId,
                    opportunityTitle: opp?.info.title ?? '',
                    shiftName: shift.name,
                    shiftStartTime: shift.startTime,
                    shiftEndTime: shift.endTime,
                    volunteerId,
                    volunteerName: 'You',
                    status: ApplicationStatus.Pending,
                    appliedAt: new Date().toISOString(),
                    organizationName: '',
                };
                return [...prev, optimistic];
            });
            setOpp(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    shifts: prev.shifts.map(s => s.shiftId === shift.shiftId
                        ? { ...s, currentCount: Math.min(s.maxCapacity, s.currentCount + 1) }
                        : s),
                };
            });
            // Allow read-model projector a moment, then refresh from server.
            setTimeout(() => { void load(); }, 900);
        } catch (err: any) {
            showToast(getErr(err, 'Failed to apply'));
        } finally { setApplying(null); }
    };

    const appliedShiftIds = new Set(myApps.map((a: ApplicationSummary) => a.shiftId));

    const handleToggleFollow = async () => {
        if (!auth.linkedGrainId || !opp?.organizationId) return;
        setFollowLoading(true);
        try {
            if (isFollowing) {
                await volunteerService.unfollowOrg(auth.linkedGrainId, opp.organizationId);
                setIsFollowing(false);
                showToast('Unfollowed organization');
            } else {
                await volunteerService.followOrg(auth.linkedGrainId, opp.organizationId);
                setIsFollowing(true);
                showToast('Now following this organization!');
            }
        } catch (err: any) {
            showToast(getErr(err, 'Failed to update follow status'));
        } finally { setFollowLoading(false); }
    };

    const statusColors: Record<string, string> = {
        Published: 'bg-emerald-100 text-emerald-700',
        Draft: 'bg-stone-100 text-stone-500',
        InProgress: 'bg-blue-100 text-blue-700',
        Completed: 'bg-emerald-100 text-emerald-700',
        Cancelled: 'bg-rose-100 text-rose-700',
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-sm font-medium px-5 py-2.5 rounded-full shadow-xl z-50">{toast}</div>}
            <button onClick={onBack} className="flex items-center gap-2 text-stone-500 hover:text-orange-600 font-bold transition-colors">
                ← Back to Opportunities
            </button>
            {loading ? <Spinner /> : error ? <ErrorBox msg={error} onRetry={load} /> : opp && (
                <>
                    <div className="bg-white rounded-3xl p-8 shadow-sm border border-stone-100">
                        <div className="flex justify-between items-start mb-4">
                            <span className="text-xs font-bold text-orange-600 bg-orange-50 px-3 py-1 rounded-full">{opp.info.category}</span>
                            <span className={`text-xs font-bold px-3 py-1 rounded-full ${statusColors[opp.status] || 'bg-stone-100 text-stone-500'}`}>{opp.status}</span>
                        </div>
                        <h1 className="text-3xl font-extrabold text-stone-800 mb-3">{opp.info.title}</h1>
                        <p className="text-stone-500 text-lg leading-relaxed mb-6">{opp.info.description}</p>
                        <div className="flex flex-wrap gap-6 text-sm font-medium text-stone-500">
                            <span className="flex items-center gap-2"><Calendar className="w-4 h-4 text-orange-500" />{opp.shifts.length} shift{opp.shifts.length !== 1 ? 's' : ''}</span>
                            <span className="flex items-center gap-2"><User className="w-4 h-4 text-orange-500" />{opp.confirmedVolunteerIds.length} confirmed</span>
                            <span className="flex items-center gap-2"><Clock className="w-4 h-4 text-orange-500" />{opp.waitlistQueue.length} on waitlist</span>
                        </div>
                        {opp.info.tags?.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-4">
                                {opp.info.tags.map((tag: string) => <span key={tag} className="text-xs font-bold bg-stone-100 text-stone-500 px-3 py-1 rounded-full">{tag}</span>)}
                            </div>
                        )}
                        {opp.organizationId && (
                            <div className="flex items-center justify-between mt-5 pt-5 border-t border-stone-100">
                                <div className="flex items-center gap-2 text-sm text-stone-500">
                                    <Building2 className="w-4 h-4 text-orange-400" />
                                    <span className="font-medium">Follow this organization to join their volunteer pool</span>
                                </div>
                                <button
                                    onClick={handleToggleFollow}
                                    disabled={followLoading}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all ${isFollowing ? 'bg-emerald-100 text-emerald-700 hover:bg-rose-50 hover:text-rose-600' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}
                                >
                                    {followLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : isFollowing ? <Heart className="w-4 h-4 fill-current" /> : <Heart className="w-4 h-4" />}
                                    {isFollowing ? 'Following' : 'Follow Org'}
                                </button>
                            </div>
                        )}
                    </div>

                    {(() => {
                        const requiredIds = opp.requiredSkillIds || [];
                        if (requiredIds.length === 0) return null;
                        const reqSkills = requiredIds.map(id => allSkills.find(s => s.id === id)).filter(Boolean) as Skill[];
                        const trainingSkills = reqSkills.filter(s => s.category === 'Training');
                        const regularSkills = reqSkills.filter(s => s.category !== 'Training');
                        const missingTraining = trainingSkills.filter(s => !mySkillIds.has(s.id));
                        return (
                            <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100 space-y-4">
                                <h2 className="text-lg font-bold text-stone-800">Requirements</h2>
                                {missingTraining.length > 0 && (
                                    <div className="flex items-start gap-3 bg-amber-50 rounded-2xl px-4 py-3 border border-amber-200">
                                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-bold text-amber-700 text-sm">Missing Required Training</p>
                                            <p className="text-amber-600 text-xs mt-0.5">You are missing: <span className="font-semibold">{missingTraining.map(s => s.name).join(', ')}</span>. You may still apply but the coordinator will review compliance.</p>
                                        </div>
                                    </div>
                                )}
                                {trainingSkills.length > 0 && (
                                    <div>
                                        <p className="text-xs font-bold text-purple-600 uppercase tracking-wide mb-2">Required Training</p>
                                        <div className="flex flex-wrap gap-2">
                                            {trainingSkills.map(s => {
                                                const has = mySkillIds.has(s.id);
                                                return <span key={s.id} className={`px-3 py-1 rounded-full text-xs font-bold border ${has ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{has ? '✓ ' : '⚠ '}{s.name}</span>;
                                            })}
                                        </div>
                                    </div>
                                )}
                                {regularSkills.length > 0 && (
                                    <div>
                                        <p className="text-xs font-bold text-orange-500 uppercase tracking-wide mb-2">Required Skills</p>
                                        <div className="flex flex-wrap gap-2">
                                            {regularSkills.map(s => {
                                                const has = mySkillIds.has(s.id);
                                                return <span key={s.id} className={`px-3 py-1 rounded-full text-xs font-bold border ${has ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-stone-50 text-stone-500 border-stone-200'}`}>{has ? '✓ ' : ''}{s.name}</span>;
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {myApps.length > 0 && (
                        <div className="bg-orange-50 rounded-2xl p-5 border border-orange-100">
                            <p className="font-bold text-orange-700 mb-2">Your Applications</p>
                            {myApps.map((a: ApplicationSummary) => (
                                <div key={a.applicationId} className="flex items-center justify-between py-1.5">
                                    <span className="text-sm text-stone-700 font-medium">{a.shiftName}</span>
                                    <span className="text-xs font-bold bg-white text-orange-600 px-2 py-0.5 rounded-full border border-orange-200">{a.status}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="space-y-4">
                        <h2 className="text-xl font-bold text-stone-800">Available Shifts</h2>
                        {opp.shifts.length === 0 ? <Empty msg="No shifts added yet." /> : opp.shifts.map((shift: Shift) => {
                            const isApplied = appliedShiftIds.has(shift.shiftId);
                            const isFull = shift.currentCount >= shift.maxCapacity;
                            return (
                                <div key={shift.shiftId} className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex-1">
                                        <p className="font-bold text-stone-800 text-lg">{shift.name}</p>
                                        <p className="text-sm text-stone-500 mt-1">📅 {new Date(shift.startTime).toLocaleString()} — {new Date(shift.endTime).toLocaleString()}</p>
                                        <p className="text-sm text-stone-400 mt-0.5">👥 {shift.currentCount} / {shift.maxCapacity} volunteers</p>
                                    </div>
                                    <div className="shrink-0">
                                        {isApplied
                                            ? <span className="px-5 py-2.5 bg-emerald-50 text-emerald-700 font-bold rounded-xl text-sm border border-emerald-200">✓ Applied</span>
                                            : isFull
                                                ? <span className="px-5 py-2.5 bg-stone-100 text-stone-400 font-bold rounded-xl text-sm">Full</span>
                                                : <button onClick={() => handleApply(shift)} disabled={applying === shift.shiftId}
                                                    className="px-5 py-2.5 bg-orange-500 text-white font-bold rounded-xl text-sm hover:bg-orange-600 shadow-sm disabled:bg-orange-300 flex items-center gap-2">
                                                    {applying === shift.shiftId && <Loader2 className="w-4 h-4 animate-spin" />}
                                                    Apply for this Shift
                                                </button>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VOLUNTEER ORGS BROWSE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function VolOrgs() {
    const auth = useAuth();
    const [orgs, setOrgs] = useState<OrganizationSummary[]>([]);
    const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [actionId, setActionId] = useState<string | null>(null);

    useEffect(() => {
        if (!auth.linkedGrainId) return;
        setLoading(true);
        Promise.all([
            organizationService.listApproved(),
            volunteerService.getProfile(auth.linkedGrainId),
        ]).then(([list, profile]) => {
            setOrgs(list);
            setFollowedIds(new Set(profile.followedOrgIds ?? []));
        }).catch(err => setError(getErr(err, 'Failed to load organizations')))
          .finally(() => setLoading(false));
    }, [auth.linkedGrainId]);

    const handleToggleFollow = async (orgId: string) => {
        if (!auth.linkedGrainId) return;
        setActionId(orgId);
        try {
            if (followedIds.has(orgId)) {
                await volunteerService.unfollowOrg(auth.linkedGrainId, orgId);
                setFollowedIds(prev => { const n = new Set(prev); n.delete(orgId); return n; });
            } else {
                await volunteerService.followOrg(auth.linkedGrainId, orgId);
                setFollowedIds(prev => new Set([...prev, orgId]));
            }
        } catch { /* ignore */ }
        finally { setActionId(null); }
    };

    const filtered = orgs.filter(o =>
        !search || o.name.toLowerCase().includes(search.toLowerCase()) || o.description.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div>
                <h1 className="text-3xl font-extrabold text-stone-800 dark:text-zinc-100">Organizations</h1>
                <p className="text-stone-500 mt-1 text-base">Follow organizations to be notified when they open new volunteer opportunities.</p>
            </div>
            <div className="relative">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                    value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search organizations..."
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-stone-200 bg-white dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-100 focus:ring-2 focus:ring-orange-500 outline-none text-sm"
                />
            </div>
            {loading ? <Spinner /> : error ? <ErrorBox msg={error} /> : filtered.length === 0 ? (
                <Empty msg="No organizations found." />
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map(org => {
                        const following = followedIds.has(org.orgId);
                        const busy = actionId === org.orgId;
                        const tagColors = ['bg-amber-100 text-amber-700','bg-teal-100 text-teal-700','bg-purple-100 text-purple-700','bg-rose-100 text-rose-700','bg-blue-100 text-blue-700'];
                        return (
                            <div key={org.orgId} className="bg-white dark:bg-zinc-900 border border-stone-100 dark:border-zinc-800 rounded-2xl p-5 flex flex-col gap-3 shadow-sm hover:border-orange-200 transition-colors">
                                {/* Header */}
                                <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
                                        <Building2 className="w-5 h-5 text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold text-stone-800 dark:text-zinc-100 text-sm leading-snug">{org.name}</p>
                                            {org.websiteUrl && (
                                                <a href={org.websiteUrl} target="_blank" rel="noreferrer" title="Visit website" onClick={e => e.stopPropagation()} className="text-stone-400 hover:text-orange-500 transition-colors">
                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                </a>
                                            )}
                                            {org.contactEmail && (
                                                <a href={`mailto:${org.contactEmail}`} title={org.contactEmail} onClick={e => e.stopPropagation()} className="text-stone-400 hover:text-orange-500 transition-colors">
                                                    <Mail className="w-3.5 h-3.5" />
                                                </a>
                                            )}
                                        </div>
                                        <p className="text-xs text-stone-400 mt-1 line-clamp-3">{org.description}</p>
                                    </div>
                                </div>
                                {/* Tags */}
                                {org.tags && org.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {org.tags.map((tag, i) => (
                                            <span key={tag} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${tagColors[i % tagColors.length]}`}>{tag}</span>
                                        ))}
                                    </div>
                                )}
                                {/* Latest Announcement */}
                                {org.latestAnnouncementText && (
                                    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2 text-xs text-amber-800 dark:text-amber-300 leading-snug">
                                        <span className="mr-1">📢</span>
                                        <span className="italic">"{org.latestAnnouncementText}"</span>
                                        {org.latestAnnouncementAt && (
                                            <span className="ml-1 text-amber-500 not-italic">· {timeAgo(org.latestAnnouncementAt)}</span>
                                        )}
                                    </div>
                                )}
                                <button
                                    onClick={() => handleToggleFollow(org.orgId)}
                                    disabled={busy}
                                    className={`mt-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50 ${
                                        following
                                            ? 'bg-stone-100 text-stone-600 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-rose-50 hover:text-rose-600'
                                            : 'bg-orange-500 text-white hover:bg-orange-600'
                                    }`}
                                >
                                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className={`w-4 h-4 ${following ? 'fill-current' : ''}`} />}
                                    {following ? '✓ Following' : 'Follow'}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
