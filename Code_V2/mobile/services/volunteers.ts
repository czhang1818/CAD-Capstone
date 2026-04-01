import api from './api';
import { AttendanceSummary } from '../types/attendance';

export interface VolunteerProfile {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    bio: string;
    isProfilePublic: boolean;
    impactScore: number;
    totalHours: number;
    completedOpportunities: number;
    credentials: string[];
    isInitialized: boolean;
    backgroundCheckStatus: string;
    waiverSignedAt: string | null;
    followedOrgIds: string[];
    allowEmailNotifications: boolean;
    allowPushNotifications: boolean;
    linkedInUrl?: string;
    linkedInVerified?: boolean;
}

export const volunteerService = {
    getProfile: async (id: string): Promise<VolunteerProfile> => {
        const res = await api.get<VolunteerProfile>(`/api/volunteers/${id}/profile`);
        return res.data;
    },

    updateProfile: async (id: string, data: { firstName: string; lastName: string; email: string; phone: string; bio: string; linkedInUrl?: string }): Promise<void> => {
        await api.put(`/api/volunteers/${id}/profile`, data);
    },

    getApplications: async (id: string): Promise<string[]> => {
        const res = await api.get<string[]>(`/api/volunteers/${id}/applications`);
        return res.data;
    },

    uploadCredential: async (id: string, fileKey: string): Promise<void> => {
        await api.post(`/api/volunteers/${id}/credentials`, { fileKey });
    },

    submitFeedback: async (id: string, data: { opportunityId: string; rating: number; comment: string }): Promise<void> => {
        await api.post(`/api/volunteers/${id}/feedback`, data);
    },

    updatePrivacySettings: async (id: string, data: { isProfilePublic: boolean; allowEmail: boolean; allowPush: boolean }): Promise<void> => {
        await api.put(`/api/volunteers/${id}/privacy`, { isProfilePublic: data.isProfilePublic, allowEmail: data.allowEmail, allowPush: data.allowPush });
    },

    setBackgroundCheckStatus: async (id: string, status: string): Promise<void> => {
        await api.post(`/api/volunteers/${id}/background-check`, { status });
    },

    signWaiver: async (id: string): Promise<{ signedAt: string }> => {
        const res = await api.post<{ signedAt: string }>(`/api/volunteers/${id}/waiver`);
        return res.data;
    },

    registerPushToken: async (id: string, token: string): Promise<void> => {
        await api.post(`/api/volunteers/${id}/push-token`, { token });
    },

    getAttendance: async (id: string): Promise<AttendanceSummary[]> => {
        const res = await api.get<AttendanceSummary[]>(`/api/volunteers/${id}/attendance`);
        return res.data;
    },

    followOrg: async (volunteerId: string, orgId: string): Promise<void> => {
        await api.post(`/api/volunteers/${volunteerId}/follow/${orgId}`);
    },

    unfollowOrg: async (volunteerId: string, orgId: string): Promise<void> => {
        await api.delete(`/api/volunteers/${volunteerId}/follow/${orgId}`);
    },
};

