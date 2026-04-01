import api from './api';
import { AttendanceRecordState, AttendanceSummary } from '../types/attendance';

export interface DisputeSummary {
    attendanceId: string;
    volunteerId: string;
    volunteerName: string;
    opportunityTitle: string;
    reason: string;
    evidenceUrl: string;
    raisedAt: string;
}

export const attendanceService = {
    getById: async (id: string): Promise<AttendanceRecordState> => {
        const res = await api.get<AttendanceRecordState>(`/api/attendance/${id}`);
        return res.data;
    },

    getByVolunteer: async (volunteerId: string): Promise<AttendanceSummary[]> => {
        const res = await api.get<AttendanceSummary[]>(`/api/attendance/volunteer/${volunteerId}`);
        return res.data;
    },

    getByOpportunity: async (opportunityId: string): Promise<AttendanceSummary[]> => {
        const res = await api.get<AttendanceSummary[]>(`/api/attendance/opportunity/${opportunityId}`);
        return res.data;
    },

    init: async (id: string, data: { volunteerId: string; applicationId: string; opportunityId: string }): Promise<void> => {
        await api.post(`/api/attendance/${id}/init`, data);
    },

    checkIn: async (id: string, data: { lat: number; lon: number; proofPhotoUrl: string }): Promise<void> => {
        await api.post(`/api/attendance/${id}/checkin`, data);
    },

    qrCheckIn: async (id: string, data: { qrToken: string }): Promise<void> => {
        await api.post(`/api/attendance/${id}/qr-checkin`, data);
    },

    checkOut: async (id: string): Promise<void> => {
        await api.post(`/api/attendance/${id}/checkout`);
    },

    dispute: async (id: string, data: { reason: string; evidenceUrl: string }): Promise<void> => {
        await api.post(`/api/attendance/${id}/dispute`, data);
    },

    confirm: async (id: string, data: { supervisorId: string; rating: number }): Promise<void> => {
        await api.post(`/api/attendance/${id}/confirm`, data);
    },

    manualAdjust: async (id: string, data: { coordinatorId: string; newCheckIn: string; newCheckOut: string; reason: string }): Promise<void> => {
        await api.post(`/api/attendance/${id}/adjust`, data);
    },

    getPendingDisputes: async (): Promise<DisputeSummary[]> => {
        const res = await api.get<DisputeSummary[]>('/api/attendance/disputes/pending');
        return res.data;
    },

    resolveDispute: async (id: string, data: { resolverId: string; resolution: string; adjustedHours: number }): Promise<void> => {
        await api.post(`/api/attendance/${id}/resolve`, data);
    },
};

